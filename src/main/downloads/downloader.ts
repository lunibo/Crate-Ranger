import { createWriteStream, existsSync } from 'node:fs'
import { isPreRelease } from '@shared/release'
import { formatDateTime, t } from '../i18n'
import { copyFile, mkdir, rename, rm, stat } from 'node:fs/promises'
import { basename, dirname, extname, join } from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { DownloadJob, JobStatus, Settings } from '@shared/types'
import { FORMAT_EXT } from '@shared/types'
import { ApiError, type SoundScoutApi } from '../api/client'
import type { LibraryStore } from '../library/store'
import { coverForEmbedding, ensureCoverFile } from './cover'
import type { MetadataService } from './metadata'
import { buildTrackPath } from './paths'
import { readEmbeddedPicture, readSoundScoutIds, writeTags } from './tagger'

export interface WorkerContext {
  signal: AbortSignal
  setStatus(status: JobStatus): void
  progress(loaded: number, total: number): void
}

export interface WorkerResult {
  status: 'done' | 'copied' | 'skipped'
  path: string
}

export interface DownloaderDeps {
  api: SoundScoutApi
  metadata: MetadataService
  library: LibraryStore
  settings: () => Settings
}

interface EncodingResponse {
  SignedURL: string
  Expires: string
  Filename: string
}

const ALLOWED_DOWNLOAD_HOSTS = new Set(['storage.googleapis.com'])

/** Lädt einen Track herunter, taggt ihn, legt cover.jpg an und trägt ihn in die Bibliothek ein. */
export async function downloadTrack(deps: DownloaderDeps, job: DownloadJob, ctx: WorkerContext): Promise<WorkerResult> {
  const { api, metadata, library } = deps
  const settings = deps.settings()
  const ext = FORMAT_EXT[job.format]

  ctx.setStatus('preparing')
  // Datei eines anderen Releases (z.B. Single), die für dieses Release kopiert und neu getaggt wird
  let copySource: string | null = null
  if (settings.skipExisting && !job.force) {
    const here = library.existingFile(job.trackId, job.format, job.releaseId)
    if (here) return { status: 'skipped', path: here.path }
    const existing = library.existingFile(job.trackId, job.format)
    if (existing) {
      if (!settings.copyToAllReleases) {
        // Track schon von einem anderen Release vorhanden → diesem Release nur zuordnen
        library.linkRelease(job.releaseId, [job.trackId])
        return { status: 'skipped', path: existing.path }
      }
      copySource = existing.path
    }
  }

  const { meta, row } = await metadata.trackMeta(job.trackId, job.releaseId)
  if (isPreRelease(row.ReleaseDate)) {
    // Kein Encoding-Aufruf vor Release-Tag (zählt nicht aufs Kontingent, wird von SoundScout ohnehin abgelehnt)
    throw Object.assign(new Error(t('errors.preRelease', { date: formatDateTime(row.ReleaseDate!) })), { code: 'prerelease', status: 409 })
  }
  if (copySource) {
    // Release nicht im Katalog des Tracks gefunden → Metadaten gehören zu einem Release, das schon vorhanden ist
    const already = library.existingFile(job.trackId, job.format, meta.releaseId)
    if (already) return { status: 'skipped', path: already.path }
  }
  const target = buildTrackPath(settings.downloadRoot, settings.pathTemplate, meta, ext)
  const dir = dirname(target)

  const register = async (path: string): Promise<void> => {
    const st = await stat(path)
    library.upsertRelease({
      releaseId: meta.releaseId,
      title: meta.releaseTitle,
      artist: meta.releaseArtist,
      year: meta.year,
      catalogId: meta.catalogId,
      type: meta.releaseType,
      trackTotal: meta.trackTotal,
      coverFileId: meta.coverFileId
    })
    library.addFile(
      {
        trackId: meta.trackId,
        releaseId: meta.releaseId,
        title: meta.version ? `${meta.title} (${meta.version})` : meta.title,
        artist: meta.artistsTitle,
        releaseTitle: meta.releaseTitle,
        releaseArtist: meta.releaseArtist,
        trackNumber: meta.trackNumber
      },
      { format: job.format, path, size: st.size, downloadedAt: Date.now() }
    )
  }

  /** Vorhandene Datei in den Ordner dieses Releases kopieren und mit dessen Metadaten + Cover taggen. */
  const copyForRelease = async (source: string): Promise<void> => {
    ctx.setStatus('tagging')
    await mkdir(dir, { recursive: true })
    const partial = join(dir, `${basename(target, extname(target))}.partial.${ext}`)
    try {
      await copyFile(source, partial)
      const cover = await coverForEmbedding(api, meta.releaseId)
      // Ohne Release-Cover (offline o.ä.) bleibt das vorhandene Bild erhalten
      writeTags(partial, meta, cover, !!cover)
      if (settings.saveCoverFile) await ensureCoverFile(dir, cover ?? readEmbeddedPicture(partial), api, meta.releaseId)
      if (existsSync(target)) await rm(target, { force: true })
      await rename(partial, target)
    } catch (e) {
      await rm(partial, { force: true }).catch(() => undefined)
      throw e
    }
    await register(target)
  }

  // Datei liegt schon am Zielort (z.B. Index gelöscht) → nur registrieren, kein Download-Kontingent verbrauchen
  if (settings.skipExisting && !job.force && existsSync(target)) {
    try {
      const ids = readSoundScoutIds(target)
      if (ids?.trackId === job.trackId && (!ids.releaseId || ids.releaseId === meta.releaseId)) {
        await register(target)
        return { status: 'skipped', path: target }
      }
    } catch {
      /* unlesbar → neu laden */
    }
  }

  if (copySource) {
    await copyForRelease(copySource)
    return { status: 'copied', path: target }
  }

  const enc = await api.get<EncodingResponse>(`/release/${meta.releaseId}/track/${meta.trackId}/encoding`, {
    format: job.format
  })
  const url = new URL(enc.SignedURL)
  if (url.protocol !== 'https:' || !ALLOWED_DOWNLOAD_HOSTS.has(url.hostname)) {
    throw new Error(t('errors.unexpectedDownloadHost', { host: url.hostname }))
  }

  await mkdir(dir, { recursive: true })
  const partial = join(dir, `${basename(target, extname(target))}.partial.${ext}`)
  try {
    ctx.setStatus('downloading')
    const res = await api.fetchAbsolute(url.toString(), { signal: ctx.signal })
    if (!res.ok || !res.body) throw new ApiError(t('errors.downloadFailedHttp', { status: res.status }), res.status, 'download.http')
    const total = Number(res.headers.get('content-length')) || 0
    let loaded = 0
    let lastReport = 0
    const counter = new Transform({
      transform(chunk: Buffer, _enc, cb) {
        loaded += chunk.length
        const now = Date.now()
        if (now - lastReport > 200) {
          lastReport = now
          ctx.progress(loaded, total)
        }
        cb(null, chunk)
      }
    })
    await pipeline(Readable.fromWeb(res.body as never), counter, createWriteStream(partial), { signal: ctx.signal })
    ctx.progress(loaded, total || loaded)
    if (total && loaded !== total) {
      throw Object.assign(new Error(t('errors.incompleteDownload', { loaded, total })), { code: 'transfer.incomplete' })
    }

    ctx.setStatus('tagging')
    const embedded = readEmbeddedPicture(partial)
    const forEmbed = embedded ? null : await coverForEmbedding(api, meta.releaseId)
    writeTags(partial, meta, forEmbed)
    if (settings.saveCoverFile) await ensureCoverFile(dir, embedded ?? forEmbed, api, meta.releaseId)

    if (existsSync(target)) await rm(target, { force: true })
    await rename(partial, target)
    await register(target)
    return { status: 'done', path: target }
  } catch (e) {
    await rm(partial, { force: true }).catch(() => undefined)
    throw e
  }
}

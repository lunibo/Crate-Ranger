import { existsSync } from 'node:fs'
import { copyFile, mkdir, readdir, rename, rm, rmdir, unlink } from 'node:fs/promises'
import { dirname, extname, join, resolve } from 'node:path'
import type { LibraryFile, LibraryRefreshProgress, LibraryRefreshResult, Settings } from '@shared/types'
import { FORMAT_EXT } from '@shared/types'
import type { SoundScoutApi } from '../api/client'
import { coverForEmbedding, ensureCoverFile } from '../downloads/cover'
import type { MetadataService } from '../downloads/metadata'
import { buildTrackPath } from '../downloads/paths'
import { readEmbeddedPicture, writeTags } from '../downloads/tagger'
import { t } from '../i18n'
import { isInside } from '../mediaProtocol'
import type { LibraryStore } from './store'

export interface RefreshDeps {
  api: SoundScoutApi
  metadata: MetadataService
  library: LibraryStore
  settings: () => Settings
}

const PARALLEL = 3
const AUDIO_EXT = new Set(['.flac', '.mp3', '.wav'])

const samePath = (a: string, b: string): boolean =>
  process.platform === 'win32' ? resolve(a).toLowerCase() === resolve(b).toLowerCase() : resolve(a) === resolve(b)

async function moveFile(from: string, to: string): Promise<void> {
  await mkdir(dirname(to), { recursive: true })
  try {
    await rename(from, to)
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'EXDEV') throw e
    await copyFile(from, to)
    await unlink(from)
  }
}

/**
 * Räumt einen alten Release-Ordner auf: enthält er keine Audiodateien mehr, werden cover.jpg und
 * der Ordner entfernt, danach leere Elternordner bis zum Download-Ordner. Andere Dateien bleiben unangetastet.
 */
async function cleanupDir(dir: string, root: string): Promise<void> {
  let current = dir
  while (isInside(current, root) && !samePath(current, root)) {
    let entries: string[]
    try {
      entries = await readdir(current)
    } catch {
      return
    }
    if (entries.some((e) => AUDIO_EXT.has(extname(e).toLowerCase()))) return
    const rest = entries.filter((e) => e.toLowerCase() !== 'cover.jpg')
    if (rest.length) return
    if (entries.length) await rm(join(current, entries[0]), { force: true })
    try {
      await rmdir(current)
    } catch {
      return
    }
    current = dirname(current)
  }
}

/**
 * Aktualisiert alle heruntergeladenen Dateien: Metadaten neu von SoundScout holen und schreiben,
 * Datei an den Pfad verschieben, den das aktuelle Ordner-Template ergibt, cover.jpg mitnehmen.
 * Lädt keine Audiodaten herunter – verbraucht also kein Download-Kontingent.
 */
export async function refreshLibrary(
  deps: RefreshDeps,
  onProgress: (p: LibraryRefreshProgress) => void
): Promise<LibraryRefreshResult> {
  const { api, metadata, library } = deps
  const settings = deps.settings()
  const root = settings.downloadRoot
  const items: { trackId: string; releaseId: string; file: LibraryFile }[] = []
  for (const t of Object.values(library.snapshot().tracks)) {
    for (const f of t.files) {
      if (!f.missing && existsSync(f.path)) items.push({ trackId: t.trackId, releaseId: f.releaseId ?? t.releaseId, file: f })
    }
  }

  const result: LibraryRefreshResult = { total: items.length, retagged: 0, moved: 0, failed: 0, errors: [] }
  const oldDirs = new Set<string>()
  let done = 0
  onProgress({ done, total: items.length })

  const handle = async ({ trackId, releaseId, file }: (typeof items)[number]): Promise<void> => {
    const { meta } = await metadata.trackMeta(trackId, releaseId)
    const embedded = readEmbeddedPicture(file.path)
    writeTags(file.path, meta, embedded ? null : await coverForEmbedding(api, meta.releaseId))
    result.retagged++

    let path = file.path
    // Nur Dateien im Download-Ordner werden verschoben – was der Nutzer woanders abgelegt hat, bleibt dort.
    if (root && isInside(file.path, root)) {
      const target = buildTrackPath(root, settings.pathTemplate, meta, FORMAT_EXT[file.format])
      if (target !== file.path) {
        // Gleiche Datei nur in anderer Groß-/Kleinschreibung (Windows) darf umbenannt werden
        if (existsSync(target) && !samePath(target, file.path)) throw new Error(t('errors.targetExists', { path: target }))
        await moveFile(file.path, target)
        oldDirs.add(dirname(file.path))
        path = target
        result.moved++
      }
      if (settings.saveCoverFile) {
        const oldCover = join(dirname(file.path), 'cover.jpg')
        const newCover = join(dirname(path), 'cover.jpg')
        if (!existsSync(newCover) && existsSync(oldCover)) await copyFile(oldCover, newCover)
        else await ensureCoverFile(dirname(path), embedded, api, meta.releaseId)
      }
    }

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
      { ...file, path }
    )
  }

  let next = 0
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const item = items[next++]
      try {
        await handle(item)
      } catch (e) {
        result.failed++
        result.errors.push({ path: item.file.path, error: e instanceof Error ? e.message : String(e) })
      }
      done++
      onProgress({ done, total: items.length, current: item.file.path })
    }
  }
  await Promise.all(Array.from({ length: Math.min(PARALLEL, items.length) }, worker))

  // Erst ganz am Ende aufräumen – mehrere Tracks eines Ordners werden parallel verschoben.
  for (const dir of oldDirs) await cleanupDir(dir, root)
  return result
}

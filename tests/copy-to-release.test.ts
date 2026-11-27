import { describe, expect, it, vi } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { execFileSync } from 'node:child_process'
import focus from './fixtures/catalog-focus.json'
import type { CatalogTrack, DownloadJob, Settings } from '@shared/types'
import { DEFAULT_PATH_TEMPLATE } from '@shared/types'
import { releaseProgress } from '../src/shared/libraryProgress'
import { buildTrackMeta, type TrackMeta } from '../src/main/downloads/meta'
import { buildTrackPath } from '../src/main/downloads/paths'
import { readSoundScoutIds, writeTags } from '../src/main/downloads/tagger'
import { LibraryStore } from '../src/main/library/store'

const png = (n: number): Buffer =>
  Buffer.concat([Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082', 'hex'), Buffer.from([n])])
const albumCover = png(2)
vi.mock('electron', () => ({ nativeImage: { createFromBuffer: () => ({ isEmpty: () => true }) } }))
vi.mock('../src/main/i18n', () => ({ t: (k: string) => k, formatDateTime: (d: string) => d }))
vi.mock('../src/main/downloads/cover', () => ({
  coverForEmbedding: vi.fn(async () => ({ data: albumCover, mimeType: 'image/png' })),
  ensureCoverFile: vi.fn(async () => undefined)
}))
const { downloadTrack } = await import('../src/main/downloads/downloader')

const has = (bin: string): boolean => { try { execFileSync('which', [bin]); return true } catch { return false } }

function setup(copyToAllReleases: boolean) {
  const root = mkdtempSync(join(tmpdir(), 'ss-copy-'))
  const base = buildTrackMeta(focus as CatalogTrack, { trackTotal: 1 })
  const single: TrackMeta = { ...base, trackId: 't1', releaseId: 'r-single', releaseTitle: 'Song', title: 'Song', trackNumber: 1, trackTotal: 1, catalogId: 'S1', folderArtist: 'Artist', releaseArtist: 'Artist' }
  const album: TrackMeta = { ...single, releaseId: 'r-album', releaseTitle: 'The Album', trackNumber: 3, trackTotal: 10, catalogId: 'A1', releaseType: 'Album' }
  const singlePath = buildTrackPath(root, DEFAULT_PATH_TEMPLATE, single, 'flac')
  mkdirSync(dirname(singlePath), { recursive: true })
  execFileSync('ffmpeg', ['-v', 'quiet', '-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', singlePath])
  writeTags(singlePath, single, { data: png(1), mimeType: 'image/png' })
  const library = new LibraryStore(join(root, 'library.json'))
  library.addFile(
    { trackId: 't1', releaseId: 'r-single', title: 'Song', artist: 'Artist', releaseTitle: 'Song', releaseArtist: 'Artist', trackNumber: 1 },
    { format: 'FLAC', path: singlePath, size: 1, downloadedAt: 1 }
  )
  const settings = { downloadRoot: root, pathTemplate: DEFAULT_PATH_TEMPLATE, skipExisting: true, copyToAllReleases, saveCoverFile: true } as Settings
  const api = { get: vi.fn(async () => { throw new Error('no download expected') }) }
  const metadata = { trackMeta: vi.fn(async () => ({ meta: album, row: { ReleaseDate: '2020-01-01T00:00:00Z' } })) }
  const deps = { api: api as never, metadata: metadata as never, library, settings: () => settings }
  const job = { id: 'j', trackId: 't1', releaseId: 'r-album', format: 'FLAC' } as DownloadJob
  const ctx = { signal: new AbortController().signal, setStatus: vi.fn(), progress: vi.fn() }
  return { root, album, singlePath, albumPath: buildTrackPath(root, DEFAULT_PATH_TEMPLATE, album, 'flac'), library, api, deps, job, ctx }
}

describe.skipIf(!has('ffmpeg'))('Track in jedem Release ablegen', () => {
  it('kopiert die vorhandene Datei ins Album und taggt sie mit dessen Metadaten und Cover', async () => {
    const s = setup(true)
    const before = readFileSync(s.singlePath)
    const r = await downloadTrack(s.deps, s.job, s.ctx)

    expect(r).toEqual({ status: 'copied', path: s.albumPath })
    expect(s.api.get).not.toHaveBeenCalled() // kein Encoding-Aufruf → kein Kontingent
    expect(readSoundScoutIds(s.albumPath)).toMatchObject({ trackId: 't1', releaseId: 'r-album', album: 'The Album', track: 3 })
    const { File: TagFile } = await import('node-taglib-sharp')
    const tf = TagFile.createFromPath(s.albumPath)
    expect(Buffer.from(tf.tag.pictures[0].data.toByteArray())).toEqual(albumCover)
    tf.dispose()
    expect(readFileSync(s.singlePath)).toEqual(before) // Original unverändert
    expect(readdirPartial(dirname(s.albumPath))).toEqual([])

    const track = s.library.getTrack('t1')!
    expect(track.releaseId).toBe('r-single') // Haupt-Release bleibt
    expect(track.files.map((f) => [f.releaseId, f.trackNumber])).toEqual([['r-single', 1], ['r-album', 3]])
    expect(releaseProgress(s.library.snapshot(), 'r-album').done).toBe(1)
    expect(releaseProgress(s.library.snapshot(), 'r-single').done).toBe(1)

    // Zweiter Durchlauf: Kopie ist vorhanden → übersprungen
    expect(await downloadTrack(s.deps, s.job, s.ctx)).toEqual({ status: 'skipped', path: s.albumPath })
    expect(s.library.getTrack('t1')!.files).toHaveLength(2)
  })

  it('ordnet ohne die Option nur zu und kopiert nichts', async () => {
    const s = setup(false)
    expect(await downloadTrack(s.deps, s.job, s.ctx)).toEqual({ status: 'skipped', path: s.singlePath })
    expect(existsSync(s.albumPath)).toBe(false)
    expect(s.library.snapshot().links?.['r-album']?.trackIds).toEqual(['t1'])
  })
})

const readdirPartial = (dir: string): string[] => readdirSync(dir).filter((f) => f.includes('.partial.'))

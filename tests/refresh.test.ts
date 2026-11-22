import { describe, expect, it, vi } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import focus from './fixtures/catalog-focus.json'
import type { CatalogTrack, Settings } from '@shared/types'
import { DEFAULT_PATH_TEMPLATE } from '@shared/types'
import { buildTrackMeta, type TrackMeta } from '../src/main/downloads/meta'
import { writeTags } from '../src/main/downloads/tagger'
import { LibraryStore } from '../src/main/library/store'

// cover.ts nutzt Electrons nativeImage – im Test nicht nötig (cover.jpg wird aus dem alten Ordner übernommen)
vi.mock('electron', () => ({ nativeImage: { createFromBuffer: () => ({ isEmpty: () => true }) } }))
vi.mock('../src/main/i18n', () => ({ t: (k: string, o?: Record<string, unknown>) => `${k} ${JSON.stringify(o ?? {})}` }))
const { refreshLibrary } = await import('../src/main/library/refresh')

const has = (bin: string): boolean => { try { execFileSync('which', [bin]); return true } catch { return false } }
const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082', 'hex')

describe.skipIf(!has('ffmpeg'))('refreshLibrary', () => {
  it('retags, moves into the current layout, carries cover.jpg and removes the old folder', async () => {
    const root = mkdtempSync(join(tmpdir(), 'ss-refresh-'))
    // Alt: Ordner mit „feat.“ im Namen, alte Genre-Reihenfolge und \r\n im Songtext
    const oldMeta: TrackMeta = {
      ...buildTrackMeta(focus as CatalogTrack, { trackTotal: 1 }),
      trackId: 't-stronger', releaseId: 'r-stronger', title: 'Stronger', releaseTitle: 'Stronger', year: '2015', catalogId: 'MCS300',
      releaseArtist: 'Stonebank feat. EMEL', folderArtist: 'Stonebank feat. EMEL', artistsTitle: 'Stonebank feat. EMEL',
      genres: ['Dance', 'Happy Hardcore'], lyrics: 'line 1\r\nline 2'
    }
    const oldDir = join(root, 'Stonebank feat. EMEL', '2015 - Stronger [MCS300]')
    mkdirSync(oldDir, { recursive: true })
    const oldFile = join(oldDir, '01 - Stronger.mp3')
    execFileSync('ffmpeg', ['-v', 'quiet', '-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', '-b:a', '128k', oldFile])
    writeTags(oldFile, oldMeta, { data: png, mimeType: 'image/png' })
    writeFileSync(join(oldDir, 'cover.jpg'), 'jpg')

    const library = new LibraryStore(join(root, 'library.json'))
    library.addFile(
      { trackId: 't-stronger', releaseId: 'r-stronger', title: 'Stronger', artist: 'Stonebank feat. EMEL', releaseTitle: 'Stronger', releaseArtist: 'Stonebank feat. EMEL', trackNumber: 1 },
      { format: 'MP3_320', path: oldFile, size: 1, downloadedAt: 1 }
    )
    const newMeta: TrackMeta = { ...oldMeta, folderArtist: 'Stonebank', genres: ['Happy Hardcore', 'Dance'], lyrics: 'line 1\nline 2' }
    const settings = { downloadRoot: root, pathTemplate: DEFAULT_PATH_TEMPLATE, saveCoverFile: true } as Settings
    const metadata = { trackMeta: vi.fn(async () => ({ meta: newMeta, row: {} })) }
    const progress = vi.fn()

    const r = await refreshLibrary({ api: {} as never, metadata: metadata as never, library, settings: () => settings }, progress)

    expect(r).toMatchObject({ total: 1, retagged: 1, moved: 1, failed: 0 })
    const newFile = join(root, 'Stonebank', '2015 - Stronger [MCS300]', '01 - Stronger.mp3')
    expect(existsSync(newFile)).toBe(true)
    expect(existsSync(join(root, 'Stonebank', '2015 - Stronger [MCS300]', 'cover.jpg'))).toBe(true)
    expect(existsSync(join(root, 'Stonebank feat. EMEL'))).toBe(false) // leerer alter Ordner samt cover.jpg entfernt
    expect(library.getTrack('t-stronger')?.files).toEqual([expect.objectContaining({ path: newFile, format: 'MP3_320' })])
    const { File: TagFile } = await import('node-taglib-sharp')
    const tf = TagFile.createFromPath(newFile)
    expect(tf.tag.genres).toEqual(['Happy Hardcore', 'Dance'])
    expect(tf.tag.albumArtists).toEqual(['Stonebank feat. EMEL']) // Tag behält den vollen Namen
    expect(tf.tag.lyrics).toBe('line 1\nline 2')
    expect(tf.tag.pictures).toHaveLength(1) // Cover bleibt erhalten
    tf.dispose()
    expect(progress).toHaveBeenLastCalledWith(expect.objectContaining({ done: 1, total: 1 }))
  })

  it('never overwrites a different file and leaves unrelated files alone', async () => {
    const root = mkdtempSync(join(tmpdir(), 'ss-refresh-'))
    const meta = { ...buildTrackMeta(focus as CatalogTrack, { trackTotal: 2 }), folderArtist: 'Shingo Nakamura' }
    const oldDir = join(root, 'Old Name')
    mkdirSync(oldDir, { recursive: true })
    const oldFile = join(oldDir, 'focus.mp3')
    execFileSync('ffmpeg', ['-v', 'quiet', '-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', '-b:a', '128k', oldFile])
    writeFileSync(join(oldDir, 'notes.txt'), 'mine')
    // Am Zielort liegt schon eine andere Datei
    const targetDir = join(root, 'Shingo Nakamura', '2022 - Focus [MCS1380]')
    mkdirSync(targetDir, { recursive: true })
    writeFileSync(join(targetDir, '01 - Focus.mp3'), 'other')

    const library = new LibraryStore(join(root, 'library.json'))
    library.addFile({ trackId: meta.trackId, releaseId: meta.releaseId, title: 'Focus', artist: 'x', releaseTitle: 'Focus', releaseArtist: 'x', trackNumber: 1 },
      { format: 'MP3_320', path: oldFile, size: 1, downloadedAt: 1 })
    const settings = { downloadRoot: root, pathTemplate: DEFAULT_PATH_TEMPLATE, saveCoverFile: false } as Settings
    const r = await refreshLibrary({ api: {} as never, metadata: { trackMeta: async () => ({ meta, row: {} }) } as never, library, settings: () => settings }, () => {})

    expect(r.failed).toBe(1)
    expect(existsSync(oldFile)).toBe(true)
    expect(readdirSync(oldDir).sort()).toEqual(['focus.mp3', 'notes.txt'])
    expect(library.getTrack(meta.trackId)?.files[0].path).toBe(oldFile)
  })
})

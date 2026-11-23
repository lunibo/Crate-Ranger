import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { releaseProgress } from '../src/shared/libraryProgress'
import { LibraryStore } from '../src/main/library/store'

const dirs: string[] = []
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

function setup(): { lib: LibraryStore; file: (name: string) => string } {
  const dir = mkdtempSync(join(tmpdir(), 'cr-lib-'))
  dirs.push(dir)
  const lib = new LibraryStore(join(dir, 'library.json'))
  const file = (name: string): string => {
    const p = join(dir, name)
    writeFileSync(p, 'x')
    return p
  }
  return { lib, file }
}

const track = (trackId: string, releaseId: string) => ({
  trackId,
  releaseId,
  title: trackId,
  artist: 'A',
  releaseTitle: releaseId,
  releaseArtist: 'A',
  trackNumber: 1
})
const flac = (path: string) => ({ format: 'FLAC' as const, path, size: 1, downloadedAt: 0 })

describe('Release-Fortschritt mit Tracks aus anderen Releases', () => {
  it('zählt über ein Single vorhandene Tracks beim Album mit', () => {
    const { lib, file } = setup()
    lib.upsertRelease({ releaseId: 'album', title: 'Album', artist: 'A', year: '2025', catalogId: '', type: 'Album', trackTotal: 3 })
    lib.addFile(track('t1', 'album'), flac(file('1.flac')))
    lib.addFile(track('t2', 'album'), flac(file('2.flac')))
    lib.addFile(track('t3', 'single'), flac(file('3.flac')))
    expect(releaseProgress(lib.snapshot(), 'album')).toEqual({ done: 2, total: 3 })

    lib.linkRelease('album', ['t3'])
    expect(releaseProgress(lib.snapshot(), 'album')).toEqual({ done: 3, total: 3 })
    expect(releaseProgress(lib.snapshot(), 'single')).toEqual({ done: 1, total: 0 })
    expect(lib.releaseStatus('album').status).toBe('complete')
  })

  it('ignoriert unbekannte und direkt zugehörige Tracks und merkt sich die Trackanzahl', () => {
    const { lib, file } = setup()
    lib.addFile(track('t1', 'album'), flac(file('1.flac')))
    lib.addFile(track('t2', 'single'), flac(file('2.flac')))
    lib.linkRelease('album', ['t1', 't2', 'unknown'], 4)
    expect(lib.snapshot().links?.album).toEqual({ trackIds: ['t2'], trackTotal: 4 })
    expect(releaseProgress(lib.snapshot(), 'album')).toEqual({ done: 2, total: 4 })
  })

  it('zählt fehlende Dateien nicht und bleibt beim alten Release, wenn ein Track umzieht', () => {
    const { lib, file } = setup()
    lib.addFile(track('t1', 'single'), flac(file('a.flac')))
    lib.addFile(track('t1', 'album'), { ...flac(file('b.flac')), format: 'MP3_320' as const })
    expect(releaseProgress(lib.snapshot(), 'single').done).toBe(1)
    expect(releaseProgress(lib.snapshot(), 'album').done).toBe(1)
    lib.snapshot().tracks.t1.files.forEach((f) => (f.missing = true))
    expect(releaseProgress(lib.snapshot(), 'album').done).toBe(0)
  })
})

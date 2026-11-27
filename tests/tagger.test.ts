import { beforeAll, describe, expect, it } from 'vitest'
import { copyFileSync, existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import focus from './fixtures/catalog-focus.json'
import type { CatalogTrack } from '@shared/types'
import { buildTrackMeta } from '../src/main/downloads/meta'
import { readEmbeddedPicture, readSoundScoutIds, writeTags } from '../src/main/downloads/tagger'
import { File as TagFile } from 'node-taglib-sharp'

const REAL_FLAC = process.env.SS_TEST_FLAC ?? ''
const has = (bin: string): boolean => { try { execFileSync('which', [bin]); return true } catch { return false } }
const meta = buildTrackMeta(focus as CatalogTrack, { trackTotal: 2, tagCategories: { calm: 'moods', beach: 'usages', synth: 'instruments' } })
const dir = mkdtempSync(join(tmpdir(), 'ss-tag-'))
const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082', 'hex')

function ffprobeTags(path: string): Record<string, string> {
  const out = execFileSync('ffprobe', ['-v', 'quiet', '-print_format', 'json', '-show_format', path]).toString()
  const tags = JSON.parse(out).format.tags ?? {}
  return Object.fromEntries(Object.entries(tags).map(([k, v]) => [k.toUpperCase(), String(v)]))
}

describe.skipIf(!REAL_FLAC || !existsSync(REAL_FLAC))('tagger on real SoundScout FLAC', () => {
  const f = join(dir, 'real.flac')
  beforeAll(() => { copyFileSync(REAL_FLAC, f); writeTags(f, meta, null) })
  it('removes the leading ID3 header', () => {
    expect(readFileSync(f).subarray(0, 4).toString('latin1')).toBe('fLaC')
  })
  it('keeps audio intact', () => {
    const md5 = (p: string): string => execFileSync('metaflac', ['--show-md5sum', p]).toString().trim()
    expect(md5(f)).toBe(md5(REAL_FLAC))
    execFileSync('flac', ['-t', '-s', f])
  })
  it('writes all fields', () => {
    const tags = execFileSync('metaflac', ['--export-tags-to=-', f]).toString()
    for (const line of ['TITLE=Focus', 'ALBUMARTIST=Shingo Nakamura', 'GENRE=Dance', 'GENRE=Melodic House & Techno', 'DATE=2022-04-20', 'TRACKNUMBER=1', 'TRACKTOTAL=2', 'BPM=118', 'INITIALKEY=Am', 'ISRC=CA6D22200180', 'CATALOGNUMBER=MCS1380', 'BARCODE=742779542823', 'LABEL=Monstercat', 'GROUPING=Silk', 'COPYRIGHT=℗ 2022 Monstercat', 'MOOD=calm', 'SOUNDSCOUT_TRACK_ID=53088d3f-f0d7-4c6a-8eed-c5eff39164ae']) {
      expect(tags).toContain(line)
    }
  })
  it('keeps the embedded cover and reads IDs back', () => {
    expect(readEmbeddedPicture(f)?.mimeType).toMatch(/^image\/(png|jpeg)$/)
    expect(readSoundScoutIds(f)?.trackId).toBe(meta.trackId)
  })
})

describe.skipIf(!has('ffmpeg'))('tagger on generated MP3/WAV', () => {
  for (const ext of ['mp3', 'wav']) {
    it(`writes ID3v2 tags to ${ext}`, () => {
      const f = join(dir, `gen.${ext}`)
      execFileSync('ffmpeg', ['-v', 'quiet', '-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', ...(ext === 'mp3' ? ['-b:a', '320k'] : []), f])
      writeTags(f, meta, { data: png, mimeType: 'image/png' })
      const t = ffprobeTags(f)
      expect(t.TITLE).toBe('Focus')
      expect(t.ALBUM_ARTIST ?? t.ALBUMARTIST).toBe('Shingo Nakamura')
      const tf = TagFile.createFromPath(f); expect(tf.tag.genres).toEqual(['Melodic House & Techno', 'Dance']); expect(tf.tag.beatsPerMinute).toBe(118); tf.dispose()
      expect(t.DATE ?? t.TDRC).toContain('2022')
      expect(t.TKEY ?? t.INITIALKEY).toBe('Am')
      expect(t.SOUNDSCOUT_TRACK_ID).toBe(meta.trackId)
      expect(readEmbeddedPicture(f)?.mimeType).toBe('image/png')
      expect(readSoundScoutIds(f)?.trackId).toBe(meta.trackId)
    })
  }
})

describe.skipIf(!has('ffmpeg'))('Artist-IDs in Datei-Tags', () => {
  const duo = buildTrackMeta({
    ...(focus as CatalogTrack),
    ArtistsTitle: 'Slushii & Tokyo Machine',
    Artists: [
      { ID: 'id-slushii', Name: 'Slushii', URL: 'slushii', Role: 'Primary' },
      { ID: 'id-tm', Name: 'Tokyo Machine', URL: 'tokyomachine', Role: 'Primary' }
    ]
  })
  for (const ext of ['flac', 'mp3', 'wav']) {
    it(`schreibt und liest mehrere Artists mit IDs (${ext})`, () => {
      const f = join(dir, `duo.${ext}`)
      execFileSync('ffmpeg', ['-v', 'quiet', '-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', f])
      writeTags(f, duo, null)
      expect(readSoundScoutIds(f)?.artists).toEqual([
        { id: 'id-slushii', name: 'Slushii', uri: 'slushii' },
        { id: 'id-tm', name: 'Tokyo Machine', uri: 'tokyomachine' }
      ])
      // Ohne IDs (z.B. Fallback auf ArtistsTitle) → Felder werden beim Neu-Taggen entfernt
      writeTags(f, { ...duo, artistRefs: [] }, null)
      expect(readSoundScoutIds(f)?.artists).toEqual([])
    })
  }
})

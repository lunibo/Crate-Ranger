import { describe, expect, it } from 'vitest'
import { join } from 'node:path'
import focus from './fixtures/catalog-focus.json'
import type { CatalogTrack } from '@shared/types'
import { DEFAULT_PATH_TEMPLATE } from '@shared/types'
import { buildTrackMeta, localReleaseDate, mainArtist, normalizeLyrics, orderGenres, parseKey, withVersion } from '../src/main/downloads/meta'
import { buildTrackPath, sanitizeSegment } from '../src/main/downloads/paths'

const cats = { calm: 'moods', dreamy: 'moods', beach: 'usages', summer: 'usages', synth: 'instruments', drums: 'instruments' }

describe('meta', () => {
  it('parses musical keys', () => {
    expect(parseKey(['2010s', 'A minor'])).toBe('Am')
    expect(parseKey(['F# major'])).toBe('F#')
    expect(parseKey(['Bb minor'])).toBe('Bbm')
    expect(parseKey(['calm'])).toBe('')
  })
  it('uses the release time zone for the date', () => {
    expect(localReleaseDate('2022-04-20T07:00:00.917Z', 'America/Vancouver')).toBe('2022-04-20')
    expect(localReleaseDate('2022-04-20T03:00:00Z', 'America/Vancouver')).toBe('2022-04-19')
    expect(localReleaseDate('0001-01-01T00:00:00Z')).toBe('')
  })
  it('maps a real catalog row', () => {
    const m = buildTrackMeta(focus as CatalogTrack, { trackTotal: 2, tagCategories: cats })
    expect(m.title).toBe('Focus')
    expect(m.releaseArtist).toBe('Shingo Nakamura')
    expect(m.artists).toEqual(['Shingo Nakamura'])
    expect(m.genres).toEqual(['Melodic House & Techno', 'Dance'])
    expect(m.year).toBe('2022')
    expect(m.releaseDate).toBe('2022-04-20')
    expect(m.key).toBe('Am')
    expect(m.catalogId).toBe('MCS1380')
    expect(m.upc).toBe('742779542823')
    expect(m.label).toBe('Monstercat')
    expect(m.brand).toBe('Silk')
    expect(m.copyright).toBe('℗ 2022 Monstercat')
    expect(m.moods).toEqual(expect.arrayContaining(['calm', 'dreamy']))
    expect(m.usages).toEqual(expect.arrayContaining(['beach', 'summer']))
    expect(m.otherTags).not.toContain('A minor')
    expect(m.trackTotal).toBe(2)
    expect(m.bpm).toBe(118)
  })
  it('puts the specific genre before the umbrella genre', () => {
    expect(orderGenres(['Dance', 'Dubstep'])).toEqual(['Dubstep', 'Dance'])
    expect(orderGenres(['Dance', 'Electronic'])).toEqual(['Electronic', 'Dance'])
    expect(orderGenres(['Dance'])).toEqual(['Dance'])
    expect(orderGenres(['House', 'Dance', 'House'])).toEqual(['House', 'Dance'])
  })
  it('removes featured artists for the folder artist', () => {
    const roles = (list: [string, string][]) => list.map(([DisplayName, Role], i) => ({ ReleaseID: 'r', ArtistID: String(i), DisplayName, Role, ArtistNumber: i + 1 }))
    expect(mainArtist('Stonebank feat. EMEL')).toBe('Stonebank')
    expect(mainArtist('Darren Styles & Stonebank feat. EMEL')).toBe('Darren Styles & Stonebank')
    expect(mainArtist('xander. ft. WHIPPED CREAM & Ehiorobo')).toBe('xander.')
    expect(mainArtist('Botnek & I See MONSTAS')).toBe('Botnek & I See MONSTAS')
    // Anzeigename-Reihenfolge bleibt, auch wenn die Rollenliste anders sortiert ist
    expect(mainArtist('WHIPPED CREAM & No/Me', roles([['No/Me', 'Primary'], ['WHIPPED CREAM', 'Primary']]))).toBe('WHIPPED CREAM & No/Me')
    // Featured ohne „feat.“ im Namen → nur Hauptartists
    expect(mainArtist('Stonebank & EMEL', roles([['Stonebank', 'Primary'], ['EMEL', 'Featured']]))).toBe('Stonebank')
  })
  it('normalizes lyrics line breaks', () => {
    expect(normalizeLyrics('a\r\nb  \r\n\rc\n')).toBe('a\nb\n\nc')
  })
  it('appends versions once', () => {
    expect(withVersion('Focus', 'Extended Mix')).toBe('Focus (Extended Mix)')
    expect(withVersion('Focus (Extended Mix)', 'Extended Mix')).toBe('Focus (Extended Mix)')
    expect(withVersion('Focus', '')).toBe('Focus')
  })
})

describe('paths', () => {
  const base = buildTrackMeta(focus as CatalogTrack, { trackTotal: 2 })
  it('builds the default layout', () => {
    expect(buildTrackPath('/music', DEFAULT_PATH_TEMPLATE, base, 'flac')).toBe(
      join('/music', 'Shingo Nakamura', '2022 - Focus [MCS1380]', '01 - Focus.flac')
    )
  })
  it('files featured releases under the main artist, keeps the full name available', () => {
    const m = { ...base, releaseArtist: 'Stonebank feat. EMEL', folderArtist: 'Stonebank', artistsTitle: 'Stonebank feat. EMEL', title: 'Stronger', releaseTitle: 'Stronger', catalogId: 'MCS300', year: '2015' }
    expect(buildTrackPath('/music', DEFAULT_PATH_TEMPLATE, m, 'flac')).toBe(join('/music', 'Stonebank', '2015 - Stronger [MCS300]', '01 - Stronger.flac'))
    expect(buildTrackPath('/music', '{releaseArtistFull}/{trackNo} - {title}', m, 'flac')).toBe(join('/music', 'Stonebank feat. EMEL', '01 - Stronger.flac'))
  })
  it('adds the track artist on compilations and versions', () => {
    const m = { ...base, artistsTitle: 'Feint', version: 'VIP', releaseArtist: 'Various Artists', folderArtist: 'Various Artists', releaseTitle: 'Best of 2022', catalogId: '' , trackNumber: 12 }
    expect(buildTrackPath('/music', DEFAULT_PATH_TEMPLATE, m, 'mp3')).toBe(
      join('/music', 'Various Artists', '2022 - Best of 2022', '12 - Feint - Focus (VIP).mp3')
    )
  })
  it('sanitizes Windows-invalid names', () => {
    expect(sanitizeSegment('AC/DC: "Live"?*')).toBe("AC-DC - 'Live'")
    expect(sanitizeSegment('CON')).toBe('CON_')
    expect(sanitizeSegment('Title...  ')).toBe('Title')
    expect(sanitizeSegment('a'.repeat(300)).length).toBe(120)
  })
  it('keeps total path length below 240', () => {
    const m = { ...base, title: 'x'.repeat(200), releaseTitle: 'y'.repeat(110), releaseArtist: 'z'.repeat(110), folderArtist: 'z'.repeat(110) }
    expect(buildTrackPath('C:/Users/someone/Music/SoundScout', DEFAULT_PATH_TEMPLATE, m, 'flac').length).toBeLessThanOrEqual(240)
  })
})

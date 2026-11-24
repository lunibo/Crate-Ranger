import { stripFeaturing } from '@shared/artists'
import type { ArtistRef, CatalogTrack, ReleaseArtist } from '@shared/types'

/** Normalisierte Metadaten eines Tracks – Grundlage für Dateipfad und Tags. */
export interface TrackMeta {
  trackId: string
  releaseId: string
  title: string
  version: string
  artistsTitle: string
  artists: string[]
  /** Artists mit IDs, gleiche Reihenfolge wie `artists` – leer, wenn SoundScout keine IDs liefert */
  artistRefs: ArtistRef[]
  releaseArtist: string
  /** Release-Artist ohne Featured-Artists („Stonebank feat. EMEL“ → „Stonebank“) – für Ordnernamen */
  folderArtist: string
  releaseTitle: string
  releaseVersion: string
  releaseType: string
  trackNumber: number
  trackTotal: number
  releaseDate: string // YYYY-MM-DD (in Release-Zeitzone)
  year: string
  genres: string[]
  bpm: number
  key: string // z.B. "Am", "F#m", "C"
  isrc: string
  upc: string
  catalogId: string
  label: string
  brand: string
  copyright: string
  moods: string[]
  usages: string[]
  instruments: string[]
  otherTags: string[]
  lyrics: string
  lyricsLanguage: string
  explicit: boolean
  creatorSafe: boolean
  performanceType: string
  coverFileId: string
}

const KEY_RE = /^([A-G])(#|b)?\s+(major|minor)$/i

/** "A minor" → "Am", "F# major" → "F#" (Schreibweise für TKEY / INITIALKEY). */
export function parseKey(tags: string[]): string {
  for (const t of tags) {
    const m = KEY_RE.exec(t.trim())
    if (m) return m[1].toUpperCase() + (m[2] ?? '') + (m[3].toLowerCase() === 'minor' ? 'm' : '')
  }
  return ''
}

/** Datum im Kalender der Release-Zeitzone (Monstercat veröffentlicht z.B. 07:00Z = 0:00 Vancouver). */
export function localReleaseDate(iso: string | undefined, timeZone?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime()) || d.getUTCFullYear() < 1000) return ''
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timeZone || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(d)
    const get = (t: string): string => parts.find((p) => p.type === t)?.value ?? ''
    return `${get('year')}-${get('month')}-${get('day')}`
  } catch {
    return iso.slice(0, 10)
  }
}

const uniq = (xs: string[]): string[] => [...new Set(xs.map((x) => x.trim()).filter(Boolean))]

/** SoundScout liefert „Dance“ als Obergenre vor dem eigentlichen Genre → das genaue Genre zuerst. */
const UMBRELLA_GENRES = new Set(['dance'])
export function orderGenres(genres: string[]): string[] {
  const list = uniq(genres)
  const specific = list.filter((g) => !UMBRELLA_GENRES.has(g.toLowerCase()))
  return [...specific, ...list.filter((g) => UMBRELLA_GENRES.has(g.toLowerCase()))]
}

/** Release-Artist ohne Featured-Artists, Reihenfolge wie im Anzeigenamen. */
export function mainArtist(releaseArtist: string, releaseArtists: ReleaseArtist[] = []): string {
  const stripped = stripFeaturing(releaseArtist)
  if (stripped && stripped !== releaseArtist.trim()) return stripped
  // Kein „feat.“ im Namen, aber Featured-Artists bekannt → nur die Hauptartists
  const featured = releaseArtists.filter((a) => a.Role === 'Featured')
  const primary = releaseArtists.filter((a) => a.Role === 'Primary').sort((a, b) => a.ArtistNumber - b.ArtistNumber)
  if (featured.length && primary.length && featured.some((a) => releaseArtist.includes(a.DisplayName))) {
    return primary.map((a) => a.DisplayName).join(' & ')
  }
  return releaseArtist.trim()
}

/** Einheitliche Zeilenumbrüche (SoundScout liefert teils \r\n), keine Leerzeichen am Zeilenende. */
export function normalizeLyrics(s: string): string {
  return s.replace(/\r\n?/g, '\n').replace(/[ \t]+$/gm, '').trim()
}

export type TagCategoryMap = Record<string, string> // tag (lowercase) → category (moods|usages|instruments|…)

export function buildTrackMeta(
  t: CatalogTrack,
  opts: { trackTotal?: number; releaseArtists?: ReleaseArtist[]; tagCategories?: TagCategoryMap } = {}
): TrackMeta {
  const tags = t.Tags ?? []
  const cats = opts.tagCategories ?? {}
  const key = parseKey(tags)
  const moods: string[] = []
  const usages: string[] = []
  const instruments: string[] = []
  const other: string[] = []
  for (const tag of tags) {
    if (KEY_RE.test(tag)) continue
    const c = cats[tag.toLowerCase()]
    if (c === 'moods') moods.push(tag)
    else if (c === 'usages') usages.push(tag)
    else if (c === 'instruments') instruments.push(tag)
    else other.push(tag)
  }
  const releaseDate = localReleaseDate(t.ReleaseDate, t.ReleaseDateTimezone)
  const year = releaseDate.slice(0, 4)
  const genres = orderGenres((t.Genres?.length ? t.Genres : (t.ReleaseGenres ?? [])).map((g) => g.Title))
  const artists = t.Artists?.length
    ? uniq(t.Artists.map((a) => a.Name))
    : uniq([t.ArtistsTitle])
  const artistRefs: ArtistRef[] = []
  for (const name of t.Artists?.length ? artists : []) {
    const a = t.Artists!.find((x) => x.Name.trim() === name && x.ID)
    if (!a) {
      artistRefs.length = 0 // nur vollständig zuordenbar schreiben, sonst passen ARTISTS und IDs nicht zusammen
      break
    }
    artistRefs.push({ id: a.ID, name, uri: a.URL ?? '' })
  }
  const primaryReleaseArtists = (opts.releaseArtists ?? [])
    .filter((a) => a.Role === 'Primary')
    .sort((a, b) => a.ArtistNumber - b.ArtistNumber)
    .map((a) => a.DisplayName)
  const releaseArtist = t.ReleaseArtistsTitle || primaryReleaseArtists.join(' & ') || t.ArtistsTitle
  const pline = (t.ReleaseCopyrightPLine ?? '').trim()
  return {
    trackId: t.TrackID,
    releaseId: t.ReleaseID,
    title: t.Title?.trim() ?? '',
    version: t.Version?.trim() ?? '',
    artistsTitle: t.ArtistsTitle?.trim() ?? '',
    artists,
    artistRefs,
    releaseArtist: releaseArtist.trim(),
    folderArtist: mainArtist(releaseArtist, opts.releaseArtists),
    releaseTitle: (t.ReleaseTitle ?? '').trim(),
    releaseVersion: (t.ReleaseVersion ?? '').trim(),
    releaseType: t.ReleaseType ?? '',
    trackNumber: t.TrackNumber ?? 0,
    trackTotal: opts.trackTotal ?? 0,
    releaseDate,
    year,
    genres,
    bpm: Math.round(t.PublicBPM ?? t.BPM ?? 0) || 0,
    key,
    isrc: t.ISRC ?? '',
    upc: t.ReleaseUPC ?? '',
    catalogId: t.ReleaseCatalogID ?? '',
    label: t.LabelTitle || 'Monstercat',
    brand: t.BrandTitle ?? '',
    copyright: pline ? `℗ ${year ? year + ' ' : ''}${pline}` : '',
    moods: uniq(moods),
    usages: uniq(usages),
    instruments: uniq(instruments),
    otherTags: uniq(other),
    lyrics: normalizeLyrics(t.Lyrics ?? ''),
    lyricsLanguage: t.LyricsLanguage ?? '',
    explicit: !!t.IsExplicit,
    creatorSafe: !!t.IsCreatorFriendly,
    performanceType: t.PerformanceType ?? '',
    coverFileId: t.ReleaseCoverFileID ?? ''
  }
}

export const withVersion = (title: string, version: string): string =>
  version && !title.toLowerCase().includes(`(${version.toLowerCase()})`) ? `${title} (${version})` : title

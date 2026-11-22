import { isPreRelease } from '@shared/release'
import type {
  Artist,
  CatalogTrack,
  Genre,
  GenreDistribution,
  LabelDistribution,
  ListResponse,
  NamesResponse,
  Playlist,
  PlaylistItem,
  Release,
  ReleaseArtist,
  SearchResponse,
  TagDistribution,
  TagInfo
} from '@shared/types'

const API = 'https://www.soundscout.com/api'

export const TRACK_COLUMNS = [
  'TrackID', 'Title', 'Version', 'Artists', 'ArtistsTitle', 'PublicDuration', 'PublicBPM', 'Genres',
  'IsCreatorFriendly', 'IsExplicit', 'IsFavorite', 'BrandTitle', 'LabelTitle', 'TrackNumber', 'ReleaseID',
  'ReleaseTitle', 'ReleaseVersion', 'ReleaseArtistsTitle', 'ReleaseDate', 'ReleaseType', 'ReleaseCatalogID',
  'ReleaseCoverFileID', 'Tags'
]

const get = <T>(path: string, params?: Record<string, unknown>): Promise<T> =>
  window.ss.api.get<T>(path, params as never)
const post = <T>(path: string, body?: unknown, params?: Record<string, unknown>): Promise<T> =>
  window.ss.api.post<T>(path, body, params as never)

/** Vereinheitlichte Track-Darstellung für Listen & Player. */
export interface TrackLite {
  trackId: string
  releaseId: string
  title: string
  version: string
  artistsTitle: string
  artists: { id: string; name: string; uri: string }[]
  releaseTitle: string
  releaseArtist: string
  releaseDate: string
  releaseType: string
  coverFileId: string
  duration: number
  bpm: number
  genres: string[]
  tags: string[]
  creatorSafe: boolean
  explicit: boolean
  favorite: boolean
  brand: string
  trackNumber: number
  /** Release-Zeitpunkt liegt in der Zukunft → noch nicht herunterladbar */
  preRelease: boolean
  /** von „Endlos hören“ angehängt */
  autoplay?: boolean
}

export function toTrack(t: CatalogTrack): TrackLite {
  return {
    trackId: t.TrackID,
    releaseId: t.ReleaseID,
    title: t.Title,
    version: t.Version ?? '',
    artistsTitle: t.ArtistsTitle,
    artists: (t.Artists ?? []).map((a) => ({ id: a.ID, name: a.Name, uri: a.URL })),
    releaseTitle: t.ReleaseTitle ?? '',
    releaseArtist: t.ReleaseArtistsTitle ?? '',
    releaseDate: t.ReleaseDate ?? '',
    releaseType: t.ReleaseType ?? '',
    coverFileId: t.ReleaseCoverFileID ?? '',
    duration: t.PublicDuration ?? t.Duration ?? 0,
    bpm: t.PublicBPM ?? t.BPM ?? 0,
    genres: (t.Genres ?? []).map((g) => g.Title).filter((g) => g !== 'Dance' || (t.Genres ?? []).length === 1),
    tags: t.Tags ?? [],
    creatorSafe: !!t.IsCreatorFriendly,
    explicit: !!t.IsExplicit,
    favorite: !!t.IsFavorite,
    brand: t.BrandTitle ?? '',
    trackNumber: t.TrackNumber ?? 0,
    preRelease: isPreRelease(t.ReleaseDate)
  }
}

// ---------- Bilder ----------
export const releaseCover = (releaseId: string, width = 300, fileId?: string): string =>
  `${API}/release/${releaseId}/cover?width=${width}${fileId ? `&fileID=${fileId}` : ''}`
export const fileCover = (fileId: string, width = 300): string => `${API}/file/${fileId}/cover?width=${width}`
export const artistImage = (artistId: string, width = 300): string => `${API}/artist/${artistId}/cover?width=${width}`

// ---------- Katalog ----------
export interface CatalogFilter {
  sort?: string
  genres?: string[]
  moods?: string[]
  usages?: string[]
  instruments?: string[]
  release_types?: string[]
  creator_safe?: boolean
  bpm_min?: number
  bpm_max?: number
  query_id?: string
}

export const catalog = (f: CatalogFilter, offset = 0, limit = 50): Promise<ListResponse<CatalogTrack>> =>
  get('/catalog', { ...f, creator_safe: f.creator_safe || undefined, offset, limit, columns: TRACK_COLUMNS })

/** Alle Katalogzeilen eines Tracks (eine pro Release, auf dem er erscheint) inkl. aller Metadaten. */
export const trackRows = (trackId: string): Promise<ListResponse<CatalogTrack>> =>
  get('/catalog', {
    track_id: trackId,
    limit: 50,
    columns: [...TRACK_COLUMNS, 'ReleaseGenres', 'ISRC', 'Lyrics', 'LyricsLanguage', 'PerformanceType', 'ReleaseUPC', 'ReleaseCopyrightPLine', 'ReleaseDateTimezone']
  })

/** Artists (mit IDs/URIs) für mehrere Tracks in einem Aufruf. */
export async function artistsForTracks(trackIds: string[]): Promise<Record<string, TrackLite['artists']>> {
  const out: Record<string, TrackLite['artists']> = {}
  for (let i = 0; i < trackIds.length; i += 50) {
    const chunk = trackIds.slice(i, i + 50)
    const r = await get<ListResponse<CatalogTrack>>('/catalog', { track_id: chunk, limit: 200, columns: ['TrackID', 'Artists', 'ReleaseID'] })
    for (const row of r.Data ?? []) {
      if (!out[row.TrackID] && row.Artists?.length) out[row.TrackID] = row.Artists.map((a) => ({ id: a.ID, name: a.Name, uri: a.URL }))
    }
  }
  return out
}

export const releaseTracks = (releaseId: string): Promise<ListResponse<CatalogTrack>> =>
  get('/catalog', { release_id: releaseId, sort: 'TrackNumber', limit: 100, columns: TRACK_COLUMNS })

// ---------- Releases ----------
export const releases = (params: { sort?: string; artist_id?: string; offset?: number; limit?: number }): Promise<ListResponse<Release>> =>
  get('/release', { sort: '-ReleaseDate', limit: 24, ...params })
export const release = (id: string): Promise<Release> => get(`/release/${id}`)
export const releaseArtists = async (id: string): Promise<ReleaseArtist[]> => {
  const r = await get<ReleaseArtist[] | { Data: ReleaseArtist[] }>(`/release/${id}/artists`)
  return Array.isArray(r) ? r : (r.Data ?? [])
}

// ---------- Artists ----------
export const artists = (offset = 0, limit = 30): Promise<ListResponse<Artist>> =>
  get('/artist', { sort: '-Popularity', offset, limit })
export const artist = (uri: string): Promise<Artist> => get(`/artist/${encodeURIComponent(uri)}`)
export const artistCatalog = (uri: string, offset = 0, limit = 50): Promise<ListResponse<CatalogTrack>> =>
  get(`/artist/${encodeURIComponent(uri)}/catalog`, { sort: '-ReleaseDate', offset, limit, columns: TRACK_COLUMNS })
export const artistReleases = (uri: string, offset = 0, limit = 48): Promise<ListResponse<Release>> =>
  get(`/artist/${encodeURIComponent(uri)}/releases`, { offset, limit })
export const artistAppearsOn = (uri: string, offset = 0, limit = 48): Promise<ListResponse<Release>> =>
  get(`/artist/${encodeURIComponent(uri)}/appears-on`, { offset, limit })

// ---------- Explore / Facetten ----------
export const genres = async (): Promise<Genre[]> => (await get<ListResponse<Genre>>('/genres')).Data ?? []
export const tagsByCategory = async (category: 'moods' | 'usages' | 'instruments'): Promise<TagInfo[]> =>
  (await get<ListResponse<TagInfo>>('/tags', { category, limit: 200 })).Data ?? []
export const genreDistribution = async (): Promise<GenreDistribution[]> =>
  (await get<ListResponse<GenreDistribution>>('/genre-distribution')).Data ?? []
export const tagDistribution = async (): Promise<TagDistribution[]> =>
  (await get<ListResponse<TagDistribution>>('/tag-distribution')).Data ?? []
export const labelDistribution = async (): Promise<LabelDistribution[]> =>
  (await get<ListResponse<LabelDistribution>>('/label-distribution')).Data ?? []

// ---------- Suche ----------
export const searchNames = (q: string): Promise<NamesResponse> => get('/search/names', { q })
export const searchPrompt = (prompt: string, pageSize = 50): Promise<SearchResponse> =>
  post('/search/prompt', { Seeds: [{ type: 'prompt', value: prompt }], Page: 0, PageSize: pageSize })
export const similarTo = (trackId: string, pageSize = 50): Promise<SearchResponse> =>
  post('/search/by-id', { track_id: trackId, page: 0, page_size: pageSize })

// ---------- Playlists / Favoriten ----------
export const myPlaylists = (): Promise<ListResponse<Playlist>> => get('/my-playlists', { sort: '-CreatedAt', limit: 200 })
export const memberPlaylists = (): Promise<ListResponse<Playlist>> => get('/member-playlists', { sort: '-CreatedAt', limit: 200 })
export const publicPlaylists = (limit = 24): Promise<ListResponse<Playlist>> => get('/public-playlists', { sort: '-Followers', limit })
export const playlist = (id: string): Promise<Playlist> => get(`/playlist/${id}`)
export const playlistTracks = (id: string, offset = 0, limit = 50): Promise<ListResponse<PlaylistItem>> =>
  get(`/playlist/${id}/tracks`, { sort: 'Sort', offset, limit })
export const favoritesPlaylist = (): Promise<Playlist> => get('/me/library')
export const setFavorite = (trackId: string, fav: boolean): Promise<unknown> =>
  post(`/me/library/track/${trackId}${fav ? '' : '/delete'}`)

/** Alle Seiten einer Playlist laden (für Abspielen/Download). */
export async function allPlaylistTracks(id: string): Promise<TrackLite[]> {
  const out = new Map<string, TrackLite>()
  for (let offset = 0; offset < 5000; offset += 50) {
    const r = await playlistTracks(id, offset)
    for (const it of r.Data ?? []) if (it.Track && !out.has(it.TrackID)) out.set(it.TrackID, toTrack(it.Track))
    if ((r.Data ?? []).length < 50) break
  }
  return [...out.values()]
}

export function errorMessage(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e)
  return msg.replace(/^Error invoking remote method '[^']+': (\w*Error: )?/, '')
}

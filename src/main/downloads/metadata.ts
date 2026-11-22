import type { CatalogTrack, ListResponse, PlaylistItem, ReleaseArtist, TagDistribution } from '@shared/types'
import { t } from '../i18n'
import type { SoundScoutApi } from '../api/client'
import { TRACK_FULL_COLUMNS, TRACK_LIST_COLUMNS } from '../api/columns'
import { buildTrackMeta, type TagCategoryMap, type TrackMeta } from './meta'

/** Sammelt alle verfügbaren Metadaten eines Tracks aus mehreren Endpunkten. */
export class MetadataService {
  private tagCategories: TagCategoryMap | null = null
  private trackTotals = new Map<string, number>()
  private releaseArtists = new Map<string, ReleaseArtist[]>()

  constructor(private readonly api: SoundScoutApi) {}

  async categories(): Promise<TagCategoryMap> {
    if (this.tagCategories) return this.tagCategories
    try {
      const res = await this.api.get<ListResponse<TagDistribution>>('/tag-distribution')
      const map: TagCategoryMap = {}
      for (const d of res.Data ?? []) map[d.Tag.toLowerCase()] = d.Category
      this.tagCategories = map
    } catch {
      return {}
    }
    return this.tagCategories
  }

  private async trackTotal(releaseId: string): Promise<number> {
    const hit = this.trackTotals.get(releaseId)
    if (hit !== undefined) return hit
    const res = await this.api.get<ListResponse<CatalogTrack>>('/catalog', {
      release_id: releaseId,
      limit: 1,
      columns: ['TrackID']
    })
    this.trackTotals.set(releaseId, res.Total)
    return res.Total
  }

  private async artistsOf(releaseId: string): Promise<ReleaseArtist[]> {
    const hit = this.releaseArtists.get(releaseId)
    if (hit) return hit
    try {
      const res = await this.api.get<ReleaseArtist[] | { Data: ReleaseArtist[] }>(`/release/${releaseId}/artists`)
      const list = Array.isArray(res) ? res : (res.Data ?? [])
      this.releaseArtists.set(releaseId, list)
      return list
    } catch {
      return []
    }
  }

  async trackMeta(trackId: string, releaseId: string): Promise<{ meta: TrackMeta; row: CatalogTrack }> {
    const res = await this.api.get<ListResponse<CatalogTrack>>('/catalog', {
      track_id: trackId,
      limit: 50,
      columns: TRACK_FULL_COLUMNS
    })
    const rows = res.Data ?? []
    const row = rows.find((r) => r.ReleaseID === releaseId) ?? rows[0]
    if (!row) throw new Error(t('errors.trackNotInCatalog'))
    const [trackTotal, releaseArtists, tagCategories] = await Promise.all([
      this.trackTotal(row.ReleaseID),
      this.artistsOf(row.ReleaseID),
      this.categories()
    ])
    return { meta: buildTrackMeta(row, { trackTotal, releaseArtists, tagCategories }), row }
  }

  async releaseTracks(releaseId: string): Promise<CatalogTrack[]> {
    const out: CatalogTrack[] = []
    for (let offset = 0; offset < 2000; offset += 100) {
      const res = await this.api.get<ListResponse<CatalogTrack>>('/catalog', {
        release_id: releaseId,
        sort: 'TrackNumber',
        limit: 100,
        offset,
        columns: TRACK_LIST_COLUMNS
      })
      const data = res.Data ?? []
      out.push(...data)
      this.trackTotals.set(releaseId, res.Total)
      if (data.length < 100 || out.length >= res.Total) break
    }
    return out
  }

  async playlistTracks(playlistId: string): Promise<CatalogTrack[]> {
    const seen = new Map<string, CatalogTrack>()
    for (let offset = 0; offset < 10000; offset += 50) {
      const res = await this.api.get<ListResponse<PlaylistItem>>(`/playlist/${playlistId}/tracks`, {
        sort: 'Sort',
        limit: 50,
        offset
      })
      const data = res.Data ?? []
      for (const item of data) if (item.Track && !seen.has(item.TrackID)) seen.set(item.TrackID, item.Track)
      if (data.length < 50 || offset + data.length >= res.Total) break
    }
    return [...seen.values()]
  }
}

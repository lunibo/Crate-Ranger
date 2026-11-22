import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'react-router-dom'
import { fileCover, genres, releaseCover, tagsByCategory } from '../lib/api'
import { capitalize, fmtNumber } from '../lib/format'
import { Chip, ErrorBox, Spinner } from '../components/Common'

type Tab = 'genres' | 'moods' | 'usages' | 'instruments'
const TABS: Tab[] = ['genres', 'moods', 'usages', 'instruments']

interface Tile {
  key: string
  title: string
  count?: number
  image?: string
  to: string
}

export function Explore() {
  const { t } = useTranslation()
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as Tab) || 'genres'
  const q = useQuery({
    queryKey: ['explore', tab],
    queryFn: async (): Promise<Tile[]> => {
      if (tab === 'genres') {
        return (await genres())
          .filter((g) => (g.TrackCount ?? 0) > 0)
          .sort((a, b) => (b.TrackCount ?? 0) - (a.TrackCount ?? 0))
          .map((g) => ({
            key: g.ID,
            title: g.Title,
            count: g.TrackCount,
            image: g.PreferredImageFileID ? fileCover(g.PreferredImageFileID, 300) : g.TopReleases?.[0] ? releaseCover(g.TopReleases[0].ID, 300, g.TopReleases[0].CoverFileID) : undefined,
            to: `/browse?genres=${g.ID}&title=${encodeURIComponent(g.Title)}`
          }))
      }
      return (await tagsByCategory(tab)).map((tag) => ({
        key: tag.Tag,
        title: capitalize(tag.Tag),
        image: tag.PreferredImageFileID ? fileCover(tag.PreferredImageFileID, 300) : tag.TopReleases?.[0] ? releaseCover(tag.TopReleases[0].ID, 300, tag.TopReleases[0].CoverFileID) : undefined,
        to: `/browse?${tab}=${encodeURIComponent(tag.Tag)}&title=${encodeURIComponent(tag.Tag)}`
      }))
    },
    staleTime: 3600_000
  })
  return (
    <div className="page">
      <h1 className="page-title">{t('nav.explore')}</h1>
      <div className="filter-bar">
        {TABS.map((k) => <Chip key={k} active={tab === k} onClick={() => setParams({ tab: k })}>{t(`explore.tabs.${k}`)}</Chip>)}
      </div>
      {q.isLoading ? <Spinner /> : q.error ? <ErrorBox error={q.error} onRetry={() => void q.refetch()} /> : (
        <div className="tile-grid">
          {(q.data ?? []).map((tile) => (
            <Link key={tile.key} to={tile.to} className="tile">
              {tile.image && <img src={tile.image} alt="" loading="lazy" />}
              <div className="tile-shade" />
              <div className="tile-title">{tile.title}</div>
              {tile.count ? <div className="tile-count">{t('common.trackCount', { count: tile.count, formatted: fmtNumber(tile.count) })}</div> : null}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { catalog, genreDistribution, tagDistribution, toTrack, type CatalogFilter } from '../lib/api'
import { capitalize, fmtNumber } from '../lib/format'
import { downloadTracks } from '../lib/stores'
import { usePlayer } from '../player/player'
import { Chip, DownloadMenu, Empty, ErrorBox, LoadMore, Spinner } from '../components/Common'
import { IconPlay } from '../components/Icons'
import { TrackTable } from '../components/TrackTable'

const SORTS = [
  ['-ReleaseDate', 'browse.sort.newest'],
  ['ReleaseDate', 'browse.sort.oldest'],
  ['-Popularity', 'browse.sort.popular'],
  ['Title', 'browse.sort.title']
] as const
const TYPES = ['Single', 'EP', 'Album', 'Compilation'] as const
type Tab = 'genres' | 'moods' | 'usages' | 'instruments' | 'type' | 'bpm'
const TABS: Tab[] = ['genres', 'moods', 'usages', 'instruments', 'type', 'bpm']

const list = (p: URLSearchParams, k: string): string[] => p.getAll(k).filter(Boolean)

export function Browse() {
  const { t } = useTranslation()
  const [params, setParams] = useSearchParams()
  const [tab, setTab] = useState<Tab | null>(null)
  const filter: CatalogFilter = useMemo(
    () => ({
      sort: params.get('sort') ?? '-ReleaseDate',
      genres: list(params, 'genres'),
      moods: list(params, 'moods'),
      usages: list(params, 'usages'),
      instruments: list(params, 'instruments'),
      release_types: list(params, 'release_types'),
      creator_safe: params.get('creator_safe') === 'true',
      bpm_min: params.get('bpm_min') ? Number(params.get('bpm_min')) : undefined,
      bpm_max: params.get('bpm_max') ? Number(params.get('bpm_max')) : undefined
    }),
    [params]
  )
  const genreDist = useQuery({ queryKey: ['genre-dist'], queryFn: genreDistribution, staleTime: 3600_000 })
  const tagDist = useQuery({ queryKey: ['tag-dist'], queryFn: tagDistribution, staleTime: 3600_000 })
  const genreName = (id: string): string => genreDist.data?.find((g) => g.ID === id)?.Title ?? t('browse.tabs.genres')

  const q = useInfiniteQuery({
    queryKey: ['catalog', filter],
    queryFn: ({ pageParam }) => catalog(filter, pageParam, 50),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((n, p) => n + (p.Data?.length ?? 0), 0)
      return loaded < last.Total ? loaded : undefined
    }
  })
  const tracks = useMemo(() => (q.data?.pages ?? []).flatMap((p) => (p.Data ?? []).map(toTrack)), [q.data])
  const total = q.data?.pages[0]?.Total ?? 0

  const toggle = (key: string, value: string): void => {
    const next = new URLSearchParams(params)
    const cur = next.getAll(key)
    next.delete(key)
    for (const v of cur.includes(value) ? cur.filter((x) => x !== value) : [...cur, value]) next.append(key, v)
    next.delete('title')
    setParams(next, { replace: true })
  }
  const setOne = (key: string, value: string | null): void => {
    const next = new URLSearchParams(params)
    if (value === null || value === '') next.delete(key)
    else next.set(key, value)
    setParams(next, { replace: true })
  }
  const active: { key: string; value: string; label: string }[] = [
    ...filter.genres!.map((v) => ({ key: 'genres', value: v, label: genreName(v) })),
    ...filter.moods!.map((v) => ({ key: 'moods', value: v, label: capitalize(v) })),
    ...filter.usages!.map((v) => ({ key: 'usages', value: v, label: capitalize(v) })),
    ...filter.instruments!.map((v) => ({ key: 'instruments', value: v, label: capitalize(v) })),
    ...filter.release_types!.map((v) => ({ key: 'release_types', value: v, label: t(`releaseType.${v}`, { defaultValue: v }) }))
  ]
  const tagsOf = (cat: string) => (tagDist.data ?? []).filter((t) => t.Category === cat).sort((a, b) => b.TrackCount - a.TrackCount)

  return (
    <div className="page">
      <div className="page-head-row">
        <h1 className="page-title">{params.get('title') ? capitalize(params.get('title')!) : t('nav.catalog')}</h1>
        <span className="muted">{q.isSuccess ? t('common.trackCount', { count: total, formatted: fmtNumber(total) }) : ''}</span>
      </div>
      <div className="filter-bar">
        {TABS.map((k) => (
          <Chip key={k} active={tab === k} onClick={() => setTab(tab === k ? null : k)}>{t(`browse.tabs.${k}`)} ▾</Chip>
        ))}
        <Chip active={filter.creator_safe} onClick={() => setOne('creator_safe', filter.creator_safe ? null : 'true')}>{t('browse.onlyCopyrightSafe')}</Chip>
        <select className="select" value={filter.sort} onChange={(e) => setOne('sort', e.target.value)}>
          {SORTS.map(([v, l]) => <option key={v} value={v}>{t(l)}</option>)}
        </select>
      </div>
      {tab && (
        <div className="filter-panel">
          {tab === 'genres' && (genreDist.data ?? []).map((g) => (
            <Chip key={g.ID} active={filter.genres!.includes(g.ID)} onClick={() => toggle('genres', g.ID)}>
              {g.Title} <span className="count">{g.TrackCount}</span>
            </Chip>
          ))}
          {(tab === 'moods' || tab === 'usages' || tab === 'instruments') && tagsOf(tab).map((tag) => (
            <Chip key={tag.Tag} active={(filter[tab] as string[]).includes(tag.Tag)} onClick={() => toggle(tab, tag.Tag)}>
              {capitalize(tag.Tag)} <span className="count">{tag.TrackCount}</span>
            </Chip>
          ))}
          {tab === 'type' && TYPES.map((type) => (
            <Chip key={type} active={filter.release_types!.includes(type)} onClick={() => toggle('release_types', type)}>{t(`releaseType.${type}`)}</Chip>
          ))}
          {tab === 'bpm' && (
            <div className="bpm-filter">
              <label>{t('browse.bpmFrom')} <input type="number" min={40} max={250} defaultValue={filter.bpm_min} onBlur={(e) => setOne('bpm_min', e.target.value)} /></label>
              <label>{t('browse.bpmTo')} <input type="number" min={40} max={250} defaultValue={filter.bpm_max} onBlur={(e) => setOne('bpm_max', e.target.value)} /></label>
              <span className="muted">BPM</span>
            </div>
          )}
        </div>
      )}
      {active.length > 0 && (
        <div className="active-filters">
          {active.map((a) => (
            <Chip key={`${a.key}-${a.value}`} active onClick={() => toggle(a.key, a.value)}>{a.label} ✕</Chip>
          ))}
          <button className="btn btn-ghost btn-sm" onClick={() => setParams(new URLSearchParams(filter.sort ? { sort: filter.sort } : {}))}>{t('browse.clearFilters')}</button>
        </div>
      )}
      {tracks.length > 0 && (
        <div className="actions">
          <button className="play-btn big" onClick={() => usePlayer.getState().playList(tracks)} title={t('common.playAll')}><IconPlay /></button>
          <DownloadMenu label={t('download.loadedTracks', { count: tracks.length })} onDownload={(f, force) => void downloadTracks(tracks, f, force)} />
        </div>
      )}
      {q.isLoading ? <Spinner /> : q.error ? <ErrorBox error={q.error} onRetry={() => void q.refetch()} /> : tracks.length ? (
        <>
          <TrackTable tracks={tracks} />
          <LoadMore onClick={() => void q.fetchNextPage()} loading={q.isFetchingNextPage} hasMore={!!q.hasNextPage} />
        </>
      ) : (
        <Empty>{t('browse.noTracks')}</Empty>
      )}
    </div>
  )
}

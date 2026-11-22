import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { artist, artistAppearsOn, artistCatalog, artistImage, artistReleases, artists, toTrack } from '../lib/api'
import { downloadTracks } from '../lib/stores'
import { usePlayer } from '../player/player'
import { ArtistCard, Grid, ReleaseCard } from '../components/Cards'
import { Chip, Cover, DownloadMenu, Empty, ErrorBox, LoadMore, Spinner } from '../components/Common'
import { IconPlay } from '../components/Icons'
import { TrackTable } from '../components/TrackTable'

function pager<T>(load: (offset: number) => Promise<{ Data: T[] | null; Total: number }>) {
  return {
    queryFn: ({ pageParam }: { pageParam: number }) => load(pageParam),
    initialPageParam: 0,
    getNextPageParam: (last: { Total: number }, pages: { Data: T[] | null }[]) => {
      const n = pages.reduce((s, p) => s + (p.Data?.length ?? 0), 0)
      return n < last.Total ? n : undefined
    }
  }
}

type Tab = 'tracks' | 'releases' | 'appears'

export function ArtistPage() {
  const { t } = useTranslation()
  const { uri = '' } = useParams()
  const [tab, setTab] = useState<Tab>('tracks')
  const a = useQuery({ queryKey: ['artist', uri], queryFn: () => artist(uri) })
  const realUri = a.data?.URI ?? ''
  const tracksQ = useInfiniteQuery({ queryKey: ['artist-catalog', realUri], ...pager((o) => artistCatalog(realUri, o, 50)), enabled: !!realUri })
  const relQ = useInfiniteQuery({ queryKey: ['artist-releases', realUri], ...pager((o) => artistReleases(realUri, o)), enabled: !!realUri && tab === 'releases' })
  const appQ = useInfiniteQuery({ queryKey: ['artist-appears', realUri], ...pager((o) => artistAppearsOn(realUri, o)), enabled: !!realUri && tab === 'appears' })
  const tracks = useMemo(() => (tracksQ.data?.pages ?? []).flatMap((p) => (p.Data ?? []).map(toTrack)), [tracksQ.data])
  if (a.isLoading) return <div className="page"><Spinner /></div>
  if (a.error || !a.data) return <div className="page"><ErrorBox error={a.error} /></div>
  const art = a.data
  const totalTracks = tracksQ.data?.pages[0]?.Total ?? 0
  return (
    <div className="page">
      <header className="hero">
        <Cover src={artistImage(art.ID, 600)} alt={art.Name} size={200} round />
        <div className="hero-info">
          <div className="hero-kind">{t('artist.kind')}</div>
          <h1 className="hero-title">{art.Name}</h1>
          <div className="hero-meta">{totalTracks ? t('artist.tracksInCatalog', { count: totalTracks }) : ''}</div>
          <div className="hero-tags">
            {(art.Links ?? []).slice(0, 8).map((l) => (
              <button key={l.URL} className="tag" onClick={() => void window.ss.shell.openExternal(l.URL)}>{l.Platform}</button>
            ))}
          </div>
        </div>
      </header>
      {art.Description && <p className="description clamp">{art.Description}</p>}
      <div className="actions">
        <button className="play-btn big" disabled={!tracks.length} onClick={() => usePlayer.getState().playList(tracks)} title={t('player.play')}><IconPlay /></button>
        <DownloadMenu label={t('download.loadedTracks', { count: tracks.length })} disabled={!tracks.length} onDownload={(f, force) => void downloadTracks(tracks, f, force)} />
      </div>
      <div className="filter-bar">
        <Chip active={tab === 'tracks'} onClick={() => setTab('tracks')}>{t('artist.tabs.tracks')}</Chip>
        <Chip active={tab === 'releases'} onClick={() => setTab('releases')}>{t('artist.tabs.releases')}</Chip>
        <Chip active={tab === 'appears'} onClick={() => setTab('appears')}>{t('artist.tabs.appearsOn')}</Chip>
      </div>
      {tab === 'tracks' && (tracksQ.isLoading ? <Spinner /> : tracksQ.error ? <ErrorBox error={tracksQ.error} /> : (
        <>
          <TrackTable tracks={tracks} />
          <LoadMore onClick={() => void tracksQ.fetchNextPage()} loading={tracksQ.isFetchingNextPage} hasMore={!!tracksQ.hasNextPage} />
        </>
      ))}
      {tab !== 'tracks' && (() => {
        const q = tab === 'releases' ? relQ : appQ
        const items = (q.data?.pages ?? []).flatMap((p) => p.Data ?? [])
        if (q.isLoading) return <Spinner />
        if (q.error) return <ErrorBox error={q.error} />
        if (!items.length) return <Empty>{t('common.noEntries')}</Empty>
        return (
          <>
            <Grid>{items.map((r) => <ReleaseCard key={r.ID} r={r} />)}</Grid>
            <LoadMore onClick={() => void q.fetchNextPage()} loading={q.isFetchingNextPage} hasMore={!!q.hasNextPage} />
          </>
        )
      })()}
    </div>
  )
}

export function ArtistsPage() {
  const { t } = useTranslation()
  const q = useInfiniteQuery({ queryKey: ['artists'], ...pager((o) => artists(o, 36)) })
  const items = (q.data?.pages ?? []).flatMap((p) => p.Data ?? []).filter((a) => !a.Hidden)
  return (
    <div className="page">
      <h1 className="page-title">{t('nav.artists')}</h1>
      {q.isLoading ? <Spinner /> : q.error ? <ErrorBox error={q.error} /> : (
        <>
          <Grid>{items.map((a) => <ArtistCard key={a.ID} a={a} />)}</Grid>
          <LoadMore onClick={() => void q.fetchNextPage()} loading={q.isFetchingNextPage} hasMore={!!q.hasNextPage} />
        </>
      )}
    </div>
  )
}

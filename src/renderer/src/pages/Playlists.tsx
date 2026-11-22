import { useMemo } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { allPlaylistTracks, favoritesPlaylist, fileCover, memberPlaylists, myPlaylists, playlist, playlistTracks, publicPlaylists, similarTo, toTrack } from '../lib/api'
import { downloadPlaylist, toast, useAuth, useLibrary } from '../lib/stores'
import { usePlayer } from '../player/player'
import { Grid, PlaylistCard } from '../components/Cards'
import { Cover, DownloadMenu, Empty, ErrorBox, LoadMore, Section, Spinner } from '../components/Common'
import { IconCheck, IconPlay } from '../components/Icons'
import { TrackTable } from '../components/TrackTable'

export function PlaylistsPage() {
  const { t } = useTranslation()
  const loggedIn = useAuth((s) => !!s.state?.loggedIn)
  const mine = useQuery({ queryKey: ['my-playlists'], queryFn: myPlaylists, enabled: loggedIn })
  const member = useQuery({ queryKey: ['member-playlists'], queryFn: memberPlaylists, enabled: loggedIn })
  const pub = useQuery({ queryKey: ['public-playlists'], queryFn: () => publicPlaylists(48) })
  return (
    <div className="page">
      <h1 className="page-title">{t('nav.playlists')}</h1>
      {loggedIn && (
        <Section title={t('playlist.mine')}>
          {mine.isLoading ? <Spinner /> : mine.error ? <ErrorBox error={mine.error} /> : (mine.data?.Data ?? []).length ? (
            <Grid>{mine.data!.Data!.map((p) => <PlaylistCard key={p.ID} p={p} />)}</Grid>
          ) : <Empty>{t('playlist.noneOwn')}</Empty>}
        </Section>
      )}
      {loggedIn && (member.data?.Data ?? []).length > 0 && (
        <Section title={t('playlist.shared')}>
          <Grid>{member.data!.Data!.map((p) => <PlaylistCard key={p.ID} p={p} />)}</Grid>
        </Section>
      )}
      <Section title={t('playlist.curated')}>
        {pub.isLoading ? <Spinner /> : pub.error ? <ErrorBox error={pub.error} /> : (
          <Grid>{(pub.data?.Data ?? []).map((p) => <PlaylistCard key={p.ID} p={p} />)}</Grid>
        )}
      </Section>
    </div>
  )
}

function PlaylistView({ id, titleOverride }: { id: string; titleOverride?: string }) {
  const { t } = useTranslation()
  const meta = useQuery({ queryKey: ['playlist', id], queryFn: () => playlist(id) })
  const q = useInfiniteQuery({
    queryKey: ['playlist-tracks', id],
    queryFn: ({ pageParam }) => playlistTracks(id, pageParam, 50),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => {
      const n = pages.reduce((s, p) => s + (p.Data?.length ?? 0), 0)
      return n < last.Total ? n : undefined
    }
  })
  const snap = useLibrary((s) => s.snap)
  const tracks = useMemo(
    () => (q.data?.pages ?? []).flatMap((p) => (p.Data ?? []).filter((i) => i.Track).map((i) => toTrack(i.Track))),
    [q.data]
  )
  const total = q.data?.pages[0]?.Total ?? 0
  const downloaded = tracks.filter((t) => snap.tracks[t.trackId]?.files.some((f) => !f.missing)).length
  const playAll = async (): Promise<void> => {
    if (tracks.length >= total) return usePlayer.getState().playList(tracks)
    try {
      usePlayer.getState().playList(await allPlaylistTracks(id))
    } catch (e) {
      toast('error', String(e))
    }
  }
  const p = meta.data
  const cover = p?.CoverImageIDs?.[0]
  return (
    <div className="page">
      <header className="hero">
        <Cover src={cover ? fileCover(cover, 600) : undefined} alt={titleOverride ?? p?.Name ?? t('playlist.kind')} size={200} />
        <div className="hero-info">
          <div className="hero-kind">{t('playlist.kind')}</div>
          <h1 className="hero-title">{titleOverride ?? p?.Name ?? '…'}</h1>
          <div className="hero-meta">{t('common.trackCount', { count: total, formatted: total })}{p?.FollowerCount ? ` · ${t('playlist.followers', { count: p.FollowerCount })}` : ''}</div>
        </div>
      </header>
      <div className="actions">
        <button className="play-btn big" disabled={!tracks.length} onClick={() => void playAll()} title={t('player.play')}><IconPlay /></button>
        <DownloadMenu label={t('download.playlist')} disabled={!total} onDownload={(f, force) => void downloadPlaylist(id, f, force)} />
        {downloaded > 0 && <span className="progress-pill"><IconCheck size={14} /> {t('playlist.loadedDownloaded', { count: downloaded })}</span>}
      </div>
      {q.isLoading ? <Spinner /> : q.error ? <ErrorBox error={q.error} /> : tracks.length ? (
        <>
          <TrackTable tracks={tracks} />
          <LoadMore onClick={() => void q.fetchNextPage()} loading={q.isFetchingNextPage} hasMore={!!q.hasNextPage} />
        </>
      ) : <Empty>{t('playlist.empty')}</Empty>}
    </div>
  )
}

export function PlaylistPage() {
  const { id = '' } = useParams()
  return <PlaylistView key={id} id={id} />
}

export function FavoritesPage() {
  const { t } = useTranslation()
  const loggedIn = useAuth((s) => !!s.state?.loggedIn)
  const fav = useQuery({ queryKey: ['favorites'], queryFn: favoritesPlaylist, enabled: loggedIn })
  if (!loggedIn) return <div className="page"><h1 className="page-title">{t('nav.favorites')}</h1><Empty>{t('favorites.signInToSee')}</Empty></div>
  if (fav.isLoading) return <div className="page"><Spinner /></div>
  if (fav.error || !fav.data) return <div className="page"><ErrorBox error={fav.error} /></div>
  return <PlaylistView key={fav.data.ID} id={fav.data.ID} titleOverride={t('nav.favorites')} />
}

export function SimilarPage() {
  const { t } = useTranslation()
  const { trackId = '' } = useParams()
  const q = useQuery({ queryKey: ['similar', trackId], queryFn: () => similarTo(trackId, 50) })
  const tracks = useMemo(() => (q.data?.Data ?? []).map(toTrack), [q.data])
  const seed = tracks.find((t) => t.trackId === trackId)
  return (
    <div className="page">
      <h1 className="page-title">
        {seed ? (
          <Trans i18nKey="similar.titleWith" values={{ title: seed.title }} components={{ link: <Link to={`/track/${trackId}`} className="title-link" /> }} />
        ) : t('similar.titleGeneric')}
      </h1>
      {q.isLoading ? <Spinner label={t('similar.loading')} /> : q.error ? <ErrorBox error={q.error} /> : (
        <>
          <div className="actions">
            <button className="play-btn big" disabled={!tracks.length} onClick={() => usePlayer.getState().playList(tracks)}><IconPlay /></button>
          </div>
          <TrackTable tracks={tracks} />
        </>
      )}
    </div>
  )
}

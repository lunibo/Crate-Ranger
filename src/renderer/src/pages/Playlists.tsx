import { useMemo, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { allPlaylistTracks, favoritesPlaylist, fileCover, memberPlaylists, myPlaylists, playlist, playlistTracks, publicPlaylists, similarTo, toTrack } from '../lib/api'
import type { Playlist } from '@shared/types'
import { deleteOwnPlaylist, renameOwnPlaylist } from '../lib/playlistActions'
import { filterPlaylists } from '@shared/playlistSearch'
import { downloadPlaylist, toast, useAuth, useLibrary } from '../lib/stores'
import { usePlayer } from '../player/player'
import { Grid, PlaylistCard } from '../components/Cards'
import { Cover, DownloadMenu, Empty, ErrorBox, LoadMore, Section, Spinner } from '../components/Common'
import { IconCheck, IconPlay } from '../components/Icons'
import { TrackTable } from '../components/TrackTable'

export function PlaylistsPage() {
  const { t } = useTranslation()
  const loggedIn = useAuth((s) => !!s.state?.loggedIn)
  const [query, setQuery] = useState('')
  const mine = useQuery({ queryKey: ['my-playlists'], queryFn: myPlaylists, enabled: loggedIn })
  const member = useQuery({ queryKey: ['member-playlists'], queryFn: memberPlaylists, enabled: loggedIn })
  const pub = useQuery({ queryKey: ['public-playlists'], queryFn: () => publicPlaylists(48) })
  const own = mine.data?.Data ?? []
  const ownIds = new Set(own.map((p) => p.ID))
  // /member-playlists liefert auch die eigenen – „Mit mir geteilt“ zeigt nur fremde
  const shared = (member.data?.Data ?? []).filter((p) => !ownIds.has(p.ID) && p.CallerRole !== 'owner')
  const searching = !!query.trim()
  const ownHits = filterPlaylists(own, query)
  const sharedHits = filterPlaylists(shared, query)
  const pubHits = filterPlaylists(pub.data?.Data ?? [], query)
  const noHits = searching && !ownHits.length && !sharedHits.length && !pubHits.length && !mine.isLoading && !pub.isLoading
  return (
    <div className="page">
      <h1 className="page-title">{t('nav.playlists')}</h1>
      <div className="actions">
        <input className="input search-input" placeholder={t('playlistMenu.search')} value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && setQuery('')} />
      </div>
      {noHits && <Empty>{t('playlistMenu.noMatch')}</Empty>}
      {loggedIn && (!searching || ownHits.length > 0) && (
        <Section title={t('playlist.mine')}>
          {mine.isLoading ? <Spinner /> : mine.error ? <ErrorBox error={mine.error} /> : ownHits.length ? (
            <Grid>{ownHits.map((p) => <PlaylistCard key={p.ID} p={p} own={!p.IsFavorite} />)}</Grid>
          ) : <Empty>{t('playlist.noneOwn')}</Empty>}
        </Section>
      )}
      {loggedIn && sharedHits.length > 0 && (
        <Section title={t('playlist.shared')}>
          <Grid>{sharedHits.map((p) => <PlaylistCard key={p.ID} p={p} />)}</Grid>
        </Section>
      )}
      {(!searching || pubHits.length > 0) && (
        <Section title={t('playlist.curated')}>
          {pub.isLoading ? <Spinner /> : pub.error ? <ErrorBox error={pub.error} /> : (
            <Grid>{pubHits.map((p) => <PlaylistCard key={p.ID} p={p} />)}</Grid>
          )}
        </Section>
      )}
    </div>
  )
}

/** Umbenennen/Löschen für eigene Playlists (nicht Favoriten, geteilte oder kuratierte). */
function OwnerActions({ p }: { p: Playlist }) {
  const { t } = useTranslation()
  const nav = useNavigate()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busy, setBusy] = useState(false)
  const remove = async (): Promise<void> => {
    setBusy(true)
    if (await deleteOwnPlaylist(p)) nav('/playlists', { replace: true })
    else setBusy(false)
  }
  return (
    <>
      <button className="btn btn-secondary" disabled={busy} onClick={() => setConfirmDelete(true)}>{t('playlist.delete')}</button>
      {confirmDelete && (
        <div className="notice confirm">
          <span>{t('playlist.deleteConfirm', { name: p.Name })}</span>
          <div className="row">
            <button className="btn btn-danger btn-sm" disabled={busy} onClick={() => void remove()}>{t('playlist.deleteStart')}</button>
            <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setConfirmDelete(false)}>{t('common.cancel')}</button>
          </div>
        </div>
      )}
    </>
  )
}

/** Titel als Eingabefeld (Enter speichert, Escape bricht ab). */
function RenameTitle({ p, onDone }: { p: Playlist; onDone: () => void }) {
  const { t } = useTranslation()
  const [name, setName] = useState(p.Name)
  const [busy, setBusy] = useState(false)
  const save = async (): Promise<void> => {
    setBusy(true)
    if (await renameOwnPlaylist(p, name)) onDone()
    else setBusy(false)
  }
  return (
    <form className="rename-form" onSubmit={(e) => { e.preventDefault(); void save() }}>
      <input
        className="input hero-title-input"
        autoFocus
        maxLength={200}
        value={name}
        disabled={busy}
        onChange={(e) => setName(e.target.value)}
        onFocus={(e) => e.currentTarget.select()}
        onKeyDown={(e) => e.key === 'Escape' && onDone()}
      />
      <button type="submit" className="btn btn-primary btn-sm" disabled={busy || !name.trim()}>{t('playlist.renameSave')}</button>
      <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={onDone}>{t('common.cancel')}</button>
    </form>
  )
}

function PlaylistView({ id, titleOverride }: { id: string; titleOverride?: string }) {
  const { t } = useTranslation()
  const meta = useQuery({ queryKey: ['playlist', id], queryFn: () => playlist(id) })
  const loggedIn = useAuth((s) => !!s.state?.loggedIn)
  const mine = useQuery({ queryKey: ['my-playlists'], queryFn: myPlaylists, enabled: loggedIn && !titleOverride })
  const [editing, setEditing] = useState(false)
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
  // Rolle steht an der Playlist; falls sie fehlt, über „Meine Playlists“ entscheiden
  const own = !!p && !titleOverride && !p.IsFavorite && (p.CallerRole ? p.CallerRole === 'owner' : (mine.data?.Data ?? []).some((x) => x.ID === p.ID))
  return (
    <div className="page">
      <header className="hero">
        <Cover src={cover ? fileCover(cover, 600) : undefined} alt={titleOverride ?? p?.Name ?? t('playlist.kind')} size={200} />
        <div className="hero-info">
          <div className="hero-kind">{t('playlist.kind')}</div>
          {editing && own ? (
            <RenameTitle p={p} onDone={() => setEditing(false)} />
          ) : own ? (
            <h1 className="hero-title editable" title={t('playlist.renameHint')} role="button" tabIndex={0} onClick={() => setEditing(true)} onKeyDown={(e) => e.key === 'Enter' && setEditing(true)}>{p.Name}</h1>
          ) : (
            <h1 className="hero-title">{titleOverride ?? p?.Name ?? '…'}</h1>
          )}
          <div className="hero-meta">{t('common.trackCount', { count: total, formatted: total })}{p?.FollowerCount ? ` · ${t('playlist.followers', { count: p.FollowerCount })}` : ''}</div>
        </div>
      </header>
      <div className="actions">
        <button className="play-btn big" disabled={!tracks.length} onClick={() => void playAll()} title={t('player.play')}><IconPlay /></button>
        <DownloadMenu label={t('download.playlist')} disabled={!total} onDownload={(f, force) => void downloadPlaylist(id, f, force)} />
        {downloaded > 0 && <span className="progress-pill"><IconCheck size={14} /> {t('playlist.loadedDownloaded', { count: downloaded })}</span>}
        {own && <OwnerActions p={p} />}
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

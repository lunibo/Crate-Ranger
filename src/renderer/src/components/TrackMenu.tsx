import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { addToPlaylist, createPlaylist, errorMessage, myPlaylists, type TrackLite } from '../lib/api'
import { fmtDateTime } from '../lib/format'
import { queryClient } from '../lib/queryClient'
import { downloadTracks, localFile, toast, useAuth, useLibrary } from '../lib/stores'
import { usePlayer } from '../player/player'
import { filterPlaylists, fold } from '@shared/playlistSearch'
import { PopupMenu, type MenuPos } from './PopupMenu'

export type { MenuPos }
type View = 'main' | 'playlists' | 'create'

function refreshPlaylist(id: string): void {
  void queryClient.invalidateQueries({ queryKey: ['my-playlists'] })
  void queryClient.invalidateQueries({ queryKey: ['playlist', id] })
  void queryClient.invalidateQueries({ queryKey: ['playlist-tracks', id] })
}

/**
 * Track-Menü (⋯-Button in Tabellenzeilen, Rechtsklick auf Zeilen und auf den laufenden Track im Player).
 * Mit `at` als Kontextmenü an der Mausposition (im Fenster gehalten), sonst unter dem ⋯-Button.
 */
export function TrackMenu({ track, at, onClose }: { track: TrackLite; at?: MenuPos; onClose: () => void }) {
  const { t } = useTranslation()
  const nav = useNavigate()
  const player = usePlayer()
  const snap = useLibrary((s) => s.snap)
  const loggedIn = useAuth((s) => !!s.state?.loggedIn)
  const local = localFile(snap, track.trackId)
  const [view, setView] = useState<View>('main')
  const [name, setName] = useState('')
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [busy, setBusy] = useState(false)
  const lists = useQuery({ queryKey: ['my-playlists'], queryFn: myPlaylists, enabled: loggedIn && view === 'playlists' })
  // Favoriten sind intern auch eine Playlist – dafür gibt es das Herz
  const own = (lists.data?.Data ?? []).filter((p) => !p.IsFavorite)
  const matches = filterPlaylists(own, query)
  const exact = own.some((p) => fold(p.Name) === fold(query))
  const activeRef = useRef<HTMLButtonElement>(null)
  useEffect(() => setActive(0), [query])
  useEffect(() => activeRef.current?.scrollIntoView({ block: 'nearest' }), [active])

  const act = (fn: () => void) => () => {
    fn()
    onClose()
  }

  const addTo = async (id: string, playlistName: string): Promise<void> => {
    setBusy(true)
    try {
      await addToPlaylist(id, track.trackId)
      toast('success', t('playlistMenu.added', { title: track.title, playlist: playlistName }), 2500)
      refreshPlaylist(id)
      onClose()
    } catch (e) {
      toast('error', t('playlistMenu.addFailed', { playlist: playlistName, error: errorMessage(e) }))
      setBusy(false)
    }
  }

  const create = async (newName = name): Promise<void> => {
    const n = newName.trim()
    if (!n || busy) return
    setBusy(true)
    let id: string
    try {
      id = await createPlaylist(n)
    } catch (e) {
      toast('error', t('playlistMenu.createFailed', { error: errorMessage(e) }))
      setBusy(false)
      return
    }
    try {
      await addToPlaylist(id, track.trackId)
      toast('success', t('playlistMenu.created', { playlist: n, title: track.title }), 2500)
    } catch (e) {
      toast('error', t('playlistMenu.addFailed', { playlist: n, error: errorMessage(e) }))
    }
    refreshPlaylist(id)
    onClose()
  }

  const back = (to: View) => (
    <>
      <button className="menu-item menu-back" onClick={() => setView(to)}>‹ {t('trackMenu.back')}</button>
      <div className="menu-sep" />
    </>
  )

  let content: React.ReactNode
  if (view === 'playlists') {
    content = (
      <>
        {back('main')}
        <div className="menu-form">
          <input
            className="input"
            autoFocus
            placeholder={t('playlistMenu.search')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault()
                const d = e.key === 'ArrowDown' ? 1 : -1
                setActive((i) => (matches.length ? (i + d + matches.length) % matches.length : 0))
              } else if (e.key === 'Enter') {
                e.preventDefault()
                const p = matches[active]
                if (p && !busy) void addTo(p.ID, p.Name)
                else if (query.trim() && !exact) void create(query)
              }
            }}
          />
        </div>
        {query.trim() && !exact ? (
          <button className="menu-item" disabled={busy} onClick={() => void create(query)}>
            + {t('playlistMenu.createNamed', { name: query.trim() })}
          </button>
        ) : (
          <button className="menu-item" onClick={() => { setName(query); setView('create') }}>+ {t('playlistMenu.create')}</button>
        )}
        <div className="menu-sep" />
        <div className="menu-scroll">
          {lists.isLoading ? (
            <div className="menu-item disabled">{t('playlistMenu.loading')}</div>
          ) : lists.isError ? (
            <div className="menu-item disabled">{t('playlistMenu.loadFailed')}</div>
          ) : own.length === 0 ? (
            <div className="menu-item disabled">{t('playlistMenu.empty')}</div>
          ) : matches.length === 0 ? (
            <div className="menu-item disabled">{t('playlistMenu.noMatch')}</div>
          ) : (
            matches.map((p, i) => (
              <button
                key={p.ID}
                ref={i === active ? activeRef : undefined}
                className={`menu-item ${i === active ? 'active' : ''}`}
                disabled={busy}
                onMouseEnter={() => setActive(i)}
                onClick={() => void addTo(p.ID, p.Name)}
              >
                {p.Name}
              </button>
            ))
          )}
        </div>
      </>
    )
  } else if (view === 'create') {
    content = (
      <>
        {back('playlists')}
        <form
          className="menu-form"
          onSubmit={(e) => {
            e.preventDefault()
            void create()
          }}
        >
          <input
            className="input"
            autoFocus
            maxLength={200}
            placeholder={t('playlistMenu.namePlaceholder')}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button type="submit" className="btn btn-primary btn-sm" disabled={!name.trim() || busy}>
            {busy ? <span className="spinner small" /> : t('playlistMenu.createButton')}
          </button>
        </form>
      </>
    )
  } else {
    content = (
      <>
        <button className="menu-item" onClick={act(() => player.playNext(track))}>{t('trackMenu.playNext')}</button>
        <button className="menu-item" onClick={act(() => player.addToQueue([track]))}>{t('trackMenu.addToQueue')}</button>
        {loggedIn && (
          <button className="menu-item menu-sub" onClick={() => setView('playlists')}>
            {t('trackMenu.addToPlaylist')} <span className="menu-arrow">›</span>
          </button>
        )}
        <button className="menu-item" onClick={act(() => nav(`/similar/${track.trackId}`))}>{t('trackMenu.similar')}</button>
        <button className="menu-item" onClick={act(() => nav(`/track/${track.trackId}`))}>{t('trackMenu.details')}</button>
        <button className="menu-item" onClick={act(() => nav(`/release/${track.releaseId}`))}>{t('trackMenu.goToRelease')}</button>
        <div className="menu-sep" />
        {track.preRelease ? (
          <div className="menu-item disabled">{t('preRelease.availableFrom', { date: fmtDateTime(track.releaseDate) })}</div>
        ) : (
          <>
            <button className="menu-item" onClick={act(() => void downloadTracks([track], 'FLAC'))}>{t('download.asFormat', { format: 'FLAC' })}</button>
            <button className="menu-item" onClick={act(() => void downloadTracks([track], 'MP3_320'))}>{t('download.asFormat', { format: 'MP3 320' })}</button>
            <button className="menu-item" onClick={act(() => void downloadTracks([track], 'WAV'))}>{t('download.asFormat', { format: 'WAV' })}</button>
          </>
        )}
        {local && (
          <>
            <button className="menu-item" onClick={act(() => void downloadTracks([track], undefined, true))}>{t('download.redownload')}</button>
            <button className="menu-item" onClick={act(() => void window.ss.shell.showItem(local))}>{t('common.showInExplorer')}</button>
          </>
        )}
        <button className="menu-item" onClick={act(() => void window.ss.shell.openExternal(`https://www.soundscout.com/player/music/${track.trackId}`))}>
          {t('trackMenu.openOnSoundScout')}
        </button>
      </>
    )
  }

  return (
    <PopupMenu at={at} onClose={onClose} relayout={[view, matches.length, lists.isLoading]}>
      {content}
    </PopupMenu>
  )
}

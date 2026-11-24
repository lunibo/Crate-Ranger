import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { addToPlaylist, createPlaylist, errorMessage, myPlaylists, type TrackLite } from '../lib/api'
import { fmtDateTime } from '../lib/format'
import { queryClient } from '../lib/queryClient'
import { downloadTracks, localFile, toast, useAuth, useLibrary } from '../lib/stores'
import { usePlayer } from '../player/player'

export type MenuPos = { x: number; y: number }
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
  const ref = useRef<HTMLDivElement>(null)
  const nav = useNavigate()
  const player = usePlayer()
  const snap = useLibrary((s) => s.snap)
  const loggedIn = useAuth((s) => !!s.state?.loggedIn)
  const local = localFile(snap, track.trackId)
  const [pos, setPos] = useState(at)
  const [view, setView] = useState<View>('main')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const lists = useQuery({ queryKey: ['my-playlists'], queryFn: myPlaylists, enabled: loggedIn && view === 'playlists' })
  // Favoriten sind intern auch eine Playlist – dafür gibt es das Herz
  const own = (lists.data?.Data ?? []).filter((p) => !p.IsFavorite)

  useEffect(() => {
    const close = (e: MouseEvent): void => {
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    const onScroll = (e: Event): void => {
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    window.addEventListener('mousedown', close)
    window.addEventListener('keydown', onKey)
    window.addEventListener('blur', onClose)
    window.addEventListener('resize', onClose)
    if (at) window.addEventListener('scroll', onScroll, true)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('blur', onClose)
      window.removeEventListener('resize', onClose)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [onClose, at])
  // Kontextmenü im Fenster halten (nach rechts/unten nicht abschneiden) – auch wenn sich der Inhalt ändert
  useLayoutEffect(() => {
    if (!at || !ref.current) return
    const { width, height } = ref.current.getBoundingClientRect()
    const m = 8
    setPos({
      x: Math.max(m, Math.min(at.x, window.innerWidth - width - m)),
      y: at.y + height + m > window.innerHeight ? Math.max(m, at.y - height) : at.y
    })
  }, [at, view, own.length, lists.isLoading])

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

  const create = async (): Promise<void> => {
    const n = name.trim()
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
        <button className="menu-item" onClick={() => setView('create')}>+ {t('playlistMenu.create')}</button>
        <div className="menu-sep" />
        <div className="menu-scroll">
          {lists.isLoading ? (
            <div className="menu-item disabled">{t('playlistMenu.loading')}</div>
          ) : lists.isError ? (
            <div className="menu-item disabled">{t('playlistMenu.loadFailed')}</div>
          ) : own.length === 0 ? (
            <div className="menu-item disabled">{t('playlistMenu.empty')}</div>
          ) : (
            own.map((p) => (
              <button key={p.ID} className="menu-item" disabled={busy} onClick={() => void addTo(p.ID, p.Name)}>
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

  const body = (
    <div
      className={`menu ${at ? 'context-menu' : 'row-menu'}`}
      ref={ref}
      style={pos ? { left: pos.x, top: pos.y } : undefined}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation() }}
      role="menu"
    >
      {content}
    </div>
  )
  return at ? createPortal(body, document.body) : body
}

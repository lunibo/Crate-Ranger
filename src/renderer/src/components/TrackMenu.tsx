import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import type { TrackLite } from '../lib/api'
import { fmtDateTime } from '../lib/format'
import { downloadTracks, localFile, useLibrary } from '../lib/stores'
import { usePlayer } from '../player/player'

export type MenuPos = { x: number; y: number }

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
  const local = localFile(snap, track.trackId)
  const [pos, setPos] = useState(at)

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
  // Kontextmenü im Fenster halten (nach rechts/unten nicht abschneiden)
  useLayoutEffect(() => {
    if (!at || !ref.current) return
    const { width, height } = ref.current.getBoundingClientRect()
    const m = 8
    setPos({
      x: Math.max(m, Math.min(at.x, window.innerWidth - width - m)),
      y: at.y + height + m > window.innerHeight ? Math.max(m, at.y - height) : at.y
    })
  }, [at])

  const act = (fn: () => void) => () => {
    fn()
    onClose()
  }

  const content = (
      <>
        <button className="menu-item" onClick={act(() => player.playNext(track))}>{t('trackMenu.playNext')}</button>
        <button className="menu-item" onClick={act(() => player.addToQueue([track]))}>{t('trackMenu.addToQueue')}</button>
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

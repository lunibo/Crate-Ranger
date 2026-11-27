import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate } from 'react-router-dom'
import type { Playlist } from '@shared/types'
import { deleteOwnPlaylist, playPlaylist, queuePlaylist, renameOwnPlaylist } from '../lib/playlistActions'
import { downloadPlaylist } from '../lib/stores'
import { PopupMenu, type MenuPos } from './PopupMenu'

type View = 'main' | 'rename' | 'delete'

/** Kontextmenü einer Playlist-Karte. Umbenennen/Löschen nur für eigene Playlists. */
export function PlaylistMenu({ p, own, at, onClose }: { p: Playlist; own: boolean; at: MenuPos; onClose: () => void }) {
  const { t } = useTranslation()
  const nav = useNavigate()
  const loc = useLocation()
  const [view, setView] = useState<View>('main')
  const [name, setName] = useState(p.Name)
  const [busy, setBusy] = useState(false)
  const act = (fn: () => void) => () => {
    fn()
    onClose()
  }

  const rename = async (): Promise<void> => {
    setBusy(true)
    if (await renameOwnPlaylist(p, name)) onClose()
    else setBusy(false)
  }
  const remove = async (): Promise<void> => {
    setBusy(true)
    if (!(await deleteOwnPlaylist(p))) return setBusy(false)
    if (loc.pathname === `/playlist/${p.ID}`) nav('/playlists', { replace: true })
    onClose()
  }
  const back = (
    <>
      <button className="menu-item menu-back" disabled={busy} onClick={() => setView('main')}>‹ {t('trackMenu.back')}</button>
      <div className="menu-sep" />
    </>
  )

  let content: React.ReactNode
  if (view === 'rename') {
    content = (
      <>
        {back}
        <form className="menu-form" onSubmit={(e) => { e.preventDefault(); void rename() }}>
          <input
            className="input"
            autoFocus
            maxLength={200}
            value={name}
            disabled={busy}
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => setName(e.target.value)}
          />
          <button type="submit" className="btn btn-primary btn-sm" disabled={busy || !name.trim()}>
            {busy ? <span className="spinner small" /> : t('playlist.renameSave')}
          </button>
        </form>
      </>
    )
  } else if (view === 'delete') {
    content = (
      <>
        {back}
        <div className="menu-text">{t('playlist.deleteConfirm', { name: p.Name })}</div>
        <div className="menu-form">
          <button className="btn btn-danger btn-sm" autoFocus disabled={busy} onClick={() => void remove()}>
            {busy ? <span className="spinner small" /> : t('playlist.deleteStart')}
          </button>
          <button className="btn btn-ghost btn-sm" disabled={busy} onClick={onClose}>{t('common.cancel')}</button>
        </div>
      </>
    )
  } else {
    content = (
      <>
        <button className="menu-item" onClick={act(() => void playPlaylist(p.ID))}>{t('playlist.playNow')}</button>
        <button className="menu-item" onClick={act(() => void queuePlaylist(p.ID))}>{t('trackMenu.addToQueue')}</button>
        <button className="menu-item" onClick={act(() => nav(`/playlist/${p.ID}`))}>{t('common.open')}</button>
        <div className="menu-sep" />
        <button className="menu-item" onClick={act(() => void downloadPlaylist(p.ID, 'FLAC'))}>{t('download.asFormat', { format: 'FLAC' })}</button>
        <button className="menu-item" onClick={act(() => void downloadPlaylist(p.ID, 'MP3_320'))}>{t('download.asFormat', { format: 'MP3 320' })}</button>
        <button className="menu-item" onClick={act(() => void downloadPlaylist(p.ID, 'WAV'))}>{t('download.asFormat', { format: 'WAV' })}</button>
        {own && (
          <>
            <div className="menu-sep" />
            <button className="menu-item" onClick={() => setView('rename')}>{t('playlist.renameEllipsis')}</button>
            <button className="menu-item menu-danger" onClick={() => setView('delete')}>{t('playlist.deleteEllipsis')}</button>
          </>
        )}
      </>
    )
  }

  return (
    <PopupMenu at={at} onClose={onClose} relayout={[view]}>
      {content}
    </PopupMenu>
  )
}

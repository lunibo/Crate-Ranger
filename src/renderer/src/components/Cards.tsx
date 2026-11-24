import { useCallback, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CoverPlayButton, PlaylistPlayButton } from './CoverPlayButton'
import { PlaylistMenu } from './PlaylistMenu'
import type { MenuPos } from './PopupMenu'
import { PreReleaseBadge } from './PreReleaseBadge'
import { isPreRelease } from '@shared/release'
import { useTranslation } from 'react-i18next'
import type { Artist, Playlist, Release } from '@shared/types'
import { artistImage, fileCover, releaseCover } from '../lib/api'
import { fmtYear } from '../lib/format'
import { releaseProgress, useLibrary } from '../lib/stores'
import { Cover } from './Common'
import { ArtistLinks } from './ArtistLinks'
import { IconCheck } from './Icons'

export function ReleaseCard({ r }: { r: Release }) {
  const { t } = useTranslation()
  const snap = useLibrary((s) => s.snap)
  const nav = useNavigate()
  const prog = releaseProgress(snap, r.ID)
  const meta = [fmtYear(r.ReleaseDate), r.Type ? t(`releaseType.${r.Type}`, { defaultValue: r.Type }) : ''].filter(Boolean).join(' · ')
  return (
    <div className="card clickable" onClick={() => nav(`/release/${r.ID}`)}>
      <div className="card-cover">
        <Cover src={releaseCover(r.ID, 300, r.CoverFileID)} alt={r.Title} />
        {isPreRelease(r.ReleaseDate) && <PreReleaseBadge date={r.ReleaseDate} compact className="on-cover" />}
        {prog.done > 0 && (
          <span className={`card-badge ${prog.total && prog.done >= prog.total ? 'full' : 'part'}`} title={t('status.downloaded')}>
            <IconCheck size={12} /> {prog.total ? `${prog.done}/${prog.total}` : prog.done}
          </span>
        )}
        <CoverPlayButton releaseId={r.ID} title={r.Title} />
      </div>
      <div className="card-title" title={r.Title}>
        <Link to={`/release/${r.ID}`} onClick={(e) => e.stopPropagation()}>{r.Title}{r.Version ? ` (${r.Version})` : ''}</Link>
      </div>
      <div className="card-sub">
        {meta}
        {meta && r.ArtistsTitle ? ' · ' : ''}
        <ArtistLinks text={r.ArtistsTitle} releaseId={r.ID} />
      </div>
    </div>
  )
}

export function ArtistCard({ a }: { a: Artist }) {
  const { t } = useTranslation()
  return (
    <Link to={`/artist/${a.URI}`} className="card">
      <Cover src={artistImage(a.ID, 300)} alt={a.Name} round />
      <div className="card-title center">{a.Name}</div>
      <div className="card-sub center">{t('artist.kind')}</div>
    </Link>
  )
}

/** Playlist-Karte: Klick öffnet, Play-Button beim Überfahren, Rechtsklick → Menü (`own`: mit Umbenennen/Löschen). */
export function PlaylistCard({ p, own = false }: { p: Playlist; own?: boolean }) {
  const { t } = useTranslation()
  const nav = useNavigate()
  const [menu, setMenu] = useState<MenuPos | null>(null)
  const closeMenu = useCallback(() => setMenu(null), [])
  const img = p.CoverImageIDs?.[0]
  return (
    <div
      className={`card clickable ${menu ? 'ctx' : ''}`}
      onClick={() => nav(`/playlist/${p.ID}`)}
      onContextMenu={(e) => {
        e.preventDefault()
        setMenu({ x: e.clientX, y: e.clientY })
      }}
    >
      <div className="card-cover">
        <Cover src={img ? fileCover(img, 300) : undefined} alt={p.Name} />
        <PlaylistPlayButton playlistId={p.ID} title={p.Name} />
      </div>
      <div className="card-title" title={p.Name}>
        <Link to={`/playlist/${p.ID}`} onClick={(e) => e.stopPropagation()}>{p.Name}</Link>
      </div>
      <div className="card-sub">{p.Public ? t('playlist.public') : t('playlist.private')}{p.FollowerCount ? ` · ${t('playlist.followers', { count: p.FollowerCount })}` : ''}</div>
      {menu && <PlaylistMenu p={p} own={own} at={menu} onClose={closeMenu} />}
    </div>
  )
}

export function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid">{children}</div>
}

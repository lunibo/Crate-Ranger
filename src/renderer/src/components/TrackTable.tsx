import { memo, useCallback, useMemo, useState } from 'react'
import { PreReleaseBadge } from './PreReleaseBadge'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { artistsForTracks, releaseCover, type TrackLite } from '../lib/api'
import { fmtDuration } from '../lib/format'
import { downloadTracks, queuedTrackIds, trackStatus, useAuth, useDownloads, useFavorites, useLibrary, type DlStatus } from '../lib/stores'
import { usePlayer } from '../player/player'
import { Cover } from './Common'
import { ArtistLinks, TrackLink } from './ArtistLinks'
import { IconAlert, IconCheck, IconDownload, IconHeart, IconMore, IconPause, IconPlay, IconShield } from './Icons'
import { TrackMenu, type MenuPos } from './TrackMenu'

export function Artists({ track }: { track: TrackLite }) {
  return <ArtistLinks artists={track.artists} text={track.artistsTitle} trackId={track.trackId} releaseId={track.releaseId} />
}

export function StatusIcon({ status, queued }: { status: DlStatus; queued: boolean }) {
  const { t } = useTranslation()
  if (queued) return <span className="status queued" title={t('status.queued')}><span className="dot-pulse" /></span>
  if (status === 'downloaded') return <span className="status ok" title={t('status.downloaded')}><IconCheck size={15} /></span>
  if (status === 'missing') return <span className="status warn" title={t('status.missing')}><IconAlert size={15} /></span>
  return <span className="status none" />
}

const Row = memo(function Row({
  track, index, number, showCover, showRelease, active, playing, status, queued, onPlay
}: {
  track: TrackLite
  index: number
  number: number
  showCover: boolean
  showRelease: boolean
  active: boolean
  playing: boolean
  status: DlStatus
  queued: boolean
  onPlay: (i: number) => void
}) {
  const { t } = useTranslation()
  // null = zu, 'button' = am ⋯-Button, sonst Kontextmenü an Mausposition
  const [menu, setMenu] = useState<null | 'button' | MenuPos>(null)
  const closeMenu = useCallback(() => setMenu(null), [])
  const loggedIn = useAuth((s) => !!s.state?.loggedIn)
  const fav = useFavorites((s) => s.ids.has(track.trackId))
  const toggleFav = (e: React.MouseEvent): void => {
    e.stopPropagation()
    void useFavorites.getState().toggle(track)
  }
  return (
    <div
      className={`tr ${active ? 'active' : ''} ${menu && menu !== 'button' ? 'ctx' : ''}`}
      onDoubleClick={() => onPlay(index)}
      onContextMenu={(e) => {
        e.preventDefault()
        setMenu({ x: e.clientX, y: e.clientY })
      }}
      role="row"
    >
      <div className="td num">
        <span className="n">{active && playing ? <span className="eq"><i /><i /><i /></span> : number}</span>
        <button className="play-on-hover icon-btn" onClick={() => (active ? usePlayer.getState().toggle() : onPlay(index))} aria-label={t('player.play')}>
          {active && playing ? <IconPause size={14} /> : <IconPlay size={14} />}
        </button>
      </div>
      <div className="td title-cell">
        {showCover && (
          <Link to={`/release/${track.releaseId}`} onClick={(e) => e.stopPropagation()} title={track.releaseTitle}>
            <Cover src={releaseCover(track.releaseId, 96)} alt={track.title} size={40} />
          </Link>
        )}
        <div className="title-text">
          <div className="t">
            <TrackLink trackId={track.trackId} title={track.title} version={track.version} />
            {track.explicit && <span className="badge-e" title={t('track.explicit')}>E</span>}
            {track.preRelease && <PreReleaseBadge date={track.releaseDate} compact />}
          </div>
          <div className="sub"><Artists track={track} /></div>
        </div>
      </div>
      {showRelease && (
        <div className="td rel">
          <Link to={`/release/${track.releaseId}`} onClick={(e) => e.stopPropagation()}>{track.releaseTitle}</Link>
        </div>
      )}
      <div className="td genre">{track.genres.slice(0, 2).join(', ')}</div>
      <div className="td bpm">{track.bpm || ''}</div>
      <div className="td icons">
        <span className={`cs ${track.creatorSafe ? 'ok' : 'no'}`} title={track.creatorSafe ? t('track.copyrightSafe') : t('track.licenseRequired')}>
          <IconShield ok={track.creatorSafe} size={15} />
        </span>
        {loggedIn && (
          <button className={`icon-btn fav ${fav ? 'on' : ''}`} onClick={toggleFav} onDoubleClick={(e) => e.stopPropagation()} aria-label={fav ? t('favorites.remove') : t('favorites.add')} title={fav ? t('favorites.remove') : t('favorites.add')}>
            <IconHeart filled={fav} size={15} />
          </button>
        )}
      </div>
      <div className="td dur">{fmtDuration(track.duration)}</div>
      <div className="td status-cell">
        <StatusIcon status={status} queued={queued} />
        {status !== 'downloaded' && !queued && !track.preRelease && (
          <button className="icon-btn dl-hover" onClick={(e) => { e.stopPropagation(); void downloadTracks([track]) }} aria-label={t('download.download')}>
            <IconDownload size={15} />
          </button>
        )}
        <button
          className="icon-btn"
          onMouseDown={(e) => menu === 'button' && e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); setMenu((m) => (m === 'button' ? null : 'button')) }}
          aria-label={t('common.more')}
        >
          <IconMore size={16} />
        </button>
        {menu && <TrackMenu track={track} at={menu === 'button' ? undefined : menu} onClose={closeMenu} />}
      </div>
    </div>
  )
})

export function TrackTable({
  tracks,
  showCover = true,
  showRelease = true,
  numbering = 'index'
}: {
  tracks: TrackLite[]
  showCover?: boolean
  showRelease?: boolean
  numbering?: 'index' | 'track'
}) {
  const { t } = useTranslation()
  const current = usePlayer((s) => s.current)
  const playing = usePlayer((s) => s.playing)
  const snap = useLibrary((s) => s.snap)
  const queue = useDownloads((s) => s.queue)
  const queued = queuedTrackIds(queue)
  // Manche Quellen (z.B. Namenssuche) liefern keine Artist-IDs → gesammelt nachladen, damit Namen verlinkt sind
  const missing = useMemo(() => [...new Set(tracks.filter((t) => !t.artists.length).map((t) => t.trackId))].sort(), [tracks])
  const extra = useQuery({ queryKey: ['track-artists', missing], queryFn: () => artistsForTracks(missing), enabled: missing.length > 0, staleTime: 3600_000 })
  const enriched = useMemo(
    () => (extra.data ? tracks.map((t) => (t.artists.length || !extra.data[t.trackId] ? t : { ...t, artists: extra.data[t.trackId] })) : tracks),
    [tracks, extra.data]
  )
  const onPlay = (i: number): void => usePlayer.getState().playList(enriched, i)
  return (
    <div className={`tracktable ${showRelease ? 'with-rel' : ''}`} role="table">
      <div className="tr head" role="row">
        <div className="td num">#</div>
        <div className="td">{t('table.title')}</div>
        {showRelease && <div className="td rel">{t('table.release')}</div>}
        <div className="td genre">{t('table.genre')}</div>
        <div className="td bpm">{t('table.bpm')}</div>
        <div className="td icons" />
        <div className="td dur">{t('table.duration')}</div>
        <div className="td status-cell" />
      </div>
      {enriched.map((t, i) => (
        <Row
          key={`${t.trackId}-${t.releaseId}-${i}`}
          track={t}
          index={i}
          number={numbering === 'track' && t.trackNumber ? t.trackNumber : i + 1}
          showCover={showCover}
          showRelease={showRelease}
          active={current?.trackId === t.trackId}
          playing={playing}
          status={trackStatus(snap, t.trackId)}
          queued={queued.has(t.trackId)}
          onPlay={onPlay}
        />
      ))}
    </div>
  )
}

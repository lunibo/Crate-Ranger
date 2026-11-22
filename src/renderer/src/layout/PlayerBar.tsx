import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { releaseCover } from '../lib/api'
import { fmtDateTime, fmtDuration } from '../lib/format'
import { downloadTracks, trackStatus, useLibrary } from '../lib/stores'
import { usePlayer } from '../player/player'
import { Cover } from '../components/Common'
import {
  IconCheck, IconDownload, IconMute, IconNext, IconPause, IconPlay, IconPrev, IconQueue, IconRepeat, IconShuffle, IconVolume
} from '../components/Icons'
import { Artists } from '../components/TrackTable'
import { ArtistLinks, TrackLink } from '../components/ArtistLinks'
import { FavButton } from '../components/FavButton'

function Slider({ value, max, onChange, className }: { value: number; max: number; onChange: (v: number) => void; className?: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <input
      type="range"
      className={`slider ${className ?? ''}`}
      min={0}
      max={max || 1}
      step={max > 2 ? 0.5 : 0.01}
      value={Math.min(value, max || 1)}
      style={{ '--pct': `${pct}%` } as React.CSSProperties}
      onChange={(e) => onChange(Number(e.target.value))}
    />
  )
}

export function PlayerBar() {
  const { t } = useTranslation()
  const p = usePlayer()
  const snap = useLibrary((s) => s.snap)
  const [showQueue, setShowQueue] = useState(false)
  const cur = p.current
  const status = cur ? trackStatus(snap, cur.trackId) : 'none'
  return (
    <footer className="playerbar">
      <div className="pb-left">
        {cur ? (
          <>
            <Link to={`/release/${cur.releaseId}`}><Cover src={releaseCover(cur.releaseId, 128)} alt={cur.title} size={56} /></Link>
            <div className="pb-meta">
              <div className="pb-title"><TrackLink trackId={cur.trackId} title={cur.title} version={cur.version} /></div>
              <div className="pb-artist"><Artists track={cur} /></div>
            </div>
            <FavButton track={cur} size={17} />
            {status === 'downloaded' ? (
              <span className="status ok" title={t('status.downloaded')}><IconCheck size={16} /></span>
            ) : (
              <button
                className="icon-btn"
                disabled={cur.preRelease}
                title={cur.preRelease ? t('preRelease.availableFrom', { date: fmtDateTime(cur.releaseDate) }) : t('download.download')}
                onClick={() => void downloadTracks([cur])}
              >
                <IconDownload size={16} />
              </button>
            )}
          </>
        ) : (
          <span className="muted">{t('player.nothingPlaying')}</span>
        )}
      </div>
      <div className="pb-center">
        <div className="pb-controls">
          <button className={`icon-btn ${p.shuffle ? 'on' : ''}`} onClick={p.toggleShuffle} title={t('player.shuffle')}><IconShuffle size={16} /></button>
          <button className="icon-btn" onClick={p.prev} title={t('player.previous')}><IconPrev /></button>
          <button className="play-btn" onClick={p.toggle} disabled={!cur} title={p.playing ? t('player.pause') : t('player.play')}>
            {p.loading ? <span className="spinner small" /> : p.playing ? <IconPause /> : <IconPlay />}
          </button>
          <button className="icon-btn" onClick={() => p.next()} title={t('player.next')}><IconNext /></button>
          <button className={`icon-btn ${p.repeat !== 'off' ? 'on' : ''}`} onClick={p.cycleRepeat} title={t(`player.repeat.${p.repeat}`)}>
            <IconRepeat size={16} />
            {p.repeat === 'one' && <span className="repeat-one">1</span>}
          </button>
        </div>
        <div className="pb-progress">
          <span className="time">{fmtDuration(p.time)}</span>
          <Slider value={p.time} max={p.duration} onChange={p.seek} />
          <span className="time">{fmtDuration(p.duration)}</span>
        </div>
      </div>
      <div className="pb-right">
        {p.source && <span className={`src-badge ${p.source}`}>{p.source === 'local' ? t('player.sourceLocal') : t('player.sourceStream')}</span>}
        <button className={`icon-btn ${showQueue ? 'on' : ''}`} onClick={() => setShowQueue((s) => !s)} title={t('player.queue')}><IconQueue size={17} /></button>
        <button className="icon-btn" onClick={p.toggleMute} title={t('player.mute')}>{p.muted || p.volume === 0 ? <IconMute size={17} /> : <IconVolume size={17} />}</button>
        <Slider value={p.muted ? 0 : p.volume} max={1} onChange={p.setVolume} className="vol" />
      </div>
      {showQueue && (
        <div className="queue-panel">
          <div className="queue-head">{t('player.queue')}</div>
          {p.order.slice(p.pos).map((qi, i) => {
            const qt = p.queue[qi]
            return (
              <div
                key={`${qi}-${i}`}
                className={`queue-item ${i === 0 ? 'active' : ''}`}
                role="button"
                tabIndex={0}
                onClick={() => p.jumpTo(p.pos + i)}
                onKeyDown={(e) => e.key === 'Enter' && p.jumpTo(p.pos + i)}
              >
                <span className="qi-title"><TrackLink trackId={qt.trackId} title={qt.title} version={qt.version} /></span>
                <span className="qi-artist"><ArtistLinks artists={qt.artists} text={qt.artistsTitle} trackId={qt.trackId} releaseId={qt.releaseId} /></span>
              </div>
            )
          })}
        </div>
      )}
    </footer>
  )
}

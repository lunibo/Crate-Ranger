import { Fragment, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { releaseCover } from '../lib/api'
import { fmtDateTime, fmtDuration } from '../lib/format'
import { downloadTracks, trackStatus, useLibrary } from '../lib/stores'
import { usePlayer } from '../player/player'
import { Cover } from '../components/Common'
import {
  IconCheck, IconDownload, IconGrip, IconMute, IconNext, IconPause, IconPlay, IconPrev, IconQueue, IconRepeat, IconShuffle, IconVolume, IconX
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

interface Drag {
  /** Position in order des gezogenen Tracks */
  from: number
  startY: number
  active: boolean
  /** Einfügeposition in order (vor diesem Eintrag; order.length = ans Ende) */
  over: number
}

function QueuePanel() {
  const { t } = useTranslation()
  const p = usePlayer()
  const panel = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<Drag | null>(null)
  const dragRef = useRef<Drag | null>(null)
  const suppressClick = useRef(false)
  const pointerY = useRef(0)
  const upcoming = p.order.length - p.pos - 1

  const update = (d: Drag | null): void => {
    dragRef.current = d
    setDrag(d)
  }

  /** Einfügeposition aus der Mausposition: vor dem ersten kommenden Eintrag, dessen Mitte unterhalb liegt */
  const dropTarget = (y: number): number => {
    const { pos, order } = usePlayer.getState()
    const items = panel.current?.querySelectorAll<HTMLElement>('.queue-item[data-pos]') ?? []
    for (const el of items) {
      const at = Number(el.dataset.pos)
      if (at <= pos) continue
      const r = el.getBoundingClientRect()
      if (y < r.top + r.height / 2) return at
    }
    return order.length
  }

  // Beim Ziehen am Rand automatisch scrollen
  useEffect(() => {
    if (!drag?.active) return
    let raf = 0
    const tick = (): void => {
      const el = panel.current
      if (el) {
        const r = el.getBoundingClientRect()
        const y = pointerY.current
        const edge = 40
        const dy = y < r.top + edge ? -Math.ceil((r.top + edge - y) / 4) : y > r.bottom - edge ? Math.ceil((y - (r.bottom - edge)) / 4) : 0
        if (dy) {
          el.scrollTop += dy
          const d = dragRef.current
          if (d) {
            const over = dropTarget(y)
            if (over !== d.over) update({ ...d, over })
          }
        }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [drag?.active])

  const onPointerDown = (e: React.PointerEvent, at: number): void => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('.qi-remove')) return
    pointerY.current = e.clientY
    update({ from: at, startY: e.clientY, active: false, over: at })
  }
  const onPointerMove = (e: React.PointerEvent): void => {
    const d = dragRef.current
    if (!d) return
    pointerY.current = e.clientY
    if (!d.active) {
      if (Math.abs(e.clientY - d.startY) < 5) return
      // Erst ab echtem Ziehen einfangen – sonst landen Klicks auf Links im Eintrag nicht beim Link
      e.currentTarget.setPointerCapture(e.pointerId)
    }
    update({ ...d, active: true, over: dropTarget(e.clientY) })
  }
  const onPointerUp = (): void => {
    const d = dragRef.current
    update(null)
    if (!d?.active) return
    suppressClick.current = true // Klick nach dem Loslassen nicht als „Abspielen“ werten
    setTimeout(() => (suppressClick.current = false))
    const to = d.over > d.from ? d.over - 1 : d.over
    usePlayer.getState().moveInQueue(d.from, to)
  }
  const onClick = (at: number): void => {
    if (suppressClick.current) return
    p.jumpTo(at)
  }

  // Esc bricht das Ziehen ab
  useEffect(() => {
    if (!drag) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') update(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [!!drag])

  const rest = p.order.slice(p.pos)
  return (
    <div className={`queue-panel ${drag?.active ? 'dragging' : ''}`} ref={panel}>
      <div className="queue-head">
        <span>{t('player.queue')}</span>
        {upcoming > 0 && (
          <button className="btn btn-ghost btn-sm" onClick={p.clearQueue} title={t('playQueue.clearHint')}>{t('playQueue.clear')}</button>
        )}
      </div>
      {rest.map((qi, i) => {
        const at = p.pos + i
        const qt = p.queue[qi]
        // Trennzeile vor den kommenden Tracks, die „Endlos hören“ angehängt hat
        const autoplayStart = qt.autoplay && i > 0 && (i === 1 || !p.queue[rest[i - 1]].autoplay)
        const dropBefore = drag?.active && drag.over === at && at !== drag.from && at !== drag.from + 1
        const dropAfter = drag?.active && i === rest.length - 1 && drag.over === p.order.length && at !== drag.from
        return (
          <Fragment key={`${qi}-${at}`}>
            {i === 1 && !qt.autoplay && <div className="queue-sub">{t('playQueue.upNext')}</div>}
            {autoplayStart && <div className="queue-divider">{t('autoplay.queueHeading')}</div>}
            <div
              className={`queue-item ${i === 0 ? 'active' : 'movable'} ${drag?.active && drag.from === at ? 'is-dragged' : ''} ${dropBefore ? 'drop-before' : ''} ${dropAfter ? 'drop-after' : ''}`}
              data-pos={at}
              role="button"
              tabIndex={0}
              onClick={() => onClick(at)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') p.jumpTo(at)
                if (i > 0 && (e.key === 'Delete' || e.key === 'Backspace')) p.removeFromQueue(at)
              }}
              {...(i > 0 && {
                onPointerDown: (e: React.PointerEvent) => onPointerDown(e, at),
                onPointerMove,
                onPointerUp,
                onPointerCancel: () => update(null),
                onMouseDown: (e: React.MouseEvent) => e.button === 0 && e.preventDefault() // kein natives Ziehen von Links/Text
              })}
            >
              {i > 0 && <span className="qi-grip" aria-hidden><IconGrip size={14} /></span>}
              <span className="qi-text">
                <span className="qi-title"><TrackLink trackId={qt.trackId} title={qt.title} version={qt.version} /></span>
                <span className="qi-artist"><ArtistLinks artists={qt.artists} text={qt.artistsTitle} trackId={qt.trackId} releaseId={qt.releaseId} /></span>
              </span>
              {i > 0 && (
                <button
                  className="icon-btn qi-remove"
                  onClick={(e) => {
                    e.stopPropagation()
                    p.removeFromQueue(at)
                  }}
                  title={t('playQueue.remove')}
                  aria-label={t('playQueue.remove')}
                >
                  <IconX size={14} />
                </button>
              )}
            </div>
          </Fragment>
        )
      })}
      {upcoming === 0 && <div className="queue-empty muted small">{t('playQueue.empty')}</div>}
    </div>
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
      {showQueue && <QueuePanel />}
    </footer>
  )
}

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { fmtDateTime } from '../lib/format'
import { useTranslation } from 'react-i18next'
import type { DownloadFormat } from '@shared/types'
import { FORMAT_LABEL } from '@shared/types'
import { errorMessage, type TrackLite } from '../lib/api'
import { useSettings, useToasts } from '../lib/stores'
import { IconAlert, IconDownload, IconMore, IconX } from './Icons'
import { usePlayer } from '../player/player'

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="spinner-wrap" role="status">
      <span className="spinner" />
      {label && <span className="muted">{label}</span>}
    </div>
  )
}

export function ErrorBox({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { t } = useTranslation()
  return (
    <div className="error-box">
      <IconAlert />
      <span>{errorMessage(error)}</span>
      {onRetry && (
        <button className="btn btn-ghost btn-sm" onClick={onRetry}>
          {t('common.retry')}
        </button>
      )}
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>
}

export function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="section">
      <div className="section-head">
        <h2>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

export function Cover({ src, alt, round, size }: { src?: string; alt: string; round?: boolean; size?: number }) {
  const [failed, setFailed] = useState(false)
  return (
    <div className={`cover ${round ? 'round' : ''}`} style={size ? { width: size, height: size } : undefined}>
      {src && !failed ? <img src={src} alt={alt} loading="lazy" onError={() => setFailed(true)} /> : <div className="cover-fallback">{alt.slice(0, 1)}</div>}
    </div>
  )
}

/** Download-Button mit Format-Auswahl. */
export function DownloadMenu({
  onDownload,
  label,
  compact,
  disabled,
  unavailableUntil
}: {
  onDownload: (format: DownloadFormat, force: boolean) => void
  label?: string
  compact?: boolean
  disabled?: boolean
  /** Pre-Release: Download erst ab diesem Zeitpunkt möglich */
  unavailableUntil?: string
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const def = useSettings((s) => s.settings?.format ?? 'FLAC')
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent): void => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [open])
  if (unavailableUntil) {
    const when = fmtDateTime(unavailableUntil)
    return (
      <button className={compact ? 'icon-btn' : 'btn btn-secondary'} disabled title={t('preRelease.availableFrom', { date: when })}>
        <IconDownload />
        {!compact && <span>{t('preRelease.downloadFrom', { date: when })}</span>}
      </button>
    )
  }
  const pick = (f: DownloadFormat, force = false): void => {
    setOpen(false)
    onDownload(f, force)
  }
  return (
    <div className="dl-menu" ref={ref}>
      <div className="btn-split">
        <button
          className={compact ? 'icon-btn' : 'btn btn-secondary'}
          onClick={() => pick(def)}
          disabled={disabled}
          title={t('download.asFormat', { format: FORMAT_LABEL[def] })}
        >
          <IconDownload />
          {!compact && <span>{label ?? t('download.download')}</span>}
        </button>
        {!compact && (
          <button className="btn btn-secondary btn-caret" onClick={() => setOpen((o) => !o)} disabled={disabled} aria-label={t('download.chooseFormat')}>
            ▾
          </button>
        )}
      </div>
      {open && (
        <div className="menu">
          {(['FLAC', 'MP3_320', 'WAV'] as DownloadFormat[]).map((f) => (
            <button key={f} className="menu-item" onClick={() => pick(f)}>
              {FORMAT_LABEL[f]} {f === def && <span className="muted">({t('download.default')})</span>}
            </button>
          ))}
          <div className="menu-sep" />
          <button className="menu-item" onClick={() => pick(def, true)}>
            {t('download.redownloadOverwrite')}
          </button>
        </div>
      )}
    </div>
  )
}

export function Toasts() {
  const { t } = useTranslation()
  const { toasts, dismiss } = useToasts()
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((toastItem) => (
        <div key={toastItem.id} className={`toast toast-${toastItem.kind}`}>
          <span>{toastItem.text}</span>
          <button className="icon-btn" onClick={() => dismiss(toastItem.id)} aria-label={t('common.close')}>
            <IconX size={14} />
          </button>
        </div>
      ))}
    </div>
  )
}

export function LoadMore({ onClick, loading, hasMore }: { onClick: () => void; loading: boolean; hasMore: boolean }) {
  const { t } = useTranslation()
  if (!hasMore) return null
  return (
    <div className="load-more">
      <button className="btn btn-ghost" onClick={onClick} disabled={loading}>
        {loading ? t('common.loading') : t('common.loadMore')}
      </button>
    </div>
  )
}

export function Chip({ active, onClick, children }: { active?: boolean; onClick?: () => void; children: ReactNode }) {
  return (
    <button className={`chip ${active ? 'active' : ''}`} onClick={onClick}>
      {children}
    </button>
  )
}

/** ⋯-Menü im Seitenkopf (Release, Track): Tracks in die Wiedergabe-Warteschlange */
export function QueueMenu({ tracks, playNextLabel, addLabel }: { tracks: TrackLite[]; playNextLabel: string; addLabel: string }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent): void => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', close)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])
  const act = (fn: () => void) => () => {
    fn()
    setOpen(false)
  }
  return (
    <div className="dl-menu" ref={ref}>
      <button className="icon-btn" disabled={!tracks.length} onClick={() => setOpen((o) => !o)} aria-label={t('common.more')} title={t('common.more')}>
        <IconMore size={22} />
      </button>
      {open && (
        <div className="menu" role="menu">
          <button className="menu-item" onClick={act(() => usePlayer.getState().playNext(tracks))}>{playNextLabel}</button>
          <button className="menu-item" onClick={act(() => usePlayer.getState().addToQueue(tracks))}>{addLabel}</button>
        </div>
      )}
    </div>
  )
}

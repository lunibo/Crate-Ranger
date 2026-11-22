import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { DownloadJob, JobStatus } from '@shared/types'
import { FORMAT_LABEL } from '@shared/types'
import { releaseCover } from '../lib/api'
import { fmtBytes, fmtTime } from '../lib/format'
import { useDownloads } from '../lib/stores'
import { Cover, Empty } from '../components/Common'
import { QuotaMeter } from '../components/QuotaMeter'
import { ArtistLinks, TrackLink } from '../components/ArtistLinks'
import { IconAlert, IconCheck, IconFolder, IconRefresh, IconX } from '../components/Icons'


function JobRow({ j }: { j: DownloadJob }) {
  const { t } = useTranslation()
  const pct = j.total ? Math.round((j.loaded / j.total) * 100) : 0
  const active = j.status === 'downloading' || j.status === 'preparing' || j.status === 'tagging'
  return (
    <div className={`job job-${j.status}`}>
      <Link to={`/release/${j.releaseId}`}><Cover src={releaseCover(j.releaseId, 96)} alt={j.title} size={44} /></Link>
      <div className="job-main">
        <div className="job-title">
          <TrackLink trackId={j.trackId} title={j.title} />
          <span className="muted"> – <ArtistLinks text={j.artist} trackId={j.trackId} releaseId={j.releaseId} /></span>
          {j.releaseTitle && <span className="muted"> · <Link to={`/release/${j.releaseId}`}>{j.releaseTitle}</Link></span>}
        </div>
        <div className="job-sub">
          <span className="fmt">{FORMAT_LABEL[j.format]}</span>
          <span className={`job-status s-${j.status}`}>{t(`jobStatus.${j.status}`)}</span>
          {j.status === 'downloading' && j.total > 0 && <span className="muted">{fmtBytes(j.loaded)} / {fmtBytes(j.total)}</span>}
          {j.error && <span className="job-error" title={j.error}>{j.error}</span>}
        </div>
        {active && <div className="bar"><div className="bar-fill" style={{ width: `${j.status === 'tagging' ? 100 : pct}%` }} /></div>}
      </div>
      <div className="job-actions">
        {(j.status === 'done' || j.status === 'skipped') && j.path && (
          <button className="icon-btn" title={t('common.showInExplorer')} onClick={() => void window.ss.shell.showItem(j.path!)}><IconFolder size={16} /></button>
        )}
        {j.status === 'done' && <span className="status ok"><IconCheck size={16} /></span>}
        {(j.status === 'error' || j.status === 'cancelled') && (
          <button className="icon-btn" title={t('common.retry')} onClick={() => void window.ss.downloads.retry(j.id)}><IconRefresh size={16} /></button>
        )}
        {(j.status === 'queued' || active) && (
          <button className="icon-btn" title={t('common.cancel')} onClick={() => void window.ss.downloads.cancel(j.id)}><IconX size={16} /></button>
        )}
      </div>
    </div>
  )
}

export function DownloadsPage() {
  const { t } = useTranslation()
  const q = useDownloads((s) => s.queue)
  const counts = q.jobs.reduce<Record<string, number>>((m, j) => ({ ...m, [j.status]: (m[j.status] ?? 0) + 1 }), {})
  const open = (counts.queued ?? 0) + (counts.preparing ?? 0) + (counts.downloading ?? 0) + (counts.tagging ?? 0)
  const order: JobStatus[] = ['downloading', 'tagging', 'preparing', 'queued', 'error', 'cancelled', 'done', 'skipped']
  const jobs = [...q.jobs].sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status) || a.addedAt - b.addedAt)
  return (
    <div className="page">
      <div className="page-head-row">
        <h1 className="page-title">{t('nav.downloads')}</h1>
        <span className="muted">{t('downloads.summary', { open, done: counts.done ?? 0, skipped: counts.skipped ?? 0, errors: counts.error ?? 0 })}</span>
      </div>
      <QuotaMeter />
      {q.paused && (
        <div className="notice warn">
          <IconAlert size={16} /> <span>{q.pauseReason ? t('downloads.pausedReason', { reason: q.pauseReason }) : t('downloads.paused')}</span>
          <button className="btn btn-primary btn-sm" onClick={() => void window.ss.downloads.resume()}>{t('downloads.resume')}</button>
        </div>
      )}
      {q.retryAt && !q.paused && (
        <div className="notice">{t('downloads.retryAt', { time: fmtTime(q.retryAt) })}</div>
      )}
      <div className="actions">
        {!q.paused ? (
          <button className="btn btn-secondary" onClick={() => void window.ss.downloads.pause()} disabled={!open}>{t('downloads.pause')}</button>
        ) : (
          <button className="btn btn-secondary" onClick={() => void window.ss.downloads.resume()}>{t('downloads.resume')}</button>
        )}
        <button className="btn btn-secondary" onClick={() => void window.ss.downloads.retry()} disabled={!counts.error && !counts.cancelled}>{t('downloads.retryFailed')}</button>
        <button className="btn btn-ghost" onClick={() => void window.ss.downloads.clearFinished()}>{t('downloads.clearFinished')}</button>
      </div>
      {jobs.length ? <div className="jobs">{jobs.map((j) => <JobRow key={j.id} j={j} />)}</div> : <Empty>{t('downloads.empty')}</Empty>}
    </div>
  )
}

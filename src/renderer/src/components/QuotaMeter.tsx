import { useTranslation } from 'react-i18next'
import { useQuota } from '../lib/stores'
import { fmtDay, fmtNumber as fmt } from '../lib/format'

const day = (iso?: string): string => (iso ? fmtDay(iso) : '')

/** Geschätztes Download-Kontingent im aktuellen Abrechnungszeitraum. */
export function QuotaMeter({ compact }: { compact?: boolean }) {
  const { t } = useTranslation()
  const q = useQuota((s) => s.quota)
  if (!q) return null
  const pct = q.limit ? Math.min(100, (q.used / q.limit) * 100) : 0
  const level = q.limitReached || (q.limit && pct >= 95) ? 'crit' : q.limit && pct >= 80 ? 'warn' : ''
  const title = t('quota.explanation', { monthly: fmt(3000) })

  if (compact) {
    return (
      <div className={`quota compact ${level}`} title={title}>
        <div className="quota-line">
          <span>{t('quota.downloads')}</span>
          <span className="quota-num">{q.limitReached ? t('quota.limitReached') : q.limit ? `${fmt(q.used)} / ${fmt(q.limit)}` : `${fmt(q.used)} · ${t('quota.unlimited')}`}</span>
        </div>
        {q.limit !== null && <div className="bar"><div className="bar-fill" style={{ width: `${q.limitReached ? 100 : pct}%` }} /></div>}
        {q.periodEnd && <div className="quota-sub">{t('quota.resetOn', { date: day(q.periodEnd) })}</div>}
      </div>
    )
  }

  return (
    <div className={`quota full ${level}`}>
      <div className="quota-head">
        <div>
          <div className="quota-big">
            {q.limit ? <>{fmt(q.used)} <span className="muted">/ {fmt(q.limit)}</span></> : fmt(q.used)}
          </div>
          <div className="muted small">
            {q.limit ? t('quota.thisPeriod') : t('quota.noLimitKnown')}
            {q.periodStart && q.periodEnd && ` · ${day(q.periodStart)} – ${day(q.periodEnd)}`}
          </div>
        </div>
        {q.remaining !== null && (
          <div className="quota-remaining">
            <div className="quota-big">{fmt(q.remaining)}</div>
            <div className="muted small">{t('quota.remaining')}</div>
          </div>
        )}
      </div>
      {q.limit !== null && <div className="bar big"><div className="bar-fill" style={{ width: `${q.limitReached ? 100 : pct}%` }} /></div>}
      {q.limitReached && <div className="quota-alert">{t('quota.serverSaysExhausted', { message: q.limitReached.message })}</div>}
      <div className="hint">{title}</div>
    </div>
  )
}

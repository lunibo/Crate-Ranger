import { useTranslation } from 'react-i18next'
import { fmtDateTime } from '../lib/format'

/** Kennzeichnung für noch nicht veröffentlichte Tracks/Releases (Download erst ab Release-Zeitpunkt). */
export function PreReleaseBadge({ date, compact, className }: { date?: string; compact?: boolean; className?: string }) {
  const { t } = useTranslation()
  const title = date ? t('preRelease.availableFrom', { date: fmtDateTime(date) }) : undefined
  return (
    <span className={`badge-pre ${compact ? 'compact' : ''} ${className ?? ''}`} title={title}>
      {compact ? t('preRelease.short') : t('preRelease.badge')}
    </span>
  )
}

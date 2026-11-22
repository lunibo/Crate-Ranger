import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { queryClient } from '../lib/queryClient'
import { toast, useSettings } from '../lib/stores'
import { Section } from './Common'

/** Einstellungen für die lokale Hörstatistik (Field Report). */
export function StatsSection() {
  const { t } = useTranslation()
  const { settings, update } = useSettings()
  const [confirm, setConfirm] = useState(false)
  if (!settings) return null
  const clear = async (): Promise<void> => {
    await window.ss.stats.clear()
    await queryClient.invalidateQueries({ queryKey: ['stats'] })
    setConfirm(false)
    toast('success', t('settings.stats.cleared'))
  }
  return (
    <Section title={t('settings.stats.title')}>
      <div className="card-box">
        <label className="check">
          <input type="checkbox" checked={settings.statsEnabled} onChange={(e) => void update({ statsEnabled: e.target.checked })} />
          {t('settings.stats.enable')}
        </label>
        <div className="hint">
          {t('settings.stats.hint')} <Link to="/field-report">{t('nav.report')}</Link>
        </div>
        {confirm ? (
          <div className="row">
            <span className="muted">{t('settings.stats.confirm')}</span>
            <button className="btn btn-secondary btn-sm danger" onClick={() => void clear()}>{t('settings.stats.confirmYes')}</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setConfirm(false)}>{t('common.cancel')}</button>
          </div>
        ) : (
          <button className="btn btn-ghost" onClick={() => setConfirm(true)}>{t('settings.stats.clear')}</button>
        )}
      </div>
    </Section>
  )
}

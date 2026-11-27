import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { fmtDateTime } from '../lib/format'
import { useSettings } from '../lib/stores'
import { openRelease, useUpdate } from '../lib/update'
import { Section } from './Common'

/** Einstellungen → Updates: Zustimmung, installierte Version, manuelle Prüfung. */
export function UpdateSection() {
  const { t } = useTranslation()
  const { settings, update } = useSettings()
  const { state, init, check } = useUpdate()
  useEffect(() => init(), [init])
  if (!settings) return null
  const checking = state?.status === 'checking'
  return (
    <Section title={t('update.settingsTitle')}>
      <div className="card-box">
        <label className="check">
          <input type="checkbox" checked={settings.updateCheck === true} onChange={(e) => void update({ updateCheck: e.target.checked })} />
          {t('update.enable')}
        </label>
        <div className="hint">{t('update.hint')}</div>
        <div className="kv"><span>{t('update.installed')}</span><span>{state?.currentVersion ?? '–'}</span></div>
        {state?.latestVersion && <div className="kv"><span>{t('update.latest')}</span><span>{state.latestVersion}</span></div>}
        <div className="row update-row">
          <button className="btn btn-secondary btn-sm" disabled={checking} onClick={() => void check()}>
            {checking ? t('update.checking') : t('update.checkNow')}
          </button>
          {state?.status === 'available' && (
            <button className="btn btn-primary btn-sm" onClick={() => openRelease(state.url)}>{t('update.download')}</button>
          )}
          <span className={`muted ${state?.status === 'error' ? 'update-error' : ''}`}>
            {state?.status === 'current' && t('update.upToDate')}
            {state?.status === 'available' && t('update.availableShort', { version: state.latestVersion })}
            {state?.status === 'error' && t('update.failed', { error: state.error ?? '' })}
            {state?.checkedAt && state.status !== 'checking' ? ` · ${t('update.checkedAt', { date: fmtDateTime(new Date(state.checkedAt).toISOString()) })}` : ''}
          </span>
        </div>
      </div>
    </Section>
  )
}

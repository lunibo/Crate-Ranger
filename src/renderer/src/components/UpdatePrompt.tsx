import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useSettings } from '../lib/stores'
import { openRelease, useUpdate } from '../lib/update'
import { IconX } from './Icons'

/**
 * Beim ersten Start: Zustimmung zur Update-Prüfung einholen (Anfrage an GitHub).
 * Danach: Hinweis, wenn eine neuere Version veröffentlicht wurde.
 */
export function UpdatePrompt() {
  const { t } = useTranslation()
  const { settings, update } = useSettings()
  const { state, dismissed, init, dismiss } = useUpdate()
  useEffect(() => init(), [init])
  if (!settings) return null

  if (settings.updateCheck === null) {
    return (
      <div className="prompt-card" role="dialog" aria-labelledby="update-consent-title">
        <div id="update-consent-title" className="ap-title">{t('update.consentTitle')}</div>
        <p>{t('update.consentText')}</p>
        <div className="row">
          <button className="btn btn-primary btn-sm" onClick={() => void update({ updateCheck: true })}>{t('update.consentYes')}</button>
          <button className="btn btn-ghost btn-sm" onClick={() => void update({ updateCheck: false })}>{t('update.consentNo')}</button>
        </div>
        <div className="hint">{t('update.consentHint')}</div>
      </div>
    )
  }

  if (state?.status !== 'available' || !state.latestVersion || dismissed === state.latestVersion) return null
  return (
    <div className="prompt-card" role="dialog" aria-labelledby="update-available-title">
      <button className="icon-btn close" onClick={dismiss} aria-label={t('common.close')}><IconX size={14} /></button>
      <div id="update-available-title" className="ap-title">{t('update.availableTitle', { version: state.latestVersion })}</div>
      <p>{t('update.availableText', { current: state.currentVersion })}</p>
      <div className="row">
        <button className="btn btn-primary btn-sm" onClick={() => openRelease(state.url)}>{t('update.download')}</button>
        <button className="btn btn-ghost btn-sm" onClick={dismiss}>{t('update.later')}</button>
      </div>
    </div>
  )
}

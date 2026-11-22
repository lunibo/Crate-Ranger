import { useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { useAuth } from '../lib/stores'
import { IconX } from './Icons'

/** Anmeldung: eingebettetes SoundScout-Fenster oder – falls die Captcha-Prüfung dort scheitert – Browser-Sitzung übernehmen. */
export function LoginDialog() {
  const { t } = useTranslation()
  const { dialog, busy, openDialog, login, importSession } = useAuth()
  const [value, setValue] = useState('')
  const [showAlt, setShowAlt] = useState(false)
  if (!dialog) return null
  const submit = (): void => void importSession(value).then((ok) => ok && setValue(''))
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && openDialog(false)}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="login-title">
        <div className="modal-head">
          <h2 id="login-title">{t('login.title')}</h2>
          <button className="icon-btn" onClick={() => openDialog(false)} aria-label={t('common.close')}><IconX /></button>
        </div>
        <p className="muted">{t('login.intro')}</p>
        <button className="btn btn-primary" disabled={busy} onClick={() => void login()}>
          {busy && !showAlt ? t('login.waiting') : t('login.useWindow')}
        </button>
        <button className="link-btn" onClick={() => setShowAlt((s) => !s)}>
          {t('login.altToggle')} {showAlt ? '▴' : '▾'}
        </button>
        {showAlt && (
          <div className="alt-login">
            <ol>
              <li>
                <Trans
                  i18nKey="login.altStep1"
                  components={{ open: <button className="link-btn inline" onClick={() => void window.ss.auth.openBrowserLogin()} /> }}
                />
              </li>
              <li>
                <Trans i18nKey="login.altStep2" components={{ kbd: <kbd />, b: <b />, code: <code /> }} />
              </li>
              <li>
                <Trans i18nKey="login.altStep3" components={{ b: <b />, code: <code /> }} />
              </li>
            </ol>
            <div className="row">
              <input
                className="input grow mono"
                type="password"
                placeholder={t('login.cookiePlaceholder')}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && value && submit()}
              />
              <button className="btn btn-secondary" disabled={!value || busy} onClick={submit}>
                {t('login.apply')}
              </button>
            </div>
            <p className="hint">{t('login.cookieWarning')}</p>
          </div>
        )}
      </div>
    </div>
  )
}

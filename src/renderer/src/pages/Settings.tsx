import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { DownloadFormat } from '@shared/types'
import { DEFAULT_PATH_TEMPLATE, FORMAT_LABEL } from '@shared/types'
import { AVAILABLE_LANGUAGES, SYSTEM_LANGUAGE } from '@shared/i18n'
import { fmtDate } from '../lib/format'
import { toast, useAuth, useSettings } from '../lib/stores'
import { Section, Spinner } from '../components/Common'
import { QuotaMeter } from '../components/QuotaMeter'
import { DiscordSection } from '../components/DiscordSection'
import { StatsSection } from '../components/StatsSection'

const PLACEHOLDERS = ['releaseArtist', 'year', 'releaseTitle', 'catalogId', 'trackNo', 'trackTitle', 'title', 'version', 'trackArtist', 'brand', 'releaseType', 'label']

export function SettingsPage() {
  const { t, i18n } = useTranslation()
  const { settings, update } = useSettings()
  const auth = useAuth()
  const [template, setTemplate] = useState(settings?.pathTemplate ?? '')
  const [preview, setPreview] = useState('')
  useEffect(() => setTemplate(settings?.pathTemplate ?? ''), [settings?.pathTemplate])
  useEffect(() => {
    const timer = setTimeout(() => void window.ss.settings.previewPath(template).then(setPreview).catch(() => setPreview('')), 200)
    return () => clearTimeout(timer)
  }, [template, settings?.downloadRoot, settings?.format])
  if (!settings) return <div className="page"><Spinner /></div>
  const s = auth.state

  const chooseFolder = async (): Promise<void> => {
    const dir = await window.ss.settings.chooseFolder()
    if (dir) {
      await update({ downloadRoot: dir })
      toast('success', t('settings.folderChanged'))
    }
  }

  return (
    <div className="page settings">
      <h1 className="page-title">{t('nav.settings')}</h1>

      <Section title={t('settings.language.title')}>
        <div className="card-box">
          <label className="field">
            <span>{t('settings.language.label')}</span>
            <select className="select" value={settings.language} onChange={(e) => void update({ language: e.target.value })}>
              <option value={SYSTEM_LANGUAGE}>{t('settings.language.system')}</option>
              {AVAILABLE_LANGUAGES.map((l) => (
                <option key={l.code} value={l.code} lang={l.code}>
                  {l.name}{l.code !== i18n.language && l.name !== l.englishName ? ` (${l.englishName})` : ''}
                </option>
              ))}
            </select>
          </label>
        </div>
      </Section>

      <DiscordSection />

      <StatsSection />

      <Section title={t('settings.account.title')}>
        <div className="card-box">
          {s?.loggedIn ? (
            <>
              <div className="kv"><span>{t('settings.account.status')}</span><span className="strong">{t('auth.signedIn')}</span></div>
              <div className="kv"><span>{t('settings.account.plan')}</span><span>{s.planName ?? s.tier}</span></div>
              {s.subscriptionStatus && (
                <div className="kv">
                  <span>{t('settings.account.subscription')}</span>
                  <span>{s.subscriptionStatus}{s.periodEnd ? ` · ${t('settings.account.until', { date: fmtDate(s.periodEnd) })}` : ''}</span>
                </div>
              )}
              <div className="kv"><span>{t('nav.downloads')}</span><span>{s.downloadsAllowed ? t('settings.account.downloadsAllowed') : t('settings.account.downloadsNotIncluded')}</span></div>
              {s.downloadsAllowed && <QuotaMeter />}
              <button className="btn btn-ghost" onClick={() => void auth.logout()} disabled={auth.busy}>{t('auth.signOut')}</button>
            </>
          ) : (
            <>
              <p className="muted">{t('settings.account.signInInfo')}</p>
              <button className="btn btn-primary" onClick={() => auth.openDialog(true)} disabled={auth.busy}>
                {auth.busy ? t('auth.signingIn') : t('login.title')}
              </button>
            </>
          )}
        </div>
      </Section>

      <Section title={t('nav.downloads')}>
        <div className="card-box">
          <label className="field">
            <span>{t('settings.downloads.folder')}</span>
            <div className="row">
              <input className="input grow" readOnly value={settings.downloadRoot} />
              <button className="btn btn-secondary" onClick={() => void chooseFolder()}>{t('settings.downloads.change')}</button>
              <button className="btn btn-ghost" onClick={() => void window.ss.shell.openPath(settings.downloadRoot)}>{t('common.open')}</button>
            </div>
          </label>
          <label className="field">
            <span>{t('settings.downloads.defaultFormat')}</span>
            <div className="row">
              {(['FLAC', 'MP3_320', 'WAV'] as DownloadFormat[]).map((f) => (
                <button key={f} className={`chip ${settings.format === f ? 'active' : ''}`} onClick={() => void update({ format: f })}>{FORMAT_LABEL[f]}</button>
              ))}
            </div>
          </label>
          <label className="field">
            <span>{t('settings.downloads.structure')}</span>
            <input className="input mono" value={template} onChange={(e) => setTemplate(e.target.value)} onBlur={() => template !== settings.pathTemplate && void update({ pathTemplate: template })} />
            <div className="hint">
              {t('settings.downloads.placeholders')} {PLACEHOLDERS.map((p) => <code key={p}>{`{${p}}`}</code>)} · {t('settings.downloads.placeholdersHint')}
            </div>
            {preview && <div className="hint">{t('settings.downloads.example')} <code className="preview">{preview}</code></div>}
            {template !== DEFAULT_PATH_TEMPLATE && (
              <button className="btn btn-ghost btn-sm" onClick={() => { setTemplate(DEFAULT_PATH_TEMPLATE); void update({ pathTemplate: DEFAULT_PATH_TEMPLATE }) }}>
                {t('settings.downloads.restoreDefault')}
              </button>
            )}
          </label>
          <label className="field">
            <span>{t('settings.downloads.concurrency')}</span>
            <select className="select" value={settings.concurrency} onChange={(e) => void update({ concurrency: Number(e.target.value) })}>
              {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <label className="check">
            <input type="checkbox" checked={settings.skipExisting} onChange={(e) => void update({ skipExisting: e.target.checked })} />
            {t('settings.downloads.skipExisting')}
          </label>
          <label className="check">
            <input type="checkbox" checked={settings.saveCoverFile} onChange={(e) => void update({ saveCoverFile: e.target.checked })} />
            {t('settings.downloads.saveCover')}
          </label>
        </div>
      </Section>

      <Section title={t('settings.metadata.title')}>
        <div className="card-box muted small">{t('settings.metadata.description')}</div>
      </Section>

      <p className="muted small disclaimer">{t('brand.disclaimer')}</p>
    </div>
  )
}

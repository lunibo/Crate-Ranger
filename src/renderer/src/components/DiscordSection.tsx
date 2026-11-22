import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { PresenceStatus } from '@shared/types'
import { useSettings } from '../lib/stores'
import { Section } from './Common'

/** Einstellungen für Discord Rich Presence („Hört SoundScout“). */
export function DiscordSection() {
  const { t } = useTranslation()
  const { settings, update } = useSettings()
  const [status, setStatus] = useState<PresenceStatus>({ state: 'disabled' })

  useEffect(() => {
    void window.ss.presence.status().then(setStatus)
    return window.ss.presence.onStatus(setStatus)
  }, [])
  if (!settings) return null

  const statusText = t(`settings.discord.status.${status.state}`, { user: status.user ?? '' })
  const tone = status.state === 'connected' ? 'ok' : status.state === 'error' || status.state === 'missing-client-id' ? 'warn' : ''

  return (
    <Section title={t('settings.discord.title')}>
      <div className="card-box">
        <label className="check">
          <input type="checkbox" checked={settings.discordEnabled} onChange={(e) => void update({ discordEnabled: e.target.checked })} />
          {t('settings.discord.enable')}
        </label>
        <div className="hint">{t('settings.discord.hint')}</div>
        {settings.discordEnabled && (
          <div className={`presence-status ${tone}`}>
            <span className="dot" /> {statusText}
          </div>
        )}
      </div>
    </Section>
  )
}

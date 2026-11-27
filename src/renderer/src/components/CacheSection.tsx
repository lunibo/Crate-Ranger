import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { fmtBytes, fmtNumber } from '../lib/format'
import { clearPersistedQueries, persistedQueriesSize } from '../lib/queryPersist'
import { toast } from '../lib/stores'
import { Section } from './Common'

/** Einstellungen: Größe der Zwischenspeicher anzeigen und leeren. */
export function CacheSection() {
  const { t } = useTranslation()
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  // bewusst nicht gecacht/persistiert: soll beim Öffnen der Einstellungen aktuell sein
  const info = useQuery({
    queryKey: ['cache-info'],
    queryFn: async () => ({ ...(await window.ss.cache.info()), data: await persistedQueriesSize() }),
    staleTime: 0,
    gcTime: 0
  })
  const clear = async (): Promise<void> => {
    setBusy(true)
    try {
      await Promise.all([window.ss.cache.clear(), clearPersistedQueries()])
      toast('success', t('settings.cache.cleared'))
    } finally {
      setBusy(false)
      setConfirm(false)
      void info.refetch()
    }
  }
  const d = info.data
  const total = d ? d.coverBytes + d.httpBytes + d.data.bytes : 0
  return (
    <Section title={t('settings.cache.title')}>
      <div className="card-box">
        <div className="kv"><span>{t('settings.cache.covers')}</span><span>{d ? `${fmtBytes(d.coverBytes)} · ${t('settings.cache.images', { count: d.coverCount, formatted: fmtNumber(d.coverCount) })}` : '…'}</span></div>
        <div className="kv"><span>{t('settings.cache.data')}</span><span>{d ? `${fmtBytes(d.data.bytes)} · ${t('settings.cache.entries', { count: d.data.count, formatted: fmtNumber(d.data.count) })}` : '…'}</span></div>
        <div className="kv"><span>{t('settings.cache.browser')}</span><span>{d ? fmtBytes(d.httpBytes) : '…'}</span></div>
        <div className="kv"><span className="strong">{t('settings.cache.total')}</span><span className="strong">{d ? fmtBytes(total) : '…'}</span></div>
        <div className="hint">{t('settings.cache.hint')}</div>
        {confirm ? (
          <div className="row">
            <span className="muted">{t('settings.cache.confirm')}</span>
            <button className="btn btn-secondary btn-sm danger" disabled={busy} onClick={() => void clear()}>{t('settings.cache.confirmYes')}</button>
            <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setConfirm(false)}>{t('common.cancel')}</button>
          </div>
        ) : (
          <button className="btn btn-ghost" onClick={() => setConfirm(true)}>{t('settings.cache.clear')}</button>
        )}
      </div>
    </Section>
  )
}

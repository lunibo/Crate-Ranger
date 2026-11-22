import type { DownloadFormat, QuotaInfo } from '@shared/types'
import { debounced, readJson, writeJsonAtomic } from '../jsonFile'

/** Laut SoundScout-FAQ: Monatspläne 3.000 Downloads pro Abrechnungszeitraum, Jahrespläne unbegrenzt, Testphase 25. */
export const MONTHLY_LIMIT = 3000
export const TRIAL_LIMIT = 25

export interface PlanStatus {
  Tier?: string
  PlanName?: string
  BillingPeriod?: string
  Start?: string
  Finish?: string
}

interface LogEntry {
  at: number
  trackId: string
  format: DownloadFormat
}

interface QuotaFile {
  version: 1
  log: LogEntry[]
  limitReached?: { at: number; message: string }
}

export function planLimit(tier?: string, billingPeriod?: string): number | null {
  if (tier?.endsWith('_trial')) return TRIAL_LIMIT
  if (billingPeriod === 'monthly') return MONTHLY_LIMIT
  return null // annual oder unbekannt → kein (bekanntes) Limit
}

const validDate = (s?: string): number | null => {
  if (!s) return null
  const t = Date.parse(s)
  return Number.isNaN(t) || new Date(t).getUTCFullYear() < 2000 ? null : t
}

/**
 * Schätzt das verbrauchte Download-Kontingent. SoundScout stellt keinen Zähler bereit –
 * gezählt werden nur Downloads dieser App im aktuellen Abrechnungszeitraum.
 */
export class QuotaTracker {
  private data: QuotaFile
  private saver = debounced(() => writeJsonAtomic(this.file, this.data), 500)
  private listeners = new Set<() => void>()

  constructor(
    private readonly file: string,
    private readonly now: () => number = Date.now
  ) {
    const raw = readJson<Partial<QuotaFile>>(file, {})
    this.data = { version: 1, log: Array.isArray(raw.log) ? raw.log : [], limitReached: raw.limitReached }
  }

  onChange(cb: () => void): () => void {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  private changed(): void {
    this.saver.schedule()
    for (const l of this.listeners) l()
  }

  flush(): void {
    this.saver.flush()
  }

  record(trackId: string, format: DownloadFormat): void {
    const cutoff = this.now() - 400 * 24 * 3600_000
    this.data.log = this.data.log.filter((e) => e.at >= cutoff)
    this.data.log.push({ at: this.now(), trackId, format })
    this.changed()
  }

  /** Alle protokollierten Downloads (für die Hörstatistik). */
  history(): { at: number; trackId: string }[] {
    return this.data.log.map((e) => ({ at: e.at, trackId: e.trackId }))
  }

  markLimitReached(message: string): void {
    this.data.limitReached = { at: this.now(), message }
    this.changed()
  }

  info(plan: PlanStatus | null): QuotaInfo {
    const now = this.now()
    let start = validDate(plan?.Start)
    let end = validDate(plan?.Finish)
    if (start === null || end === null || now >= end) {
      // Ohne gültigen Zeitraum: rollierende 30 Tage
      start = now - 30 * 24 * 3600_000
      end = null
    }
    const used = this.data.log.filter((e) => e.at >= start! && (end === null || e.at < end)).length
    const limit = plan ? planLimit(plan.Tier, plan.BillingPeriod) : null
    const lr = this.data.limitReached
    const limitReached = lr && lr.at >= start && (end === null || now < end) ? lr : undefined
    return {
      limit,
      used,
      remaining: limit === null ? null : limitReached ? 0 : Math.max(0, limit - used),
      periodStart: new Date(start).toISOString(),
      periodEnd: end === null ? undefined : new Date(end).toISOString(),
      billingPeriod: plan?.BillingPeriod,
      planName: plan?.PlanName,
      limitReached
    }
  }
}

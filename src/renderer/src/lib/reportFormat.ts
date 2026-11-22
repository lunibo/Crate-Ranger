import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import type { FieldReport } from '@shared/fieldReport'
import type { Datum } from '../components/Charts'
import { locale } from './i18n'

/** Formatierung für FieldReport (Minuten, Prozent, Stunden, Wochentage, Monate) in der App-Sprache. */
export function useReportFormat(): ReportFormat {
  const { t, i18n } = useTranslation()
  return useMemo(() => makeFormat(t), [t, i18n.language])
}

function makeFormat(t: TFunction) {
  const nf = (v: number, digits = 0): string => v.toLocaleString(locale(), { maximumFractionDigits: digits })
  const compact = (v: number): string => (v >= 1000 ? v.toLocaleString(locale(), { notation: 'compact', maximumFractionDigits: 1 }) : nf(v))
  return {
    minutes: (v: number): string => t('report.minutesValue', { value: nf(Math.round(v)) }),
    axisMinutes: (v: number): string => compact(Math.round(v)),
    percent: (v: number): string => v.toLocaleString(locale(), { style: 'percent', maximumFractionDigits: 0 }),
    quoted: (s: string): string => t('report.quoted', { text: s }),
    hour: (h: number): string => new Date(2000, 0, 1, h).toLocaleTimeString(locale(), { hour: 'numeric' }),
    weekday: (d: number, style: 'short' | 'long' = 'short'): string => new Date(2024, 0, 1 + d).toLocaleDateString(locale(), { weekday: style }), // 1.1.2024 = Montag
    month: (ts: number, withYear = false): string => new Date(ts).toLocaleDateString(locale(), withYear ? { month: 'short', year: '2-digit' } : { month: 'short' }),
    day: (ts: number): string => new Date(ts).toLocaleDateString(locale(), { day: 'numeric', month: 'short' }),
    date: (ts: number): string => new Date(ts).toLocaleDateString(locale(), { day: 'numeric', month: 'long', year: 'numeric' }),
    nf
  }
}

export type ReportFormat = ReturnType<typeof makeFormat>

export function timelineData(w: FieldReport, f: ReportFormat): Datum[] {
  const spansYears = w.timeline.buckets.length > 12
  return w.timeline.buckets.map((b) =>
    w.timeline.unit === 'day'
      ? { label: f.day(b.value), name: f.date(b.value), value: b.minutes }
      : { label: f.month(b.value, spansYears), name: new Date(b.value).toLocaleDateString(locale(), { month: 'long', year: 'numeric' }), value: b.minutes }
  )
}


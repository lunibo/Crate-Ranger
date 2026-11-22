import { locale } from './i18n'

export function fmtDuration(sec: number): string {
  if (!sec || !Number.isFinite(sec)) return '0:00'
  const s = Math.floor(sec % 60)
  const m = Math.floor(sec / 60) % 60
  const h = Math.floor(sec / 3600)
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`
}

const valid = (iso: string): Date | null => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) || d.getFullYear() < 1900 ? null : d
}

export function fmtYear(iso: string): string {
  const d = valid(iso)
  return d ? String(d.getFullYear()) : ''
}

/** z.B. „20. Apr. 2022“ / „Apr 20, 2022“ */
export function fmtDate(iso: string): string {
  const d = valid(iso)
  return d ? d.toLocaleDateString(locale(), { day: 'numeric', month: 'short', year: 'numeric' }) : ''
}

/** z.B. „24.12.2026“ / „12/24/2026“ */
export function fmtDay(iso: string): string {
  const d = valid(iso)
  return d ? d.toLocaleDateString(locale(), { day: '2-digit', month: '2-digit', year: 'numeric' }) : ''
}

export function fmtTime(ts: number): string {
  return new Date(ts).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

/** Datum + Uhrzeit, z.B. „23.11.2026, 08:00“ / „Nov 23, 2026, 8:00 AM“ */
export function fmtDateTime(iso: string): string {
  const d = valid(iso)
  return d ? d.toLocaleString(locale(), { dateStyle: 'medium', timeStyle: 'short' }) : ''
}

export function fmtNumber(n: number): string {
  return n.toLocaleString(locale())
}

export function fmtBytes(n: number): string {
  if (!n) return '0 B'
  const u = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(u.length - 1, Math.floor(Math.log(n) / Math.log(1024)))
  return `${(n / 1024 ** i).toLocaleString(locale(), { maximumFractionDigits: i > 1 ? 1 : 0 })} ${u[i]}`
}

export const titleWithVersion = (title: string, version?: string): string => (version ? `${title} (${version})` : title)

export function capitalize(s: string): string {
  return s.replace(/(^|\s|\/)(\p{L})/gu, (_, a: string, b: string) => a + b.toLocaleUpperCase(locale()))
}

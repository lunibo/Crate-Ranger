import i18next from 'i18next'
import { FALLBACK_LANGUAGE, I18N_RESOURCES } from '@shared/i18n'

/** Eigene i18n-Instanz für Texte aus dem Hauptprozess (Dialoge, Fehlermeldungen, Warteschlange). */
const i18n = i18next.createInstance()
void i18n.init({
  resources: I18N_RESOURCES,
  lng: FALLBACK_LANGUAGE,
  fallbackLng: FALLBACK_LANGUAGE,
  interpolation: { escapeValue: false },
  initAsync: false
})

export const t = i18n.t.bind(i18n)

/** Datum + Uhrzeit in der aktuellen App-Sprache, z.B. „23.11.2026, 08:00“. */
export function formatDateTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }).format(d)
}

export function setMainLanguage(code: string): void {
  if (i18n.language !== code) void i18n.changeLanguage(code)
}

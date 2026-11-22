import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { FALLBACK_LANGUAGE, I18N_RESOURCES, resolveLanguage } from '@shared/i18n'

void i18n.use(initReactI18next).init({
  resources: I18N_RESOURCES,
  lng: resolveLanguage(undefined, navigator.languages),
  fallbackLng: FALLBACK_LANGUAGE,
  interpolation: { escapeValue: false },
  initAsync: false
})
document.documentElement.lang = i18n.language

/** Wendet die Spracheinstellung („system“ oder Code) an. */
export function applyLanguage(setting: string | undefined): void {
  const lng = resolveLanguage(setting, navigator.languages)
  if (i18n.language !== lng) void i18n.changeLanguage(lng)
  document.documentElement.lang = lng
}

/** BCP-47-Locale der aktuellen Sprache für Intl-Formatierung (Datum, Zahlen). */
export const locale = (): string => i18n.resolvedLanguage ?? i18n.language ?? FALLBACK_LANGUAGE

/** Übersetzen außerhalb von React-Komponenten (Stores, Player). */
export const t = i18n.t.bind(i18n)

export default i18n

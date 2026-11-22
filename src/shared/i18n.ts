/**
 * Gemeinsame Sprach-Infrastruktur für Hauptprozess und Oberfläche.
 *
 * Neue Sprache hinzufügen: `src/shared/locales/<code>.json` anlegen (Kopie von en.json, Werte übersetzen,
 * `meta` anpassen). Die Datei wird automatisch erkannt und erscheint in der Sprachauswahl.
 */
import enFile from './locales/en.json'

export type Translation = typeof enFile
export interface LocaleMeta {
  /** Name der Sprache in der Sprache selbst, z.B. „Deutsch“ */
  name: string
  /** Englischer Name, z.B. „German“ */
  englishName: string
}

export const FALLBACK_LANGUAGE = 'en'
export const SYSTEM_LANGUAGE = 'system'

const files = import.meta.glob<Translation>('./locales/*.json', { eager: true, import: 'default' })

/** code → Übersetzung, z.B. { en: {...}, de: {...} } */
export const LOCALES: Record<string, Translation> = Object.fromEntries(
  Object.entries(files).map(([path, data]) => [path.replace(/^.*\/([^/]+)\.json$/, '$1'), data])
)

export const AVAILABLE_LANGUAGES: { code: string; name: string; englishName: string }[] = Object.entries(LOCALES)
  .map(([code, data]) => ({ code, name: (data.meta as LocaleMeta).name, englishName: (data.meta as LocaleMeta).englishName }))
  .sort((a, b) => a.englishName.localeCompare(b.englishName))

/** i18next-Ressourcen (ein Namespace „translation“). */
export const I18N_RESOURCES = Object.fromEntries(Object.entries(LOCALES).map(([code, data]) => [code, { translation: data }]))

/** Wählt die beste verfügbare Sprache für eine Liste bevorzugter Sprachen (z.B. ["de-AT", "en-US"]). */
export function matchLanguage(preferred: readonly string[]): string {
  const codes = Object.keys(LOCALES)
  for (const p of preferred) {
    const lc = p.toLowerCase().replace('_', '-')
    const exact = codes.find((c) => c.toLowerCase() === lc)
    if (exact) return exact
    const base = codes.find((c) => c.toLowerCase() === lc.split('-')[0])
    if (base) return base
  }
  return FALLBACK_LANGUAGE
}

/** Löst die Einstellung („system“ oder Sprachcode) zu einem verfügbaren Sprachcode auf. */
export function resolveLanguage(setting: string | undefined, systemPreferred: readonly string[]): string {
  if (setting && setting !== SYSTEM_LANGUAGE && LOCALES[setting]) return setting
  return matchLanguage(systemPreferred)
}

export function isValidLanguageSetting(v: unknown): v is string {
  return typeof v === 'string' && (v === SYSTEM_LANGUAGE || v in LOCALES)
}

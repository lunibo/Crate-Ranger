import 'i18next'
import type en from './locales/en.json'

// Typsichere Übersetzungsschlüssel: Englisch ist die Referenz, unbekannte Schlüssel sind Compile-Fehler.
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation'
    resources: { translation: typeof en }
  }
}

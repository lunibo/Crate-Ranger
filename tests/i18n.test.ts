import { describe, expect, it } from 'vitest'
import { AVAILABLE_LANGUAGES, FALLBACK_LANGUAGE, LOCALES, matchLanguage, resolveLanguage } from '@shared/i18n'

type Tree = { [k: string]: string | Tree }

function flatten(obj: Tree, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k
    if (typeof v === 'string') out[key] = v
    else Object.assign(out, flatten(v, key))
  }
  return out
}

/** Pluralformen (_one, _few, …) zählen als ein Schlüssel – Sprachen dürfen andere Pluralkategorien haben. */
const base = (key: string): string => key.replace(/_(zero|one|two|few|many|other)$/, '')
const vars = (s: string): string[] => [...s.matchAll(/\{\{\s*(\w+)/g)].map((m) => m[1]).sort()
const tags = (s: string): string[] => [...s.matchAll(/<(\w+)>/g)].map((m) => m[1]).sort()

const reference = flatten(LOCALES[FALLBACK_LANGUAGE] as unknown as Tree)
const refBases = new Set(Object.keys(reference).map(base))

describe('Sprachdateien', () => {
  it('enthält mindestens Deutsch und Englisch', () => {
    expect(AVAILABLE_LANGUAGES.map((l) => l.code)).toEqual(expect.arrayContaining(['de', 'en']))
  })

  for (const [code, data] of Object.entries(LOCALES)) {
    describe(code, () => {
      const flat = flatten(data as unknown as Tree)
      it('hat Metadaten (name, englishName)', () => {
        expect(flat['meta.name']).toBeTruthy()
        expect(flat['meta.englishName']).toBeTruthy()
      })
      it('hat alle Schlüssel der Referenz (en) und keine zusätzlichen', () => {
        const bases = new Set(Object.keys(flat).map(base))
        expect([...refBases].filter((k) => !bases.has(k))).toEqual([])
        expect([...bases].filter((k) => !refBases.has(k))).toEqual([])
      })
      it('verwendet dieselben Platzhalter und Markup-Tags', () => {
        for (const [key, value] of Object.entries(flat)) {
          const refKey = Object.keys(reference).find((k) => base(k) === base(key) && k.endsWith('_other')) ?? (reference[key] !== undefined ? key : base(key))
          const ref = reference[refKey] ?? reference[key]
          if (ref === undefined || key.startsWith('meta.')) continue
          expect(vars(value).filter((v) => v !== 'count'), key).toEqual(vars(ref).filter((v) => v !== 'count'))
          expect(tags(value), key).toEqual(tags(ref))
        }
      })
    })
  }
})

describe('Sprachauswahl', () => {
  it('wählt die passende Sprache aus Systemsprachen', () => {
    expect(matchLanguage(['de-AT', 'en-US'])).toBe('de')
    expect(matchLanguage(['en-GB'])).toBe('en')
    expect(matchLanguage(['ja-JP', 'de-DE'])).toBe('de')
    expect(matchLanguage(['ja-JP'])).toBe(FALLBACK_LANGUAGE)
  })
  it('respektiert die feste Einstellung', () => {
    expect(resolveLanguage('en', ['de-DE'])).toBe('en')
    expect(resolveLanguage('system', ['de-DE'])).toBe('de')
    expect(resolveLanguage('xx', ['de-DE'])).toBe('de')
  })
})

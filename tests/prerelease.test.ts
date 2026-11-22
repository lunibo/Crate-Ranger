import { describe, expect, it } from 'vitest'
import { isPreRelease } from '@shared/release'
import { splitPreReleases } from '../src/main/downloads/prerelease'
import { classifyError } from '../src/main/downloads/queue'

const now = Date.parse('2026-11-22T15:00:00Z')
const tr = (id: string, releaseDate?: string) => ({ trackId: id, releaseId: 'r', title: id, artist: 'a', releaseDate })

describe('Pre-Release', () => {
  it('erkennt zukünftige Release-Zeitpunkte', () => {
    expect(isPreRelease('2026-11-23T07:00:00Z', now)).toBe(true)
    expect(isPreRelease('2026-11-20T07:00:57Z', now)).toBe(false)
    expect(isPreRelease(undefined, now)).toBe(false)
    expect(isPreRelease('kaputt', now)).toBe(false)
  })

  it('filtert Pre-Releases beim Einreihen und nennt den frühesten Termin', () => {
    const { ready, result } = splitPreReleases(
      [tr('a', '2026-11-20T07:00:00Z'), tr('b', '2026-11-27T08:00:00Z'), tr('c', '2026-11-23T07:00:00Z'), tr('d')],
      now
    )
    expect(ready.map((t) => t.trackId)).toEqual(['a', 'd'])
    expect(result.skippedPreRelease).toBe(2)
    expect(result.availableFrom).toBe('2026-11-23T07:00:00.000Z')
  })

  it('stoppt die Warteschlange nicht wegen Pre-Release- oder unbekannten download.*-Fehlern', () => {
    const err = (status: number, code: string) => Object.assign(new Error(code), { status, code })
    expect(classifyError(err(409, 'prerelease'))).toBe('fatal')
    expect(classifyError(err(403, 'download.not_released'))).toBe('fatal')
    expect(classifyError(err(403, 'download.monthly_limit'))).toBe('quota')
    expect(classifyError(err(403, 'download.trial_allowance_used'))).toBe('quota')
  })
})

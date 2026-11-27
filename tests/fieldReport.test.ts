import { describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { PlayRecord, StatsData } from '@shared/types'
import { computeFieldReport, makePeriod, yearsWithData } from '@shared/fieldReport'
import { MIN_LISTEN_MS, sanitizePlay, StatsStore } from '../src/main/stats/store'

let n = 0
const play = (over: Partial<PlayRecord> & { at: number }): PlayRecord => ({
  id: `p${n++}`, ms: 200_000, dur: 220, t: 't1', r: 'r1', ti: 'Focus', v: '', a: 'Shingo Nakamura',
  ar: [{ id: 'a1', name: 'Shingo Nakamura', uri: 'shingo-nakamura' }], al: 'Focus', g: ['Dance', 'Melodic House & Techno'],
  tg: ['calm', 'A minor', 'synth'], bpm: 118, br: 'Silk', rd: '2022-04-20T07:00:00Z', cs: true, src: 'stream', done: true, skip: false, ...over
})
const at = (y: number, m: number, d: number, h = 12): number => new Date(y, m - 1, d, h).getTime()

const data: StatsData = {
  plays: [
    play({ at: at(2025, 12, 31) }), // Vorjahr → Artist a1 schon bekannt
    play({ at: at(2026, 3, 1, 23) }),
    play({ at: at(2026, 3, 2, 23) }),
    play({ at: at(2026, 3, 3, 23), t: 't2', ti: 'Alone', r: 'r2', al: 'Alone', a: 'Marshmello', ar: [{ id: 'a2', name: 'Marshmello', uri: 'marshmello' }], g: ['Dance', 'Trap / Future Bass'], bpm: 141, br: 'Instinct', rd: '2026-02-20T08:00:00Z', tg: ['energetic'] }),
    play({ at: at(2026, 3, 10, 1), ms: 10_000, done: false, skip: true }), // übersprungen, zählt nicht als Play
    play({ at: at(2026, 7, 4, 22), src: 'local' })
  ],
  events: [
    { at: at(2026, 3, 1), type: 'favorite', ref: 't1' },
    { at: at(2026, 3, 1), type: 'search', ref: 'feint' },
    { at: at(2026, 3, 2), type: 'search', ref: 'Feint' },
    { at: at(2026, 3, 2), type: 'ai-search', ref: 'calm piano' },
    { at: at(2026, 3, 2), type: 'session', ms: 3_600_000 }
  ],
  downloads: [{ at: at(2026, 3, 5), trackId: 't1' }, { at: at(2025, 5, 5), trackId: 't9' }]
}

describe('Artists ohne IDs', () => {
  it('ordnet Wiedergaben ohne Artist-IDs dem bekannten Artist zu', () => {
    const tm = { id: 'tm', name: 'Tokyo Machine', uri: 'tokyomachine' }
    const wg = { id: 'wg', name: 'Weird Genius', uri: 'weird-genius' }
    const d: StatsData = {
      plays: [
        play({ at: at(2026, 3, 1), t: 'x1', a: 'Tokyo Machine', ar: [tm] }),
        play({ at: at(2026, 3, 2), t: 'x2', a: 'Tokyo Machine', ar: [] }),
        play({ at: at(2026, 3, 3), t: 'x3', a: 'Weird Genius', ar: [wg] }),
        play({ at: at(2026, 3, 4), t: 'x4', a: 'Tokyo Machine & Weird Genius feat. Lights', ar: [] }),
        play({ at: at(2026, 3, 5), t: 'x5', a: 'Above & Beyond', ar: [] })
      ],
      events: [],
      downloads: []
    }
    const w = computeFieldReport(d, makePeriod('year', at(2026, 11, 22), 2026))
    // „Lights“ ist unbekannt → Kollaboration bleibt als Ganzes stehen
    expect(w.topArtists.map((a) => [a.name, a.id, a.plays])).toEqual([
      ['Tokyo Machine', 'tm', 2],
      ['Weird Genius', 'wg', 1],
      ['Tokyo Machine & Weird Genius feat. Lights', '', 1],
      ['Above & Beyond', '', 1]
    ])
  })
})

describe('computeFieldReport', () => {
  const w = computeFieldReport(data, makePeriod('year', at(2026, 11, 22), 2026), new Map([['calm', 'moods'], ['energetic', 'moods'], ['synth', 'instruments']]))

  it('zählt Minuten, Plays und Vielfalt im Zeitraum', () => {
    expect(w.empty).toBe(false)
    expect(w.totals.plays).toBe(4) // 10-s-Wiedergabe zählt nicht
    expect(Math.round(w.totals.minutes)).toBe(Math.round((4 * 200_000 + 10_000) / 60_000))
    expect(w.totals.tracks).toBe(2)
    expect(w.totals.artists).toBe(2)
    expect(w.totals.activeDays).toBe(5)
  })
  it('rankt Tracks, Artists, Genres, Stimmungen und Labels', () => {
    expect(w.topTracks[0]).toMatchObject({ trackId: 't1', plays: 3 })
    expect(w.topArtists.map((a) => a.name)).toEqual(['Shingo Nakamura', 'Marshmello'])
    expect(w.genres[0].name).toBe('Melodic House & Techno')
    expect(w.genres.map((g) => g.name)).not.toContain('Dance')
    expect(w.moods.map((m) => m.name)).toEqual(['calm', 'energetic'])
    expect(w.brands[0].name).toBe('Silk')
  })
  it('findet Hörzeiten, Serien und Entdeckungen', () => {
    expect(w.peakHour).toBe(23)
    expect(w.longestStreak.days).toBe(3)
    expect(w.timeline.unit).toBe('month')
    expect(w.timeline.buckets).toHaveLength(12)
    expect(Math.round(w.timeline.buckets[2].minutes)).toBe(Math.round((3 * 200_000 + 10_000) / 60_000))
    expect(w.discoveries.count).toBe(1) // Shingo war schon 2025 bekannt
    expect(w.discoveries.top[0].name).toBe('Marshmello')
  })
  it('wertet Gewohnheiten aus', () => {
    expect(w.habits.skipRate).toBeCloseTo(1 / 5)
    expect(w.habits.localShare).toBeCloseTo(200_000 / (4 * 200_000 + 10_000))
    expect(w.habits.downloads).toBe(1)
    expect(w.habits.searches).toBe(2)
    expect(w.habits.aiSearches).toBe(1)
    expect(w.habits.topSearch).toBe('feint')
    expect(w.habits.favoritesAdded).toBe(1)
    expect(w.habits.appMinutes).toBe(60)
    expect(w.releaseYears.medianYear).toBe(2022)
    expect(w.tempo.avgBpm).toBeGreaterThan(118)
    expect(w.persona).toBe('nightOwl')
  })
  it('liefert Jahre und leere Zeiträume', () => {
    expect(yearsWithData(data.plays)).toEqual([2026, 2025])
    expect(computeFieldReport(data, makePeriod('year', 0, 2020)).empty).toBe(true)
    const d30 = computeFieldReport(data, makePeriod('last30', at(2026, 3, 20)))
    expect(d30.timeline.unit).toBe('day')
    expect(d30.timeline.buckets).toHaveLength(30)
  })
})

describe('StatsStore', () => {
  it('speichert nur abgeschlossene Wiedergaben ab der Mindestdauer und übersteht Neustarts', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ss-stats-'))
    const s = new StatsStore(dir)
    s.play(play({ at: 1, id: 'a', ms: 20_000 }), false)
    expect(s.plays().map((p) => p.id)).toEqual(['a']) // laufend sichtbar
    s.play(play({ at: 1, id: 'a', ms: 60_000 }), true)
    s.play(play({ at: 2, id: 'b', ms: MIN_LISTEN_MS - 1 }), true) // zu kurz
    s.play(play({ at: 3, id: 'c', ms: 30_000 }), false)
    s.flush() // App-Ende
    s.event('search', 'x')
    s.event('hack', 'x') // unbekannter Typ
    const again = new StatsStore(dir)
    expect(again.plays().map((p) => [p.id, p.ms])).toEqual([['a', 60_000], ['c', 30_000]])
    expect(again.events().map((e) => e.type)).toEqual(['search'])
    expect(readFileSync(join(dir, 'plays.jsonl'), 'utf8').trim().split('\n')).toHaveLength(2)
    again.clear()
    expect(new StatsStore(dir).plays()).toEqual([])
  })
  it('verwirft ungültige Datensätze', () => {
    expect(sanitizePlay({} as never)).toBeNull()
    expect(sanitizePlay({ id: 'x', t: 't', src: 'evil' as never, ar: [{ id: 1 } as never] } as never)?.src).toBe('stream')
  })
})

describe('Ranger-Typ', () => {
  it('vergibt „Entdecker“ nur, wenn es Hördaten vor dem Zeitraum gibt', () => {
    const many = (y: number) => Array.from({ length: 12 }, (_, i) => play({ at: at(y, 6, 1 + i, 15), ar: [{ id: `x${y}-${i}`, name: `Artist ${y}-${i}`, uri: '' }], a: `Artist ${y}-${i}`, g: ['Electronic'], bpm: 125 }))
    const firstYear = computeFieldReport({ plays: many(2026), events: [], downloads: [] }, makePeriod('year', 0, 2026))
    expect(firstYear.persona).not.toBe('explorer')
    const withHistory = computeFieldReport({ plays: [...many(2025), ...many(2026)], events: [], downloads: [] }, makePeriod('year', 0, 2026))
    expect(withHistory.persona).toBe('explorer')
  })
})

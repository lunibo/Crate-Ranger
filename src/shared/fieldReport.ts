import type { PlayRecord, StatsData } from './types'

/** Ab dieser Hördauer zählt eine Wiedergabe als „Play“ (übliche Schwelle bei Streamingdiensten). */
export const COUNTED_PLAY_MS = 30_000
const DAY = 24 * 3600_000

export type PeriodKind = 'year' | 'last30' | 'all'
export interface Period {
  kind: PeriodKind
  year?: number
  from: number
  to: number
}

export function makePeriod(kind: PeriodKind, now = Date.now(), year?: number): Period {
  if (kind === 'year') {
    const y = year ?? new Date(now).getFullYear()
    return { kind, year: y, from: new Date(y, 0, 1).getTime(), to: new Date(y + 1, 0, 1).getTime() }
  }
  if (kind === 'last30') {
    const end = startOfDay(now) + DAY
    return { kind, from: end - 30 * DAY, to: end }
  }
  return { kind, from: 0, to: now + DAY }
}

/** Jahre, in denen es Wiedergaben gibt (neueste zuerst). */
export function yearsWithData(plays: PlayRecord[]): number[] {
  return [...new Set(plays.map((p) => new Date(p.at).getFullYear()))].sort((a, b) => b - a)
}

export function startOfDay(ts: number): number {
  const d = new Date(ts)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

const dayKey = (ts: number): string => {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export interface RankedTrack {
  trackId: string
  releaseId: string
  title: string
  version: string
  artists: string
  album: string
  plays: number
  minutes: number
}
export interface RankedArtist {
  id: string
  name: string
  uri: string
  plays: number
  minutes: number
}
export interface RankedRelease {
  releaseId: string
  title: string
  artists: string
  plays: number
  minutes: number
}
export interface Share {
  name: string
  minutes: number
  share: number
}
export interface Bucket {
  key: string
  /** Startzeitpunkt bzw. Index (Stunde, Wochentag, Jahr …) */
  value: number
  minutes: number
}

export type Persona = 'nightOwl' | 'earlyBird' | 'bassRanger' | 'chillRanger' | 'speedRanger' | 'explorer' | 'loyal' | 'collector' | 'ranger'

export interface FieldReport {
  period: Period
  empty: boolean
  totals: { minutes: number; plays: number; tracks: number; artists: number; releases: number; activeDays: number; sessions: number }
  topTracks: RankedTrack[]
  topArtists: RankedArtist[]
  topReleases: RankedRelease[]
  genres: Share[]
  moods: Share[]
  brands: Share[]
  /** Zeitverlauf: Monate (Jahr/Gesamt) oder Tage (30 Tage) */
  timeline: { unit: 'month' | 'day'; buckets: Bucket[] }
  byHour: Bucket[]
  /** 0 = Montag … 6 = Sonntag */
  byWeekday: Bucket[]
  peakHour: number | null
  peakWeekday: number | null
  busiestDay: { day: number; minutes: number } | null
  longestStreak: { days: number; from: number; to: number }
  discoveries: { count: number; top: RankedArtist[] }
  tempo: { avgBpm: number; buckets: { label: string; from: number; to: number; minutes: number }[] }
  releaseYears: { buckets: Bucket[]; medianYear: number | null; freshShare: number }
  habits: {
    skipRate: number
    completionRate: number
    localShare: number
    creatorSafeShare: number
    favoritesAdded: number
    downloads: number
    searches: number
    aiSearches: number
    appMinutes: number
    topSearch: string | null
  }
  persona: Persona
}

const MOOD_FALLBACK = new Set([
  'aggressive', 'atmospheric', 'calm', 'carefree', 'cheerful', 'dark', 'dreamy', 'driving', 'emotional', 'energetic', 'epic',
  'euphoric', 'happy', 'hopeful', 'hypnotic', 'melancholic', 'mysterious', 'playful', 'positive', 'powerful', 'propulsive',
  'quirky', 'relaxed', 'restless', 'romantic', 'sad', 'sexy', 'tense', 'triumphant', 'uplifting', 'warm', 'futuristic'
])
const MAIN_BRANDS = ['Uncaged', 'Instinct', 'Silk']
const TEMPO = [
  { label: '<90', from: 0, to: 90 },
  { label: '90–110', from: 90, to: 110 },
  { label: '110–125', from: 110, to: 125 },
  { label: '125–140', from: 125, to: 140 },
  { label: '140–160', from: 140, to: 160 },
  { label: '160+', from: 160, to: 1000 }
]

type Credit = PlayRecord['ar'][number]
const SPLIT_RE = /\s+(?:feat\.?|ft\.?|featuring|&|x|vs\.?)\s+|\s*,\s*/i

/**
 * Liefert die Artists einer Wiedergabe. Ältere/lückenhafte Datensätze haben keine Artist-IDs (nur den
 * Anzeigetitel) → über den Namen einem bekannten Artist zuordnen, damit er nicht doppelt gezählt wird.
 */
function creditResolver(all: PlayRecord[]): (p: PlayRecord) => Credit[] {
  const byName = new Map<string, Credit>()
  for (const p of all) for (const a of p.ar) if (a.id && !byName.has(a.name.toLowerCase())) byName.set(a.name.toLowerCase(), a)
  return (p) => {
    if (p.ar.length) return p.ar
    const whole = byName.get(p.a.trim().toLowerCase())
    if (whole) return [whole]
    const parts = p.a.split(SPLIT_RE).map((x) => byName.get(x.trim().toLowerCase()))
    if (parts.length > 1 && parts.every(Boolean)) return [...new Map(parts.map((a) => [a!.id, a!])).values()]
    return [{ id: '', name: p.a, uri: '' }]
  }
}

const minutesOf = (ms: number): number => ms / 60_000
const sumBy = <T>(xs: T[], f: (x: T) => number): number => xs.reduce((n, x) => n + f(x), 0)

function rankShares(map: Map<string, number>, limit: number): Share[] {
  const total = [...map.values()].reduce((a, b) => a + b, 0) || 1
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, ms]) => ({ name, minutes: minutesOf(ms), share: ms / total }))
}

/**
 * Berechnet alle Field-Report-Kennzahlen für einen Zeitraum.
 * @param tagCategories Tag → Kategorie (aus /tag-distribution), um Stimmungen zu erkennen
 */
export function computeFieldReport(data: StatsData, period: Period, tagCategories?: Map<string, string>): FieldReport {
  const inRange = (ts: number): boolean => ts >= period.from && ts < period.to
  const plays = data.plays.filter((p) => inRange(p.at) && p.ms > 0)
  const counted = plays.filter((p) => p.ms >= COUNTED_PLAY_MS)
  const events = data.events.filter((e) => inRange(e.at))
  const totalMs = sumBy(plays, (p) => p.ms)

  // ---------- Tops ----------
  const tracks = new Map<string, RankedTrack & { ms: number }>()
  const artists = new Map<string, RankedArtist & { ms: number }>()
  const releases = new Map<string, RankedRelease & { ms: number }>()
  const genres = new Map<string, number>()
  const moods = new Map<string, number>()
  const creditsOf = creditResolver(data.plays)
  const brands = new Map<string, number>()
  for (const p of plays) {
    const isPlay = p.ms >= COUNTED_PLAY_MS ? 1 : 0
    const tr = tracks.get(p.t) ?? { trackId: p.t, releaseId: p.r, title: p.ti, version: p.v, artists: p.a, album: p.al, plays: 0, minutes: 0, ms: 0 }
    tr.plays += isPlay
    tr.ms += p.ms
    tracks.set(p.t, tr)
    const rel = releases.get(p.r) ?? { releaseId: p.r, title: p.al, artists: p.a, plays: 0, minutes: 0, ms: 0 }
    rel.plays += isPlay
    rel.ms += p.ms
    releases.set(p.r, rel)
    for (const a of creditsOf(p)) {
      const key = a.id || a.name.toLowerCase()
      const ar = artists.get(key) ?? { id: a.id, name: a.name, uri: a.uri, plays: 0, minutes: 0, ms: 0 }
      ar.plays += isPlay
      ar.ms += p.ms
      artists.set(key, ar)
    }
    const g = p.g.filter((x) => x !== 'Dance' || p.g.length === 1)
    for (const x of g.length ? g : ['—']) genres.set(x, (genres.get(x) ?? 0) + p.ms / Math.max(1, g.length))
    for (const tag of p.tg) {
      const cat = tagCategories?.get(tag.toLowerCase())
      if (cat === 'moods' || (!tagCategories && MOOD_FALLBACK.has(tag.toLowerCase()))) moods.set(tag, (moods.get(tag) ?? 0) + p.ms)
    }
    const brand = MAIN_BRANDS.includes(p.br) ? p.br : 'other'
    brands.set(brand, (brands.get(brand) ?? 0) + p.ms)
  }
  genres.delete('—')
  const finish = <T extends { ms: number; minutes: number; plays: number }>(m: Map<string, T>, n: number): T[] =>
    [...m.values()]
      .map((x) => ({ ...x, minutes: minutesOf(x.ms) }))
      .sort((a, b) => b.ms - a.ms || b.plays - a.plays)
      .slice(0, n)
  const strip = <T extends { ms: number }>(xs: T[]): Omit<T, 'ms'>[] => xs.map(({ ms: _ms, ...rest }) => rest)

  // ---------- Zeit ----------
  const byHour: Bucket[] = Array.from({ length: 24 }, (_, h) => ({ key: String(h), value: h, minutes: 0 }))
  const byWeekday: Bucket[] = Array.from({ length: 7 }, (_, d) => ({ key: String(d), value: d, minutes: 0 }))
  const byDay = new Map<string, { day: number; ms: number }>()
  for (const p of plays) {
    const d = new Date(p.at)
    byHour[d.getHours()].minutes += minutesOf(p.ms)
    byWeekday[(d.getDay() + 6) % 7].minutes += minutesOf(p.ms)
    const k = dayKey(p.at)
    const e = byDay.get(k) ?? { day: startOfDay(p.at), ms: 0 }
    e.ms += p.ms
    byDay.set(k, e)
  }
  const argmax = (bs: Bucket[]): number | null => (bs.some((b) => b.minutes > 0) ? bs.reduce((m, b) => (b.minutes > m.minutes ? b : m)).value : null)

  let timeline: FieldReport['timeline']
  if (period.kind === 'last30') {
    const buckets: Bucket[] = []
    for (let ts = period.from; ts < period.to; ts += DAY) {
      const day = startOfDay(ts + DAY / 2)
      buckets.push({ key: dayKey(day), value: day, minutes: minutesOf(byDay.get(dayKey(day))?.ms ?? 0) })
    }
    timeline = { unit: 'day', buckets }
  } else {
    const first = period.kind === 'year' ? period.from : plays.length ? Math.min(...plays.map((p) => p.at)) : period.to
    const last = period.kind === 'year' ? period.to - 1 : plays.length ? Math.max(...plays.map((p) => p.at)) : period.to
    const months = new Map<string, Bucket>()
    const d = new Date(first)
    let cursor = new Date(d.getFullYear(), d.getMonth(), 1)
    while (cursor.getTime() <= last) {
      const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`
      months.set(key, { key, value: cursor.getTime(), minutes: 0 })
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)
    }
    for (const p of plays) {
      const pd = new Date(p.at)
      const b = months.get(`${pd.getFullYear()}-${String(pd.getMonth() + 1).padStart(2, '0')}`)
      if (b) b.minutes += minutesOf(p.ms)
    }
    timeline = { unit: 'month', buckets: [...months.values()] }
  }

  // Längste Serie aufeinanderfolgender Tage
  const days = [...byDay.values()].map((d) => d.day).sort((a, b) => a - b)
  let longestStreak = { days: 0, from: 0, to: 0 }
  for (let i = 0, start = 0; i < days.length; i++) {
    const consecutive = i > 0 && Math.round((days[i] - days[i - 1]) / DAY) === 1
    if (!consecutive) start = i
    const len = i - start + 1
    if (len > longestStreak.days) longestStreak = { days: len, from: days[start], to: days[i] }
  }
  const busiest = [...byDay.values()].sort((a, b) => b.ms - a.ms)[0]

  // ---------- Entdeckungen: Artists, die vor dem Zeitraum nie gehört wurden ----------
  const firstSeen = new Map<string, number>()
  for (const p of data.plays) {
    for (const a of creditsOf(p)) {
      const key = a.id || a.name.toLowerCase()
      firstSeen.set(key, Math.min(firstSeen.get(key) ?? Infinity, p.at))
    }
  }
  // Ohne Hördaten vor dem Zeitraum wäre jeder Artist eine „Entdeckung“ → dann kein Entdecker-Typ
  const hasHistory = data.plays.some((p) => p.at < period.from)
  const discovered = [...artists.entries()].filter(([key]) => inRange(firstSeen.get(key) ?? 0)).map(([, a]) => a)

  // ---------- Tempo ----------
  const withBpm = plays.filter((p) => p.bpm > 0)
  const bpmMs = sumBy(withBpm, (p) => p.ms)
  const avgBpm = bpmMs ? sumBy(withBpm, (p) => p.bpm * p.ms) / bpmMs : 0
  const tempoBuckets = TEMPO.map((b) => ({ ...b, minutes: minutesOf(sumBy(withBpm.filter((p) => p.bpm >= b.from && p.bpm < b.to), (p) => p.ms)) }))

  // ---------- Release-Jahre ----------
  const years = new Map<number, number>()
  const yearList: { year: number; ms: number }[] = []
  let freshMs = 0
  for (const p of plays) {
    const rd = Date.parse(p.rd)
    if (Number.isNaN(rd)) continue
    const y = new Date(rd).getFullYear()
    if (y < 1950) continue
    years.set(y, (years.get(y) ?? 0) + p.ms)
    yearList.push({ year: y, ms: p.ms })
    if (p.at - rd < 90 * DAY && p.at >= rd) freshMs += p.ms
  }
  yearList.sort((a, b) => a.year - b.year)
  let medianYear: number | null = null
  const yearTotal = sumBy(yearList, (y) => y.ms)
  for (let acc = 0, i = 0; i < yearList.length; i++) {
    acc += yearList[i].ms
    if (acc >= yearTotal / 2) {
      medianYear = yearList[i].year
      break
    }
  }
  const yearBuckets: Bucket[] = years.size
    ? Array.from({ length: Math.max(...years.keys()) - Math.min(...years.keys()) + 1 }, (_, i) => {
        const y = Math.min(...years.keys()) + i
        return { key: String(y), value: y, minutes: minutesOf(years.get(y) ?? 0) }
      })
    : []

  // ---------- Gewohnheiten ----------
  const finished = plays.filter((p) => p.done || p.skip)
  const searches = events.filter((e) => e.type === 'search')
  const searchCounts = new Map<string, number>()
  for (const e of [...searches, ...events.filter((x) => x.type === 'ai-search')]) {
    if (e.ref) searchCounts.set(e.ref.toLowerCase(), (searchCounts.get(e.ref.toLowerCase()) ?? 0) + 1)
  }
  const topSearch = [...searchCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
  const favoritesAdded = events.filter((e) => e.type === 'favorite').length - events.filter((e) => e.type === 'unfavorite').length
  const habits = {
    skipRate: plays.length ? plays.filter((p) => p.skip).length / plays.length : 0,
    completionRate: finished.length ? plays.filter((p) => p.done).length / plays.length : 0,
    localShare: totalMs ? sumBy(plays.filter((p) => p.src === 'local'), (p) => p.ms) / totalMs : 0,
    creatorSafeShare: totalMs ? sumBy(plays.filter((p) => p.cs), (p) => p.ms) / totalMs : 0,
    favoritesAdded: Math.max(0, favoritesAdded),
    downloads: data.downloads.filter((d) => inRange(d.at)).length,
    searches: searches.length,
    aiSearches: events.filter((e) => e.type === 'ai-search').length,
    appMinutes: minutesOf(sumBy(events.filter((e) => e.type === 'session'), (e) => e.ms ?? 0)),
    topSearch
  }

  const topArtists = strip(finish(artists, 10))
  const genreShares = rankShares(genres, 8)
  const peakHour = argmax(byHour)

  // ---------- Ranger-Typ ----------
  const topGenre = genreShares[0]?.name.toLowerCase() ?? ''
  let persona: Persona = 'ranger'
  const nightMinutes = sumBy(byHour.filter((b) => b.value >= 22 || b.value < 4), (b) => b.minutes)
  const morningMinutes = sumBy(byHour.filter((b) => b.value >= 5 && b.value < 9), (b) => b.minutes)
  const totalMin = minutesOf(totalMs)
  if (totalMin > 0) {
    if (habits.downloads >= 100) persona = 'collector'
    else if (nightMinutes / totalMin >= 0.35) persona = 'nightOwl'
    else if (morningMinutes / totalMin >= 0.3) persona = 'earlyBird'
    else if (topArtists[0] && topArtists[0].minutes / totalMin >= 0.3) persona = 'loyal'
    else if (hasHistory && artists.size >= 10 && discovered.length / artists.size >= 0.6) persona = 'explorer'
    else if (/dubstep|bass|drum|trap|riddim/.test(topGenre)) persona = 'bassRanger'
    else if (avgBpm >= 145) persona = 'speedRanger'
    else if (avgBpm > 0 && avgBpm < 110) persona = 'chillRanger'
  }

  return {
    period,
    empty: plays.length === 0,
    totals: {
      minutes: totalMin,
      plays: counted.length,
      tracks: tracks.size,
      artists: artists.size,
      releases: releases.size,
      activeDays: byDay.size,
      sessions: events.filter((e) => e.type === 'session').length
    },
    topTracks: strip(finish(tracks, 10)),
    topArtists,
    topReleases: strip(finish(releases, 10)),
    genres: genreShares,
    moods: rankShares(moods, 8),
    brands: rankShares(brands, 4),
    timeline,
    byHour,
    byWeekday,
    peakHour,
    peakWeekday: argmax(byWeekday),
    busiestDay: busiest ? { day: busiest.day, minutes: minutesOf(busiest.ms) } : null,
    longestStreak,
    discoveries: { count: discovered.length, top: strip(discovered.map((a) => ({ ...a, minutes: minutesOf(a.ms) })).sort((a, b) => b.ms - a.ms).slice(0, 5)) },
    tempo: { avgBpm, buckets: tempoBuckets },
    releaseYears: { buckets: yearBuckets, medianYear, freshShare: totalMs ? freshMs / totalMs : 0 },
    habits,
    persona
  }
}

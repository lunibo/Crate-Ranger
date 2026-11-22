import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import type { PlayRecord, StatEvent, StatEventType } from '@shared/types'

/** Wiedergaben unter dieser Hördauer werden nicht gespeichert (Fehlstarts). */
export const MIN_LISTEN_MS = 5000
const EVENT_TYPES: StatEventType[] = ['favorite', 'unfavorite', 'search', 'ai-search', 'session']

function readLines<T>(file: string): T[] {
  if (!existsSync(file)) return []
  const out: T[] = []
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue
    try {
      out.push(JSON.parse(line) as T)
    } catch {
      /* angebrochene Zeile (Absturz) überspringen */
    }
  }
  return out
}

const str = (v: unknown, max = 300): string => (typeof v === 'string' ? v.slice(0, max) : '')
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
const strs = (v: unknown, max = 40): string[] => (Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, max).map((x) => x.slice(0, 120)) : [])

/** Prüft und normalisiert einen Datensatz aus dem Renderer. */
export function sanitizePlay(p: Partial<PlayRecord>): PlayRecord | null {
  if (!p || typeof p.id !== 'string' || typeof p.t !== 'string' || !p.t) return null
  return {
    id: p.id.slice(0, 64),
    at: num(p.at),
    ms: Math.max(0, Math.round(num(p.ms))),
    dur: num(p.dur),
    t: str(p.t, 80),
    r: str(p.r, 80),
    ti: str(p.ti),
    v: str(p.v),
    a: str(p.a),
    ar: Array.isArray(p.ar)
      ? p.ar.slice(0, 12).map((x) => ({ id: str(x?.id, 80), name: str(x?.name, 200), uri: str(x?.uri, 200) })).filter((x) => x.name)
      : [],
    al: str(p.al),
    g: strs(p.g),
    tg: strs(p.tg, 60),
    bpm: num(p.bpm),
    br: str(p.br, 60),
    rd: str(p.rd, 40),
    cs: !!p.cs,
    src: p.src === 'local' ? 'local' : 'stream',
    done: !!p.done,
    skip: !!p.skip
  }
}

/**
 * Speichert Hörstatistiken lokal als JSON-Lines (eine Zeile pro Wiedergabe/Ereignis).
 * Laufende Wiedergaben werden im Speicher gehalten und beim Abschluss bzw. App-Ende geschrieben.
 */
export class StatsStore {
  private open = new Map<string, PlayRecord>()
  private readonly playsFile: string
  private readonly eventsFile: string

  constructor(private readonly dir: string) {
    this.playsFile = join(dir, 'plays.jsonl')
    this.eventsFile = join(dir, 'events.jsonl')
  }

  private append(file: string, obj: unknown): void {
    mkdirSync(this.dir, { recursive: true })
    appendFileSync(file, JSON.stringify(obj) + '\n', 'utf8')
  }

  play(raw: Partial<PlayRecord>, final: boolean): void {
    const rec = sanitizePlay(raw)
    if (!rec) return
    if (!final) {
      this.open.set(rec.id, rec)
      return
    }
    this.open.delete(rec.id)
    if (rec.ms >= MIN_LISTEN_MS) this.append(this.playsFile, rec)
  }

  event(type: unknown, ref?: unknown, ms?: unknown, at = Date.now()): void {
    if (!EVENT_TYPES.includes(type as StatEventType)) return
    const e: StatEvent = { at, type: type as StatEventType }
    if (typeof ref === 'string' && ref.trim()) e.ref = ref.trim().slice(0, 200)
    if (typeof ms === 'number' && ms > 0) e.ms = Math.round(ms)
    this.append(this.eventsFile, e)
  }

  /** Alle gespeicherten + laufenden Wiedergaben. */
  plays(): PlayRecord[] {
    const stored = readLines<PlayRecord>(this.playsFile)
    const running = [...this.open.values()].filter((r) => r.ms >= MIN_LISTEN_MS)
    return [...stored, ...running]
  }

  events(): StatEvent[] {
    return readLines<StatEvent>(this.eventsFile)
  }

  /** Beim Beenden: laufende Wiedergaben abschließen. */
  flush(): void {
    for (const rec of this.open.values()) if (rec.ms >= MIN_LISTEN_MS) this.append(this.playsFile, rec)
    this.open.clear()
  }

  clear(): void {
    this.open.clear()
    rmSync(this.playsFile, { force: true })
    rmSync(this.eventsFile, { force: true })
  }
}

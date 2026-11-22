import type { PlayRecord } from '@shared/types'
import type { TrackLite } from '../lib/api'

/**
 * Misst, wie lange ein Track tatsächlich gehört wurde (ohne Spulen/Pausen), und meldet
 * die Wiedergabe an den Hauptprozess (lokale Hörstatistik für Field Report).
 */
const SKIP_MS = 30_000
const HEARTBEAT_MS = 15_000

let session: { rec: PlayRecord; lastT: number; lastSentMs: number } | null = null

function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/** Neue Wiedergabe beginnen (beim ersten „playing“ eines Tracks). */
export function trackerStart(track: TrackLite, source: 'stream' | 'local', currentTime: number, duration: number): void {
  if (session?.rec.t === track.trackId) return
  trackerFinish('switch')
  session = {
    lastT: currentTime,
    lastSentMs: 0,
    rec: {
      id: newId(),
      at: Date.now(),
      ms: 0,
      dur: Number.isFinite(duration) && duration > 0 ? duration : track.duration,
      t: track.trackId,
      r: track.releaseId,
      ti: track.title,
      v: track.version,
      a: track.artistsTitle,
      ar: track.artists,
      al: track.releaseTitle,
      g: track.genres,
      tg: track.tags,
      bpm: track.bpm,
      br: track.brand,
      rd: track.releaseDate,
      cs: track.creatorSafe,
      src: source,
      done: false,
      skip: false
    }
  }
}

/** Bei jedem timeupdate: gehörte Zeit aufaddieren (Sprünge durch Spulen ignorieren). */
export function trackerTime(currentTime: number, playing: boolean, duration: number): void {
  if (!session) return
  const dt = currentTime - session.lastT
  session.lastT = currentTime
  if (playing && dt > 0 && dt < 2) session.rec.ms += dt * 1000
  if (Number.isFinite(duration) && duration > 0) session.rec.dur = duration
  if (session.rec.ms - session.lastSentMs >= HEARTBEAT_MS) {
    session.lastSentMs = session.rec.ms
    window.ss.stats.play({ ...session.rec, ms: Math.round(session.rec.ms) }, false)
  }
}

export function trackerSeeked(currentTime: number): void {
  if (session) session.lastT = currentTime
}

/** Wiedergabe abschließen: 'ended' = bis zum Schluss gehört, 'switch' = Wechsel, 'close' = App beendet. */
export function trackerFinish(reason: 'ended' | 'switch' | 'close'): void {
  if (!session) return
  const rec = session.rec
  session = null
  rec.ms = Math.round(rec.ms)
  rec.done = reason === 'ended' || (rec.dur > 0 && rec.ms >= rec.dur * 900)
  rec.skip = reason === 'switch' && !rec.done && rec.ms < SKIP_MS
  window.ss.stats.play(rec, true)
}

window.addEventListener('beforeunload', () => trackerFinish('close'))

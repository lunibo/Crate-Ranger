// Reine Warteschlangen-Operationen des Players (ohne Audio/Store) – testbar.
// queue = Tracks, order = Abspielreihenfolge (Indizes in queue), pos = aktuelle Position in order.

export interface QueueTrack {
  autoplay?: boolean
}

export interface QueueState<T extends QueueTrack> {
  queue: T[]
  order: number[]
}

/**
 * Entfernt Einträge der queue, die nicht mehr in order vorkommen, und nummeriert order neu.
 * Ohne Zufall entspricht die queue danach wieder der Abspielreihenfolge (sonst würde ein späteres
 * Aus-/Einschalten von Zufall die manuelle Reihenfolge verwerfen).
 */
export function compact<T extends QueueTrack>(queue: T[], order: number[], shuffle: boolean): QueueState<T> {
  if (!shuffle) return { queue: order.map((i) => queue[i]), order: order.map((_, i) => i) }
  const kept = [...new Set(order)].sort((a, b) => a - b)
  const map = new Map(kept.map((old, i) => [old, i]))
  return { queue: kept.map((i) => queue[i]), order: order.map((i) => map.get(i)!) }
}

/** Erste kommende Position mit einem von „Endlos hören“ angehängten Track (sonst Ende der Warteschlange). */
export function firstAutoplayPos(queue: QueueTrack[], order: number[], pos: number): number {
  for (let i = pos + 1; i < order.length; i++) if (queue[order[i]].autoplay) return i
  return order.length
}

/** Tracks in order an Position `at` einfügen. */
export function insertAt<T extends QueueTrack>(queue: T[], order: number[], at: number, tracks: T[]): QueueState<T> {
  const start = queue.length
  const o = [...order]
  o.splice(at, 0, ...tracks.map((_, i) => start + i))
  return { queue: [...queue, ...tracks], order: o }
}

/** Kommenden Track von Position `from` nach `to` verschieben (beide nach pos). null = ungültig/keine Änderung. */
export function moveUpcoming<T extends QueueTrack>(queue: T[], order: number[], pos: number, from: number, to: number, shuffle: boolean): QueueState<T> | null {
  if (from === to || from <= pos || to <= pos || from >= order.length || to >= order.length) return null
  const o = [...order]
  const [qi] = o.splice(from, 1)
  o.splice(to, 0, qi)
  // Verschobener Track gehört zu dem Abschnitt, in dem er landet (eigene Warteschlange / Endlos hören)
  const autoplay = to - 1 > pos && !!queue[o[to - 1]].autoplay
  const q = !!queue[qi].autoplay === autoplay ? queue : queue.map((x, i) => (i === qi ? { ...x, autoplay } : x))
  return compact(q, o, shuffle)
}

/** Kommenden Track an Position `at` entfernen. null = ungültig (z.B. der aktuelle Track). */
export function removeUpcoming<T extends QueueTrack>(queue: T[], order: number[], pos: number, at: number, shuffle: boolean): QueueState<T> | null {
  if (at <= pos || at >= order.length) return null
  return compact(queue, order.filter((_, i) => i !== at), shuffle)
}

/** Alle kommenden Tracks entfernen (bereits gespielte und der aktuelle bleiben). null = nichts zu tun. */
export function clearUpcoming<T extends QueueTrack>(queue: T[], order: number[], pos: number, shuffle: boolean): QueueState<T> | null {
  if (pos >= order.length - 1) return null
  return compact(queue, order.slice(0, pos + 1), shuffle)
}

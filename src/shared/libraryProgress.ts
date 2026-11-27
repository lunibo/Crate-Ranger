import type { LibrarySnapshot } from './types'

/** Track-IDs der Bibliothek, die zu einem Release gehören – direkt gespeichert oder über ein anderes Release (z.B. Single). */
export function releaseTrackIds(snap: LibrarySnapshot, releaseId: string): string[] {
  const ids = new Set(snap.links?.[releaseId]?.trackIds ?? [])
  for (const t of Object.values(snap.tracks)) {
    if (t.releaseId === releaseId || t.files.some((f) => f.releaseId === releaseId)) ids.add(t.trackId)
  }
  return [...ids]
}

/** Anzahl vorhandener (nicht fehlender) Tracks eines Releases und dessen Trackanzahl. */
export function releaseProgress(snap: LibrarySnapshot, releaseId: string, total?: number): { done: number; total: number } {
  const done = releaseTrackIds(snap, releaseId).filter((id) => snap.tracks[id]?.files.some((f) => !f.missing)).length
  return { done, total: total ?? (snap.releases[releaseId]?.trackTotal || snap.links?.[releaseId]?.trackTotal || 0) }
}

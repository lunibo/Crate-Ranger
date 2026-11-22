import type { EnqueueResult, EnqueueTrack } from '@shared/types'
import { isPreRelease } from '@shared/release'

/** Trennt Pre-Releases ab, die (noch) nicht heruntergeladen werden können. */
export function splitPreReleases(tracks: EnqueueTrack[], now: number = Date.now()): { ready: EnqueueTrack[]; result: Omit<EnqueueResult, 'added'> } {
  const ready: EnqueueTrack[] = []
  let earliest: number | null = null
  let skipped = 0
  for (const t of tracks) {
    if (isPreRelease(t.releaseDate, now)) {
      skipped++
      const ts = Date.parse(t.releaseDate!)
      if (earliest === null || ts < earliest) earliest = ts
    } else ready.push(t)
  }
  return { ready, result: { skippedPreRelease: skipped, availableFrom: earliest === null ? undefined : new Date(earliest).toISOString() } }
}

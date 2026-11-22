/**
 * Pre-Release: Der Release-Zeitpunkt liegt noch in der Zukunft (gleiche Regel wie soundscout.com).
 * Solche Tracks lassen sich ggf. schon streamen, aber erst ab Release-Zeitpunkt herunterladen.
 */
export function isPreRelease(releaseDate: string | null | undefined, now: number = Date.now()): boolean {
  if (!releaseDate) return false
  const t = Date.parse(releaseDate)
  return !Number.isNaN(t) && t > now
}

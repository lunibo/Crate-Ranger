import type { SoundScoutApi } from './api/client'
import { t } from './i18n'

const cache = new Map<string, { url: string; expires: number }>()

function expiryOf(url: string): number {
  try {
    const e = Number(new URL(url).searchParams.get('Expires'))
    if (e > 0) return e * 1000
  } catch {
    /* ignore */
  }
  return Date.now() + 30 * 60_000
}

/** Liefert die signierte Audio-URL (eingeloggt MP3 320, sonst 30-s-Vorschau). */
export async function resolveStreamUrl(api: SoundScoutApi, trackId: string, force = false): Promise<string> {
  const hit = cache.get(trackId)
  if (!force && hit && hit.expires - Date.now() > 5 * 60_000) return hit.url
  const url = await api.resolveRedirect(`/track/${encodeURIComponent(trackId)}/stream`)
  const u = new URL(url)
  if (u.protocol !== 'https:') throw new Error(t('errors.unexpectedStreamUrl'))
  cache.set(trackId, { url, expires: expiryOf(url) })
  return url
}

export function clearStreamCache(): void {
  cache.clear()
}

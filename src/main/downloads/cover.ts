import { nativeImage } from 'electron'
import { existsSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { apiUrl, type SoundScoutApi } from '../api/client'
import type { CoverImage } from './tagger'

/** Konvertiert ein Bild (PNG/JPEG) in ein JPEG mit maximaler Kantenlänge. */
export function toJpeg(img: CoverImage, maxEdge: number, quality = 90): Buffer | null {
  const ni = nativeImage.createFromBuffer(img.data)
  if (ni.isEmpty()) return null
  const { width, height } = ni.getSize()
  const scaled = Math.max(width, height) > maxEdge
    ? ni.resize(width >= height ? { width: maxEdge, quality: 'best' } : { height: maxEdge, quality: 'best' })
    : ni
  return scaled.toJPEG(quality)
}

const originals = new Map<string, Promise<CoverImage | null>>()

/** Original-Cover eines Releases (PNG, bis ~15 MB). Wird pro Release nur einmal geladen. */
export function fetchOriginalCover(api: SoundScoutApi, releaseId: string): Promise<CoverImage | null> {
  let p = originals.get(releaseId)
  if (!p) {
    p = (async () => {
      try {
        const res = await api.fetchAbsolute(apiUrl(`/release/${releaseId}/cover`))
        if (!res.ok) return null
        const data = Buffer.from(await res.arrayBuffer())
        return { data, mimeType: res.headers.get('content-type') || 'image/png' }
      } catch {
        return null
      }
    })()
    originals.set(releaseId, p)
    setTimeout(() => originals.delete(releaseId), 10 * 60_000)
  }
  return p
}

/** Cover zum Einbetten, falls die geladene Datei keines enthält (JPEG, 1000 px). */
export async function coverForEmbedding(api: SoundScoutApi, releaseId: string): Promise<CoverImage | null> {
  const orig = await fetchOriginalCover(api, releaseId)
  if (!orig) return null
  const jpg = toJpeg(orig, 1000)
  return jpg ? { data: jpg, mimeType: 'image/jpeg' } : null
}

/** Legt cover.jpg (1400 px) im Release-Ordner an, falls noch nicht vorhanden. */
export async function ensureCoverFile(dir: string, source: CoverImage | null, api: SoundScoutApi, releaseId: string): Promise<void> {
  const target = join(dir, 'cover.jpg')
  if (existsSync(target)) return
  const img = source ?? (await fetchOriginalCover(api, releaseId))
  if (!img) return
  const jpg = toJpeg(img, 1400)
  if (jpg) await writeFile(target, jpg)
}

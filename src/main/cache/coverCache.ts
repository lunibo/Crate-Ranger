import { createHash } from 'node:crypto'
import { mkdirSync, readdirSync, statSync } from 'node:fs'
import { readFile, rm, unlink, utimes, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { API_BASE } from '../api/client'

// Cover laufen über die API (…/cover?width=…) → 302 → cdx.monstercat.com. Der Server erlaubt kein
// Caching (max-age=0), Chromium fragt daher jedes Bild bei jedem Start doppelt nach. Dieser Cache
// speichert die skalierten Bilder selbst auf der Platte und liefert sie über cover://img/… aus.

export const COVER_SCHEME = 'cover'
/** So lange gilt ein Bild als frisch; danach wird es noch ausgeliefert, aber im Hintergrund erneuert */
export const COVER_FRESH_MS = 7 * 24 * 3600_000
export const COVER_CACHE_MAX_BYTES = 300 * 1024 * 1024
/** Letzte Nutzung höchstens so oft auf die Platte schreiben */
const TOUCH_INTERVAL_MS = 3600_000

const EXT: Record<string, string> = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/avif': 'avif' }
const MIME = Object.fromEntries(Object.entries(EXT).map(([m, e]) => [e, m]))

/**
 * cover://img/<release|file|artist>/<id>/cover?width=…[&fileID=…] → API-Pfad mit Query.
 * Alles andere (fremde Pfade, Originale ohne width, zusätzliche Parameter) → null.
 */
export function coverApiPath(url: string): string | null {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return null
  }
  if (u.protocol !== `${COVER_SCHEME}:` || u.host !== 'img') return null
  if (!/^\/(release|file|artist)\/[A-Za-z0-9-]{1,64}\/cover$/.test(u.pathname)) return null
  const width = u.searchParams.get('width')
  if (!width || !/^\d{1,4}$/.test(width)) return null
  const fileId = u.searchParams.get('fileID')
  if (fileId !== null && !/^[A-Za-z0-9-]{1,64}$/.test(fileId)) return null
  if ([...u.searchParams.keys()].some((k) => k !== 'width' && k !== 'fileID')) return null
  return `${u.pathname}?width=${width}${fileId ? `&fileID=${fileId}` : ''}`
}

interface Entry {
  file: string
  size: number
  fetchedAt: number
  usedAt: number
}

export type CoverFetch = (url: string) => Promise<Response>

export class CoverCache {
  private entries = new Map<string, Entry>()
  private inflight = new Map<string, Promise<Entry | null>>()
  private total = 0

  constructor(
    private readonly dir: string,
    private readonly fetcher: CoverFetch,
    private readonly maxBytes = COVER_CACHE_MAX_BYTES,
    private readonly now: () => number = Date.now
  ) {
    mkdirSync(dir, { recursive: true })
    for (const name of readdirSync(dir)) {
      const m = /^([0-9a-f]{40})\.(\w+)$/.exec(name)
      if (!m || !MIME[m[2]]) continue
      try {
        const st = statSync(join(dir, name))
        // mtime = Abrufzeit, atime = letzte Nutzung (wird explizit gesetzt)
        this.entries.set(m[1], { file: name, size: st.size, fetchedAt: st.mtimeMs, usedAt: Math.max(st.atimeMs, st.mtimeMs) })
        this.total += st.size
      } catch {
        /* ignorieren */
      }
    }
  }

  static key(apiPath: string): string {
    return createHash('sha1').update(apiPath).digest('hex')
  }

  get size(): number {
    return this.total
  }

  get count(): number {
    return this.entries.size
  }

  /** Bild liefern: aus dem Cache (bei Bedarf im Hintergrund erneuert) oder frisch geladen. */
  async get(apiPath: string): Promise<{ data: Buffer; mime: string } | null> {
    const key = CoverCache.key(apiPath)
    let entry: Entry | null | undefined = this.entries.get(key)
    if (entry) {
      if (this.now() - entry.fetchedAt > COVER_FRESH_MS) void this.fetch(key, apiPath)
    } else {
      entry = await this.fetch(key, apiPath)
    }
    if (!entry) return null
    try {
      const data = await readFile(join(this.dir, entry.file))
      this.touch(entry)
      return { data, mime: MIME[entry.file.split('.').pop()!] }
    } catch {
      this.drop(key)
      const fresh = await this.fetch(key, apiPath)
      if (!fresh) return null
      return { data: await readFile(join(this.dir, fresh.file)), mime: MIME[fresh.file.split('.').pop()!] }
    }
  }

  private fetch(key: string, apiPath: string): Promise<Entry | null> {
    let p = this.inflight.get(key)
    if (p) return p
    p = (async () => {
      try {
        const res = await this.fetcher(`${API_BASE}${apiPath}`)
        const mime = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
        if (!res.ok || !EXT[mime]) return this.entries.get(key) ?? null
        const data = Buffer.from(await res.arrayBuffer())
        if (!data.length) return this.entries.get(key) ?? null
        const file = `${key}.${EXT[mime]}`
        const old = this.entries.get(key)
        await writeFile(join(this.dir, file), data)
        if (old && old.file !== file) await unlink(join(this.dir, old.file)).catch(() => {})
        const now = this.now()
        const entry: Entry = { file, size: data.length, fetchedAt: now, usedAt: now }
        this.total += data.length - (old?.size ?? 0)
        this.entries.set(key, entry)
        await this.evict()
        return entry
      } catch {
        return this.entries.get(key) ?? null // offline o.ä. → altes Bild weiterverwenden
      } finally {
        this.inflight.delete(key)
      }
    })()
    this.inflight.set(key, p)
    return p
  }

  private touch(entry: Entry): void {
    const now = this.now()
    if (now - entry.usedAt < TOUCH_INTERVAL_MS) return
    entry.usedAt = now
    void utimes(join(this.dir, entry.file), new Date(now), new Date(entry.fetchedAt)).catch(() => {})
  }

  private drop(key: string): void {
    const e = this.entries.get(key)
    if (!e) return
    this.entries.delete(key)
    this.total -= e.size
  }

  /** Am längsten nicht genutzte Bilder löschen, bis wieder Platz ist (auf 90 % des Limits). */
  private async evict(): Promise<void> {
    if (this.total <= this.maxBytes) return
    const target = this.maxBytes * 0.9
    const byAge = [...this.entries.entries()].sort((a, b) => a[1].usedAt - b[1].usedAt)
    for (const [key, e] of byAge) {
      if (this.total <= target) break
      this.drop(key)
      await unlink(join(this.dir, e.file)).catch(() => {})
    }
  }

  async clear(): Promise<void> {
    this.entries.clear()
    this.total = 0
    await rm(this.dir, { recursive: true, force: true })
    mkdirSync(this.dir, { recursive: true })
  }
}

/** Antwort für cover://-Anfragen */
export async function serveCover(cache: CoverCache, url: string): Promise<Response> {
  const apiPath = coverApiPath(url)
  if (!apiPath) return new Response('bad request', { status: 400 })
  const img = await cache.get(apiPath)
  if (!img) return new Response('not found', { status: 404 })
  return new Response(new Uint8Array(img.data), { status: 200, headers: { 'Content-Type': img.mime, 'Content-Length': String(img.data.length) } })
}

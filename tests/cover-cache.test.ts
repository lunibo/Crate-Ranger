import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
vi.mock('electron', () => ({ net: {} }))
const { CoverCache, coverApiPath, serveCover, COVER_FRESH_MS } = await import('../src/main/cache/coverCache')

const dirs: string[] = []
const tmp = (): string => {
  const d = mkdtempSync(join(tmpdir(), 'cover-cache-'))
  dirs.push(d)
  return d
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

const img = (bytes: number, type = 'image/webp'): Response => new Response(new Uint8Array(bytes).fill(7), { status: 200, headers: { 'content-type': type } })
const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 10))

describe('coverApiPath', () => {
  it('akzeptiert nur skalierte Cover', () => {
    expect(coverApiPath('cover://img/release/abc-1/cover?width=300')).toBe('/release/abc-1/cover?width=300')
    expect(coverApiPath('cover://img/release/abc/cover?width=600&fileID=f-9')).toBe('/release/abc/cover?width=600&fileID=f-9')
    expect(coverApiPath('cover://img/artist/a1/cover?width=160')).toBe('/artist/a1/cover?width=160')
    expect(coverApiPath('cover://img/file/f1/cover?width=96')).toBe('/file/f1/cover?width=96')
  })
  it('lehnt alles andere ab', () => {
    expect(coverApiPath('cover://img/release/abc/cover')).toBeNull() // Original ohne width
    expect(coverApiPath('cover://img/release/abc/cover?width=abc')).toBeNull()
    expect(coverApiPath('cover://img/me/cover?width=300')).toBeNull()
    expect(coverApiPath('cover://img/release/../me/cover?width=300')).toBeNull()
    expect(coverApiPath('cover://img/release/abc/tracks?width=300')).toBeNull()
    expect(coverApiPath('cover://img/release/abc/cover?width=300&x=1')).toBeNull()
    expect(coverApiPath('cover://other/release/abc/cover?width=300')).toBeNull()
    expect(coverApiPath('https://img/release/abc/cover?width=300')).toBeNull()
  })
})

describe('CoverCache', () => {
  it('lädt einmal und liefert danach von der Platte – auch nach Neustart', async () => {
    const dir = tmp()
    const fetcher = vi.fn(async () => img(100))
    const c = new CoverCache(dir, fetcher)
    expect((await c.get('/release/a/cover?width=300'))?.data.length).toBe(100)
    expect((await c.get('/release/a/cover?width=300'))?.mime).toBe('image/webp')
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(fetcher).toHaveBeenCalledWith('https://www.soundscout.com/api/release/a/cover?width=300')
    const restarted = new CoverCache(dir, fetcher)
    expect(restarted.count).toBe(1)
    expect(restarted.size).toBe(100)
    expect((await restarted.get('/release/a/cover?width=300'))?.data.length).toBe(100)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('fasst gleichzeitige Anfragen zusammen', async () => {
    const fetcher = vi.fn(async () => img(10))
    const c = new CoverCache(tmp(), fetcher)
    await Promise.all([c.get('/file/x/cover?width=96'), c.get('/file/x/cover?width=96'), c.get('/file/x/cover?width=96')])
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('liefert veraltete Bilder sofort und erneuert sie im Hintergrund', async () => {
    let now = 1_000_000
    const fetcher = vi.fn(async () => img(10)).mockResolvedValueOnce(img(10)).mockResolvedValueOnce(img(20, 'image/jpeg'))
    const c = new CoverCache(tmp(), fetcher, undefined, () => now)
    await c.get('/release/a/cover?width=300')
    now += COVER_FRESH_MS + 1
    expect((await c.get('/release/a/cover?width=300'))?.data.length).toBe(10) // noch das alte
    await flush()
    expect(fetcher).toHaveBeenCalledTimes(2)
    const after = await c.get('/release/a/cover?width=300')
    expect(after?.data.length).toBe(20)
    expect(after?.mime).toBe('image/jpeg')
    expect(c.count).toBe(1)
    expect(c.size).toBe(20)
  })

  it('behält das alte Bild, wenn das Erneuern fehlschlägt (offline)', async () => {
    let now = 0
    const fetcher = vi.fn(async (): Promise<Response> => { throw new Error('offline') }).mockResolvedValueOnce(img(10))
    const c = new CoverCache(tmp(), fetcher, undefined, () => now)
    await c.get('/release/a/cover?width=300')
    now += COVER_FRESH_MS + 1
    await c.get('/release/a/cover?width=300')
    await flush()
    expect((await c.get('/release/a/cover?width=300'))?.data.length).toBe(10)
  })

  it('speichert keine Fehler und keine Nicht-Bilder', async () => {
    const fetcher = vi.fn(async () => new Response('{"error":1}', { status: 404, headers: { 'content-type': 'application/json' } }))
    const c = new CoverCache(tmp(), fetcher)
    expect(await c.get('/artist/x/cover?width=300')).toBeNull()
    expect(c.count).toBe(0)
  })

  it('löscht bei vollem Cache die am längsten ungenutzten Bilder', async () => {
    let now = 0
    const dir = tmp()
    const c = new CoverCache(dir, async () => img(100), 250, () => now)
    for (const id of ['a', 'b', 'c']) {
      now += 2 * 3600_000
      await c.get(`/release/${id}/cover?width=300`)
    }
    // Limit 250 B, 3×100 B → auf ≤ 225 B kürzen: „a“ (älteste Nutzung) fliegt raus
    expect(c.count).toBe(2)
    expect(c.size).toBe(200)
    expect(readdirSync(dir)).toHaveLength(2)
  })

  it('kann komplett geleert werden', async () => {
    const dir = tmp()
    const c = new CoverCache(dir, async () => img(10))
    await c.get('/release/a/cover?width=300')
    await c.clear()
    expect(c.size).toBe(0)
    expect(readdirSync(dir)).toHaveLength(0)
  })

  it('serveCover beantwortet ungültige Adressen mit 400', async () => {
    const c = new CoverCache(tmp(), async () => img(10))
    expect((await serveCover(c, 'cover://img/me/cover?width=1')).status).toBe(400)
    const ok = await serveCover(c, 'cover://img/release/a/cover?width=300')
    expect(ok.status).toBe(200)
    expect(ok.headers.get('content-type')).toBe('image/webp')
  })
})

import { describe, expect, it, vi } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { compareVersions, isNewerVersion, RELEASES_URL } from '@shared/update'
import { UpdateChecker } from '../src/main/update'

describe('compareVersions', () => {
  it('orders by semver', () => {
    expect(isNewerVersion('v1.1.0', '1.0.0')).toBe(true)
    expect(isNewerVersion('v1.0.0', '1.0.0')).toBe(false)
    expect(isNewerVersion('1.0.9', '1.0.10')).toBe(false)
    expect(isNewerVersion('2.0.0', '1.99.99')).toBe(true)
    expect(compareVersions('1.0.0', '1.0.0-beta.2')).toBeGreaterThan(0)
    expect(compareVersions('1.0.0-beta.10', '1.0.0-beta.2')).toBeGreaterThan(0)
    expect(compareVersions('1.0.0-alpha', '1.0.0-beta')).toBeLessThan(0)
    expect(isNewerVersion('nonsense', '1.0.0')).toBe(false)
  })
})

const release = (tag: string, extra: Record<string, unknown> = {}) =>
  new Response(JSON.stringify({ tag_name: tag, html_url: `${RELEASES_URL}/tag/${tag}`, draft: false, prerelease: false, ...extra }), { status: 200 })

describe('UpdateChecker', () => {
  const file = () => join(mkdtempSync(join(tmpdir(), 'ss-upd-')), 'update.json')

  it('makes no request without consent', async () => {
    const fetchImpl = vi.fn()
    const c = new UpdateChecker('1.0.0', file(), () => false, fetchImpl as never)
    c.start()
    await c.check(false)
    expect(fetchImpl).not.toHaveBeenCalled()
    c.stop()
  })

  it('reports a newer release and only links to the own release page', async () => {
    const fetchImpl = vi.fn(async () => release('v1.1.0'))
    const c = new UpdateChecker('1.0.0', file(), () => true, fetchImpl as never)
    const s = await c.check(false)
    expect(s).toMatchObject({ status: 'available', latestVersion: '1.1.0', url: `${RELEASES_URL}/tag/v1.1.0` })
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.github.com/repos/lunibo/Crate-Ranger/releases/latest')
    expect(init.headers).toEqual({ Accept: 'application/vnd.github+json', 'User-Agent': 'CrateRanger/1.0.0' })

    const evil = new UpdateChecker('1.0.0', file(), () => true, (async () => release('v1.2.0', { html_url: 'https://evil.example/x' })) as never)
    expect((await evil.check(true)).url).toBe(RELEASES_URL)
  })

  it('uses the cache within 6 hours and survives restarts', async () => {
    const f = file()
    const fetchImpl = vi.fn(async () => release('v1.0.0'))
    const a = new UpdateChecker('1.0.0', f, () => true, fetchImpl as never)
    expect((await a.check(false)).status).toBe('current')
    await a.check(false)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    // Neustart mit neuerer installierter Version: Cache wird neu bewertet, keine neue Anfrage
    const b = new UpdateChecker('1.0.1', f, () => true, fetchImpl as never)
    expect(b.getState()).toMatchObject({ status: 'current', latestVersion: '1.0.0' })
    await b.check(false)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    await b.check(true) // „Jetzt prüfen“ ignoriert den Cache
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('handles errors and repos without releases', async () => {
    const err = new UpdateChecker('1.0.0', file(), () => true, (async () => new Response('', { status: 503 })) as never)
    expect(await err.check(true)).toMatchObject({ status: 'error', error: 'GitHub HTTP 503' })
    const none = new UpdateChecker('1.0.0', file(), () => true, (async () => new Response('', { status: 404 })) as never)
    expect((await none.check(true)).status).toBe('current')
  })
})

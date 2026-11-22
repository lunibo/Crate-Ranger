import { afterEach, describe, expect, it } from 'vitest'
import { createServer, type Server, type Socket } from 'node:net'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { PresenceStatus, PresenceTrack } from '@shared/types'
import { candidatePaths, DiscordIpcClient, encodeFrame, FrameDecoder, Op } from '../src/main/discord/ipc'
import { buildActivity, clip, DiscordPresence } from '../src/main/discord/presence'

const labels = { by: (a: string) => `by ${a}`, button: 'Listen on SoundScout' }
const track: PresenceTrack = {
  trackId: 't1', releaseId: 'r1', title: 'Focus', version: 'Extended Mix', artists: 'Shingo Nakamura', artistUri: 'shingo-nakamura', album: 'Focus',
  coverUrl: 'https://www.soundscout.com/api/release/r1/cover?width=512', playing: true, position: 30, duration: 238
}
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Simulierter Discord-Client: antwortet auf den Handshake mit READY und protokolliert Frames. */
function fakeDiscord(opts: { rejectClientId?: string } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'ss-discord-'))
  const path = join(dir, 'discord-ipc-0')
  const frames: { op: Op; data: any }[] = []
  const sockets: Socket[] = []
  const server: Server = createServer((sock) => {
    sockets.push(sock)
    const dec = new FrameDecoder()
    sock.on('data', (chunk) => {
      for (const f of dec.push(chunk)) {
        frames.push(f as any)
        const d = f.data as any
        if (f.op === Op.Handshake) {
          if (d.client_id === opts.rejectClientId) sock.write(encodeFrame(Op.Close, { code: 4000, message: 'Invalid Client ID' }))
          else sock.write(encodeFrame(Op.Frame, { cmd: 'DISPATCH', evt: 'READY', data: { user: { id: '1', username: 'ranger', global_name: 'Ranger' } } }))
        }
      }
    })
  })
  return {
    path, frames, sockets,
    listen: () => new Promise<void>((r) => server.listen(path, r)),
    close: () => new Promise<void>((r) => { sockets.forEach((s) => s.destroy()); server.close(() => r()) }),
    activities: () => frames.filter((f) => f.op === Op.Frame && f.data?.cmd === 'SET_ACTIVITY').map((f) => f.data.args.activity ?? null)
  }
}

let cleanup: (() => Promise<void>) | null = null
afterEach(async () => { await cleanup?.(); cleanup = null })

describe('Discord-IPC-Protokoll', () => {
  it('kodiert und dekodiert Frames, auch über mehrere Chunks', () => {
    const buf = Buffer.concat([encodeFrame(Op.Frame, { a: 1 }), encodeFrame(Op.Ping, { b: 'ü' })])
    const dec = new FrameDecoder()
    expect(dec.push(buf.subarray(0, 5))).toEqual([])
    expect(dec.push(buf.subarray(5))).toEqual([{ op: Op.Frame, data: { a: 1 } }, { op: Op.Ping, data: { b: 'ü' } }])
  })

  it('kennt die Pipe-/Socket-Pfade', () => {
    expect(candidatePaths({}, 'win32')[0]).toBe('\\\\?\\pipe\\discord-ipc-0')
    const linux = candidatePaths({ XDG_RUNTIME_DIR: '/run/user/1000' }, 'linux')
    expect(linux).toContain('/run/user/1000/discord-ipc-0')
    expect(linux).toContain('/run/user/1000/app/com.discordapp.Discord/discord-ipc-0')
  })

  it('verbindet sich, setzt die Aktivität und beantwortet Pings', async () => {
    const d = fakeDiscord(); await d.listen(); cleanup = d.close
    const client = new DiscordIpcClient('123', [join(d.path, '..', 'gibts-nicht'), d.path])
    const user = await client.connect()
    expect(user.username).toBe('ranger')
    expect(d.frames[0]).toEqual({ op: Op.Handshake, data: { v: 1, client_id: '123' } })
    client.setActivity({ type: 2, details: 'Focus' })
    d.sockets[0].write(encodeFrame(Op.Ping, { x: 1 }))
    await wait(100)
    expect(d.activities()).toEqual([{ type: 2, details: 'Focus' }])
    expect(d.frames.some((f) => f.op === Op.Pong && f.data.x === 1)).toBe(true)
    client.destroy()
  })

  it('meldet ungültige Application-IDs', async () => {
    const d = fakeDiscord({ rejectClientId: 'bad' }); await d.listen(); cleanup = d.close
    await expect(new DiscordIpcClient('bad', [d.path]).connect()).rejects.toMatchObject({ code: 'INVALID_CLIENT_ID' })
  })

  it('meldet, wenn Discord nicht läuft', async () => {
    await expect(new DiscordIpcClient('1', ['/nonexistent/discord-ipc-0']).connect()).rejects.toMatchObject({ code: 'NOT_RUNNING' })
  })
})

describe('Rich-Presence-Aktivität', () => {
  it('zeigt „Hört …“ mit Titel, Artist, Cover, Fortschritt und Button', () => {
    const now = 1_000_000
    const a = buildActivity(track, now, labels) as any
    expect(a.type).toBe(2)
    expect(a.details).toBe('Focus (Extended Mix)')
    expect(a.state).toBe('by Shingo Nakamura')
    expect(a.timestamps).toEqual({ start: now - 30_000, end: now - 30_000 + 238_000 })
    expect(a.assets).toEqual({ large_image: track.coverUrl, large_text: 'Focus', large_url: 'https://www.soundscout.com/player/releases/r1' })
    expect(a.buttons).toEqual([{ label: 'Listen on SoundScout', url: 'https://www.soundscout.com/player/music/t1' }])
  })
  it('verlinkt Song, Artist und Cover auf die passenden SoundScout-Seiten', () => {
    const a = buildActivity(track, 0, labels) as any
    expect(a.details_url).toBe('https://www.soundscout.com/player/music/t1')
    expect(a.state_url).toBe('https://www.soundscout.com/player/artists/shingo-nakamura')
    expect(a.assets.large_url).toBe('https://www.soundscout.com/player/releases/r1')
    const noUri = buildActivity({ ...track, artistUri: undefined }, 0, labels) as any
    expect(noUri.state_url).toBeUndefined() // ohne bekannte Artist-Seite kein Link
  })
  it('blendet bei Pause aus und hält Discords Längengrenzen ein', () => {
    expect(buildActivity({ ...track, playing: false }, 0, labels)).toBeNull()
    expect(buildActivity(null, 0, labels)).toBeNull()
    expect(clip('x'.repeat(300)).length).toBe(128)
    expect(clip('A').length).toBe(2)
  })
})

describe('DiscordPresence', () => {
  it('verbindet sich, spiegelt den Track und räumt beim Stoppen auf', async () => {
    const d = fakeDiscord(); await d.listen(); cleanup = d.close
    const statuses: PresenceStatus[] = []
    let enabled = true
    const p = new DiscordPresence({
      enabled: () => enabled, clientId: () => '42', labels: () => labels, onStatus: (s) => statuses.push(s),
      createClient: (id) => new DiscordIpcClient(id, [d.path])
    })
    p.update(track)
    p.refresh()
    await wait(300)
    expect(statuses.map((s) => s.state)).toEqual(['connecting', 'connected'])
    expect(statuses[1].user).toBe('Ranger')
    expect(d.activities()[0]).toMatchObject({ type: 2, details: 'Focus (Extended Mix)' })
    p.update({ ...track, playing: false })
    await wait(2300) // Rate-Limit: höchstens alle 2 s
    expect(d.activities().at(-1)).toBeNull()
    enabled = false
    p.refresh()
    expect(statuses.at(-1)?.state).toBe('disabled')
  })

  it('verlangt eine Application-ID', () => {
    const statuses: PresenceStatus[] = []
    new DiscordPresence({ enabled: () => true, clientId: () => '', labels: () => labels, onStatus: (s) => statuses.push(s) }).refresh()
    expect(statuses.at(-1)?.state).toBe('missing-client-id')
  })
})

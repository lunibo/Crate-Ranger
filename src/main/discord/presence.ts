import type { PresenceStatus, PresenceTrack } from '@shared/types'
import { DiscordIpcClient } from './ipc'

const MIN_INTERVAL_MS = 2000 // Discord erlaubt 5 Updates / 20 s
const SITE = 'https://www.soundscout.com/player'

/** Links auf soundscout.com, die Discord beim Klick auf Song, Artist bzw. Cover öffnet. */
export const soundScoutUrls = {
  track: (id: string): string => `${SITE}/music/${encodeURIComponent(id)}`,
  release: (id: string): string => `${SITE}/releases/${encodeURIComponent(id)}`,
  artist: (uri: string): string => `${SITE}/artists/${encodeURIComponent(uri)}`
}
const RECONNECT_MS = 20_000

export interface ActivityLabels {
  by(artists: string): string
  button: string
}

/** Discord verlangt 2–128 Zeichen für details/state. */
export function clip(s: string, max = 128): string {
  let v = s.replace(/\s+/g, ' ').trim()
  if ([...v].length > max) v = [...v].slice(0, max - 1).join('') + '…'
  return v.length < 2 ? v.padEnd(2, '⠀') : v
}

/** Baut die Rich-Presence-Aktivität („Hört …“). Pausiert → null (Status wird ausgeblendet). */
export function buildActivity(p: PresenceTrack | null, now: number, labels: ActivityLabels): Record<string, unknown> | null {
  if (!p || !p.playing) return null
  const title = p.version ? `${p.title} (${p.version})` : p.title
  const start = Math.round(now - Math.max(0, p.position) * 1000)
  const activity: Record<string, unknown> = {
    type: 2, // Listening
    details: clip(title),
    state: clip(labels.by(p.artists || '—')),
    // Klick auf den Songtitel → Track-Seite, auf die Artist-Zeile → Artist-Seite
    ...(p.trackId ? { details_url: soundScoutUrls.track(p.trackId) } : {}),
    ...(p.artistUri ? { state_url: soundScoutUrls.artist(p.artistUri) } : {}),
    timestamps: p.duration > 0 ? { start, end: Math.round(start + p.duration * 1000) } : { start },
    instance: false
  }
  const assets: Record<string, string> = {}
  if (p.coverUrl?.startsWith('https://')) assets.large_image = p.coverUrl
  if (p.album) assets.large_text = clip(p.album)
  if (assets.large_image && p.releaseId) assets.large_url = soundScoutUrls.release(p.releaseId) // Klick aufs Cover → Release
  if (Object.keys(assets).length) activity.assets = assets
  if (p.trackId) {
    activity.buttons = [{ label: clip(labels.button, 32), url: soundScoutUrls.track(p.trackId) }]
  }
  return activity
}

export interface PresenceOptions {
  clientId(): string
  enabled(): boolean
  labels(): ActivityLabels
  onStatus(s: PresenceStatus): void
  createClient?(clientId: string): DiscordIpcClient
  now?(): number
}

/** Hält die Verbindung zu Discord und spiegelt den laufenden Track als Rich Presence. */
export class DiscordPresence {
  private client: DiscordIpcClient | null = null
  private track: PresenceTrack | null = null
  private status: PresenceStatus = { state: 'disabled' }
  private reconnectTimer: NodeJS.Timeout | null = null
  private sendTimer: NodeJS.Timeout | null = null
  private lastSentAt = 0
  private lastSent = ''
  private connecting = false
  private generation = 0

  constructor(private readonly opts: PresenceOptions) {}

  getStatus(): PresenceStatus {
    return this.status
  }

  private setStatus(s: PresenceStatus): void {
    this.status = s
    this.opts.onStatus(s)
  }

  /** Einstellungen geändert → verbinden, trennen oder mit neuer Client-ID neu verbinden. */
  refresh(): void {
    this.stop()
    if (!this.opts.enabled()) return this.setStatus({ state: 'disabled' })
    if (!this.opts.clientId().trim()) return this.setStatus({ state: 'missing-client-id' })
    void this.connect()
  }

  update(track: PresenceTrack | null): void {
    this.track = track
    this.scheduleSend()
  }

  private async connect(): Promise<void> {
    if (this.connecting || this.client) return
    this.connecting = true
    const gen = this.generation
    this.setStatus({ state: 'connecting' })
    const id = this.opts.clientId().trim()
    const client = this.opts.createClient ? this.opts.createClient(id) : new DiscordIpcClient(id)
    try {
      const user = await client.connect()
      if (gen !== this.generation) return client.destroy()
      this.client = client
      this.lastSent = ''
      this.setStatus({ state: 'connected', user: user.global_name || user.username })
      client.on('close', () => {
        if (this.client !== client) return
        this.client = null
        if (this.opts.enabled() && gen === this.generation) {
          this.setStatus({ state: 'not-running' })
          this.scheduleReconnect()
        }
      })
      this.scheduleSend(true)
    } catch (e) {
      if (gen !== this.generation) return
      const code = (e as { code?: string }).code
      if (code === 'INVALID_CLIENT_ID') {
        this.setStatus({ state: 'error', error: 'invalid-client-id' })
      } else {
        this.setStatus({ state: 'not-running' })
        this.scheduleReconnect()
      }
    } finally {
      this.connecting = false
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      if (this.opts.enabled()) void this.connect()
    }, RECONNECT_MS)
  }

  private scheduleSend(immediate = false): void {
    if (!this.client) return
    if (this.sendTimer) return
    const now = this.opts.now?.() ?? Date.now()
    const wait = immediate ? 0 : Math.max(0, this.lastSentAt + MIN_INTERVAL_MS - now)
    this.sendTimer = setTimeout(() => {
      this.sendTimer = null
      this.send()
    }, wait)
  }

  private send(): void {
    if (!this.client) return
    const now = this.opts.now?.() ?? Date.now()
    const activity = buildActivity(this.track, now, this.opts.labels())
    // Gleicher Inhalt (Zeitstempel auf 2 s gerundet) → nicht erneut senden
    const key = JSON.stringify(activity, (k, v) => (k === 'start' || k === 'end' ? Math.round(v / 2000) : v))
    if (key === this.lastSent) return
    this.lastSent = key
    this.lastSentAt = now
    this.client.setActivity(activity)
  }

  stop(): void {
    this.generation++
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    if (this.sendTimer) clearTimeout(this.sendTimer)
    this.reconnectTimer = null
    this.sendTimer = null
    const c = this.client
    this.client = null
    if (c) {
      try {
        c.setActivity(null)
      } catch {
        /* ignore */
      }
      c.destroy('stopped')
    }
  }
}

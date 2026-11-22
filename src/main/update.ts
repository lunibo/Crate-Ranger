import type { UpdateState } from '@shared/types'
import { isNewerVersion, RELEASES_URL, UPDATE_REPO } from '@shared/update'
import { readJson, writeJsonAtomic } from './jsonFile'

/** Ergebnis höchstens so lange wiederverwenden, bevor GitHub erneut gefragt wird. */
const CACHE_MS = 6 * 60 * 60 * 1000
const RECHECK_MS = 24 * 60 * 60 * 1000

interface Cache {
  checkedAt: number
  latest: string
  url: string
}

interface GithubRelease {
  tag_name?: unknown
  html_url?: unknown
  draft?: unknown
  prerelease?: unknown
}

/**
 * Prüft über die öffentliche GitHub-API, ob eine neuere Version veröffentlicht wurde.
 * Es wird nur die Release-Liste abgerufen – ohne Cookies, Konto- oder Nutzungsdaten.
 */
export class UpdateChecker {
  private state: UpdateState
  private timer: NodeJS.Timeout | null = null
  private listeners = new Set<(s: UpdateState) => void>()

  constructor(
    private readonly currentVersion: string,
    private readonly cacheFile: string,
    private readonly enabled: () => boolean,
    private readonly fetchImpl: typeof fetch = fetch
  ) {
    this.state = { status: 'idle', currentVersion }
    const cache = readJson<Partial<Cache>>(cacheFile, {})
    if (typeof cache.latest === 'string' && typeof cache.url === 'string' && typeof cache.checkedAt === 'number') {
      this.state = this.fromRelease(cache.latest, cache.url, cache.checkedAt)
    }
  }

  getState(): UpdateState {
    return this.state
  }

  onChange(cb: (s: UpdateState) => void): () => void {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  private set(s: UpdateState): void {
    this.state = s
    for (const l of this.listeners) l(s)
  }

  private fromRelease(latest: string, url: string, checkedAt: number): UpdateState {
    return {
      status: isNewerVersion(latest, this.currentVersion) ? 'available' : 'current',
      currentVersion: this.currentVersion,
      latestVersion: latest.replace(/^v/, ''),
      url,
      checkedAt
    }
  }

  /** Beim Start und danach täglich prüfen – nur wenn der Nutzer zugestimmt hat. */
  start(): void {
    this.stop()
    if (!this.enabled()) return
    void this.check(false)
    this.timer = setInterval(() => void this.check(false), RECHECK_MS)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  /** `force`: Cache ignorieren (Knopf „Jetzt prüfen“). */
  async check(force: boolean): Promise<UpdateState> {
    if (!force && !this.enabled()) return this.state
    if (!force && this.state.checkedAt && Date.now() - this.state.checkedAt < CACHE_MS) return this.state
    if (this.state.status === 'checking') return this.state
    const prev = this.state
    this.set({ ...prev, status: 'checking' })
    try {
      const res = await this.fetchImpl(`https://api.github.com/repos/${UPDATE_REPO}/releases/latest`, {
        headers: {
          Accept: 'application/vnd.github+json',
          // GitHub verlangt einen User-Agent; er nennt nur App und Version
          'User-Agent': `CrateRanger/${this.currentVersion}`
        },
        signal: AbortSignal.timeout(15_000)
      })
      if (res.status === 404) {
        // Noch kein Release veröffentlicht
        const now = Date.now()
        this.set({ status: 'current', currentVersion: this.currentVersion, checkedAt: now })
        return this.state
      }
      if (!res.ok) throw new Error(`GitHub HTTP ${res.status}`)
      const rel = (await res.json()) as GithubRelease
      const tag = typeof rel.tag_name === 'string' ? rel.tag_name : ''
      if (!tag || rel.draft === true || rel.prerelease === true) throw new Error('GitHub: unexpected release data')
      // Nur Links auf die eigene Release-Seite öffnen
      const url = typeof rel.html_url === 'string' && rel.html_url.startsWith(`${RELEASES_URL}/`) ? rel.html_url : RELEASES_URL
      const now = Date.now()
      writeJsonAtomic(this.cacheFile, { checkedAt: now, latest: tag, url } satisfies Cache)
      this.set(this.fromRelease(tag, url, now))
    } catch (e) {
      this.set({ ...prev, status: 'error', error: e instanceof Error ? e.message : String(e) })
    }
    return this.state
  }
}

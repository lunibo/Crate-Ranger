import { randomUUID } from 'node:crypto'
import { t } from '../i18n'
import type { DownloadFormat, DownloadJob, EnqueueTrack, JobStatus, QueueState } from '@shared/types'
import { debounced, readJson, writeJsonAtomic } from '../jsonFile'
import type { WorkerContext, WorkerResult } from './downloader'

export type Worker = (job: DownloadJob, ctx: WorkerContext) => Promise<WorkerResult>

/** Fehlercodes, bei denen die ganze Warteschlange angehalten wird (Abo/Kontingent). */
export const QUOTA_CODES = new Set(['download.monthly_limit', 'download.trial_allowance_used', 'gold.download.requires_subscription'])
export const MAX_ATTEMPTS = 3

interface ErrorLike {
  status?: number
  code?: string
  message?: string
  name?: string
}

export function classifyError(e: unknown): 'quota' | 'auth' | 'transient' | 'fatal' | 'aborted' {
  const err = (e ?? {}) as ErrorLike
  if (err.name === 'AbortError') return 'aborted'
  if (err.code && QUOTA_CODES.has(err.code)) return 'quota'
  if (err.code === 'transfer.incomplete') return 'transient'
  if (err.status === 401) return 'auth'
  if (err.code === 'download.http' && err.status === 403) return 'transient' // signierte URL abgelaufen
  if (err.status === 429 || (err.status !== undefined && err.status >= 500)) return 'transient'
  if (err.status === undefined || err.status === 0) {
    // Netzwerkfehler (kein HTTP-Status) – außer es ist ein Logikfehler aus dem Code
    return /net::|fetch failed|ECONN|ETIMEDOUT|ENOTFOUND|socket|network/i.test(err.message ?? '')
      ? 'transient'
      : 'fatal'
  }
  return 'fatal'
}

export interface QueueOptions {
  stateFile: string
  worker: Worker
  concurrency: () => number
  retryDelayMs?: number
}

const ACTIVE: JobStatus[] = ['preparing', 'downloading', 'tagging']

/** Download-Warteschlange mit Parallelität, Wiederholungen und Stopp bei Kontingent-Fehlern. */
export class DownloadQueue {
  private jobs: DownloadJob[] = []
  private paused = false
  private pauseReason: string | undefined
  private retryAt: number | undefined
  private controllers = new Map<string, AbortController>()
  private listeners = new Set<(s: QueueState) => void>()
  private retryTimer: NodeJS.Timeout | null = null
  private saver = debounced(() => this.persist(), 1000)
  private notifier = debounced(() => this.emit(), 150)
  private readonly retryDelay: number

  constructor(private readonly opts: QueueOptions) {
    this.retryDelay = opts.retryDelayMs ?? 60_000
    const saved = readJson<{ jobs?: DownloadJob[]; paused?: boolean }>(opts.stateFile, {})
    this.jobs = (saved.jobs ?? []).map((j) => (ACTIVE.includes(j.status) ? { ...j, status: 'queued', loaded: 0 } : j))
    // Nach Neustart offene Jobs nicht automatisch starten (Kontingent!) – Nutzer setzt fort.
    if (this.jobs.some((j) => j.status === 'queued')) {
      this.paused = true
      this.pauseReason = t('queue.restoredPaused')
    }
  }

  state(): QueueState {
    return { jobs: this.jobs, paused: this.paused, pauseReason: this.pauseReason, retryAt: this.retryAt }
  }

  onChange(cb: (s: QueueState) => void): () => void {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  private emit(): void {
    const s = this.state()
    for (const l of this.listeners) l(s)
  }

  private persist(): void {
    const keep = this.jobs.filter((j) => j.status !== 'done' && j.status !== 'copied' && j.status !== 'skipped' && j.status !== 'cancelled')
    writeJsonAtomic(this.opts.stateFile, { jobs: keep, paused: this.paused })
  }

  private changed(): void {
    this.saver.schedule()
    this.notifier.schedule()
  }

  flush(): void {
    this.saver.flush()
  }

  private update(id: string, patch: Partial<DownloadJob>): void {
    const j = this.jobs.find((x) => x.id === id)
    if (j) Object.assign(j, patch)
    this.changed()
  }

  enqueue(tracks: EnqueueTrack[], format: DownloadFormat, force = false): number {
    let added = 0
    for (const t of tracks) {
      const dup = this.jobs.find(
        (j) => j.trackId === t.trackId && j.format === format && (j.status === 'queued' || ACTIVE.includes(j.status))
      )
      if (dup) continue
      // Frühere, abgeschlossene/fehlerhafte Einträge desselben Tracks ersetzen
      this.jobs = this.jobs.filter((j) => !(j.trackId === t.trackId && j.format === format))
      this.jobs.push({
        id: randomUUID(),
        trackId: t.trackId,
        releaseId: t.releaseId,
        title: t.title,
        artist: t.artist,
        releaseTitle: t.releaseTitle,
        format,
        force,
        status: 'queued',
        loaded: 0,
        total: 0,
        attempts: 0,
        addedAt: Date.now()
      })
      added++
    }
    this.changed()
    this.pump()
    return added
  }

  pause(reason?: string): void {
    this.paused = true
    this.pauseReason = reason
    this.changed()
  }

  resume(): void {
    this.paused = false
    this.pauseReason = undefined
    this.retryAt = undefined
    this.changed()
    this.pump()
  }

  cancel(id: string): void {
    const j = this.jobs.find((x) => x.id === id)
    if (!j) return
    this.controllers.get(id)?.abort()
    if (j.status === 'queued' || ACTIVE.includes(j.status)) this.update(id, { status: 'cancelled', finishedAt: Date.now() })
  }

  retry(id?: string): void {
    for (const j of this.jobs) {
      if ((id ? j.id === id : true) && (j.status === 'error' || j.status === 'cancelled')) {
        Object.assign(j, { status: 'queued', attempts: 0, error: undefined, errorCode: undefined, loaded: 0 })
      }
    }
    this.changed()
    this.pump()
  }

  clearFinished(): void {
    this.jobs = this.jobs.filter((j) => j.status === 'queued' || ACTIVE.includes(j.status) || j.status === 'error')
    this.changed()
  }

  /** Laufen gerade Downloads (oder Vorbereitung/Tagging)? */
  isBusy(): boolean {
    return this.activeCount() > 0
  }

  private activeCount(): number {
    return this.jobs.filter((j) => ACTIVE.includes(j.status)).length
  }

  pump(): void {
    if (this.paused) return
    if (this.retryAt && Date.now() < this.retryAt) return
    this.retryAt = undefined
    while (this.activeCount() < this.opts.concurrency()) {
      const next = this.jobs.find((j) => j.status === 'queued')
      if (!next) break
      void this.run(next)
    }
  }

  private scheduleRetry(): void {
    this.retryAt = Date.now() + this.retryDelay
    if (this.retryTimer) clearTimeout(this.retryTimer)
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null
      this.retryAt = undefined
      this.changed()
      this.pump()
    }, this.retryDelay)
  }

  private async run(job: DownloadJob): Promise<void> {
    const ctrl = new AbortController()
    this.controllers.set(job.id, ctrl)
    this.update(job.id, { status: 'preparing', attempts: job.attempts + 1, error: undefined, errorCode: undefined })
    try {
      const result = await this.opts.worker(job, {
        signal: ctrl.signal,
        setStatus: (status) => this.update(job.id, { status }),
        progress: (loaded, total) => this.update(job.id, { loaded, total })
      })
      this.update(job.id, { status: result.status, path: result.path, finishedAt: Date.now() })
    } catch (e) {
      const kind = classifyError(e)
      const err = e as ErrorLike
      const message = err.message ?? String(e)
      if (kind === 'aborted' || job.status === 'cancelled') {
        this.update(job.id, { status: 'cancelled', finishedAt: Date.now() })
      } else if (kind === 'quota') {
        // Job bleibt in der Warteschlange, Queue stoppt – SoundScout-Limit wird respektiert.
        this.update(job.id, { status: 'queued', attempts: 0, loaded: 0, error: message, errorCode: err.code })
        this.pause(message)
      } else if (kind === 'auth') {
        this.update(job.id, { status: 'queued', attempts: 0, loaded: 0, error: message, errorCode: err.code })
        this.pause(t('queue.signInRequired'))
      } else if (kind === 'transient' && job.attempts < MAX_ATTEMPTS) {
        this.update(job.id, { status: 'queued', loaded: 0, error: t('queue.retryIn', { message, seconds: Math.round(this.retryDelay / 1000) }), errorCode: err.code })
        this.scheduleRetry()
      } else {
        this.update(job.id, { status: 'error', error: message, errorCode: err.code, finishedAt: Date.now() })
      }
    } finally {
      this.controllers.delete(job.id)
      this.pump()
    }
  }
}

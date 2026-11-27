import { describe, expect, it } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { classifyError, DownloadQueue, type Worker } from '../src/main/downloads/queue'
import { LibraryStore } from '../src/main/library/store'

const tmp = (): string => mkdtempSync(join(tmpdir(), 'ss-q-'))
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
const track = (n: number) => ({ trackId: `t${n}`, releaseId: 'r1', title: `T${n}`, artist: 'A' })
const apiErr = (status: number, code = '') => Object.assign(new Error(code || `HTTP ${status}`), { status, code })

async function waitFor(fn: () => boolean, ms = 2000): Promise<void> {
  const start = Date.now()
  while (!fn()) {
    if (Date.now() - start > ms) throw new Error('timeout')
    await sleep(5)
  }
}

describe('classifyError', () => {
  it('classifies SoundScout errors', () => {
    expect(classifyError(apiErr(403, 'download.monthly_limit'))).toBe('quota')
    expect(classifyError(apiErr(403, 'gold.download.requires_subscription'))).toBe('quota')
    expect(classifyError(apiErr(401, 'auth.sign_in_required'))).toBe('auth')
    expect(classifyError(apiErr(429))).toBe('transient')
    expect(classifyError(apiErr(503))).toBe('transient')
    expect(classifyError(apiErr(403, 'download.http'))).toBe('transient')
    expect(classifyError(apiErr(404, 'not_found'))).toBe('fatal')
    expect(classifyError(new Error('net::ERR_CONNECTION_RESET'))).toBe('transient')
    expect(classifyError(Object.assign(new Error('x'), { name: 'AbortError' }))).toBe('aborted')
  })
})

describe('DownloadQueue', () => {
  it('respects concurrency and finishes all jobs', async () => {
    let active = 0
    let maxActive = 0
    const worker: Worker = async (job) => {
      active++
      maxActive = Math.max(maxActive, active)
      await sleep(20)
      active--
      return { status: 'done', path: `/x/${job.trackId}` }
    }
    const q = new DownloadQueue({ stateFile: join(tmp(), 'q.json'), worker, concurrency: () => 2 })
    expect(q.enqueue([track(1), track(2), track(3), track(4)], 'FLAC')).toBe(4)
    expect(q.enqueue([track(1)], 'FLAC')).toBe(0) // Duplikat
    await waitFor(() => q.state().jobs.every((j) => j.status === 'done'))
    expect(maxActive).toBe(2)
  })

  it('pauses on monthly limit and keeps the job queued', async () => {
    let calls = 0
    const worker: Worker = async () => {
      calls++
      throw apiErr(403, 'download.monthly_limit')
    }
    const q = new DownloadQueue({ stateFile: join(tmp(), 'q.json'), worker, concurrency: () => 1 })
    q.enqueue([track(1), track(2)], 'FLAC')
    await waitFor(() => q.state().paused)
    await sleep(30)
    expect(calls).toBe(1)
    expect(q.state().jobs.map((j) => j.status)).toEqual(['queued', 'queued'])
    expect(q.state().pauseReason).toContain('download.monthly_limit')
  })

  it('retries transient errors up to 3 times', async () => {
    let calls = 0
    const worker: Worker = async () => {
      calls++
      throw apiErr(503)
    }
    const q = new DownloadQueue({ stateFile: join(tmp(), 'q.json'), worker, concurrency: () => 1, retryDelayMs: 10 })
    q.enqueue([track(1)], 'FLAC')
    await waitFor(() => q.state().jobs[0].status === 'error')
    expect(calls).toBe(3)
  })

  it('restores open jobs paused after restart', async () => {
    const file = join(tmp(), 'q.json')
    writeFileSync(file, JSON.stringify({ jobs: [{ id: 'a', trackId: 't1', releaseId: 'r', title: 'x', artist: 'y', format: 'FLAC', status: 'downloading', loaded: 5, total: 9, attempts: 1, addedAt: 1 }] }))
    const q = new DownloadQueue({ stateFile: file, worker: async () => ({ status: 'done', path: '' }), concurrency: () => 1 })
    expect(q.state().paused).toBe(true)
    expect(q.state().jobs[0].status).toBe('queued')
    q.resume()
    await waitFor(() => q.state().jobs[0].status === 'done')
  })
})

describe('LibraryStore', () => {
  it('tracks files, release status and missing files', () => {
    const dir = tmp()
    const store = new LibraryStore(join(dir, 'lib.json'))
    const f1 = join(dir, '01.flac')
    writeFileSync(f1, 'x')
    store.upsertRelease({ releaseId: 'r1', title: 'R', artist: 'A', year: '2022', catalogId: 'MCS1', type: 'Single', trackTotal: 2 })
    store.addFile({ trackId: 't1', releaseId: 'r1', title: 'T1', artist: 'A', releaseTitle: 'R', releaseArtist: 'A', trackNumber: 1 }, { format: 'FLAC', path: f1, size: 1, downloadedAt: 1 })
    expect(store.releaseStatus('r1')).toEqual({ downloaded: 1, total: 2, status: 'partial' })
    store.addFile({ trackId: 't2', releaseId: 'r1', title: 'T2', artist: 'A', releaseTitle: 'R', releaseArtist: 'A', trackNumber: 2 }, { format: 'FLAC', path: join(dir, 'gone.flac'), size: 1, downloadedAt: 1 })
    expect(store.verify().missing).toBe(1)
    expect(store.releaseStatus('r1').status).toBe('partial')
    expect(store.existingFile('t1', 'FLAC')?.path).toBe(f1)
    expect(store.existingFile('t2')).toBeUndefined()
    store.flush()
    const reloaded = new LibraryStore(join(dir, 'lib.json'))
    expect(Object.keys(reloaded.snapshot().tracks)).toEqual(['t1', 't2'])
  })
  it('keeps the same track for different releases but never runs it twice at once', async () => {
    const order: string[] = []
    let active = 0
    let maxSameTrack = 0
    const worker: Worker = async (job) => {
      active += job.trackId === 't1' ? 1 : 0
      maxSameTrack = Math.max(maxSameTrack, active)
      order.push(`${job.trackId}@${job.releaseId}`)
      await sleep(15)
      active -= job.trackId === 't1' ? 1 : 0
      return { status: 'done', path: '' }
    }
    const q = new DownloadQueue({ stateFile: join(tmp(), 'q.json'), worker, concurrency: () => 3 })
    const single = track(1)
    const album = { ...track(1), releaseId: 'album' }
    expect(q.enqueue([single, album, track(2)], 'FLAC')).toBe(3)
    expect(q.enqueue([album], 'FLAC')).toBe(0) // Duplikat
    await waitFor(() => q.state().jobs.every((j) => j.status === 'done'))
    expect(maxSameTrack).toBe(1)
    expect(order).toEqual(['t1@r1', 't2@r1', 't1@album'])
  })
})

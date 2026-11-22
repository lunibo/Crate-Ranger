import { describe, expect, it } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MONTHLY_LIMIT, planLimit, QuotaTracker } from '../src/main/downloads/quota'

const file = (): string => join(mkdtempSync(join(tmpdir(), 'ss-quota-')), 'log.json')
const plan = { Tier: 'creator', PlanName: 'Creator Plan - Monthly', BillingPeriod: 'monthly', Start: '2026-03-10T09:00:00Z', Finish: '2026-04-10T09:00:00Z' }

describe('planLimit', () => {
  it('maps plans to limits', () => {
    expect(planLimit('legacy', 'monthly')).toBe(3000)
    expect(planLimit('creator', 'annual')).toBeNull()
    expect(planLimit('personal_trial', 'monthly')).toBe(25)
    expect(planLimit(undefined, undefined)).toBeNull()
  })
})

describe('QuotaTracker', () => {
  it('counts only downloads inside the billing period', () => {
    let now = Date.parse('2026-03-01T00:00:00Z')
    const f = file()
    const q = new QuotaTracker(f, () => now)
    q.record('old', 'FLAC') // vorheriger Zeitraum
    now = Date.parse('2026-03-20T10:00:00Z')
    q.record('a', 'FLAC')
    q.record('b', 'MP3_320')
    const info = q.info(plan)
    expect(info.used).toBe(2)
    expect(info.limit).toBe(MONTHLY_LIMIT)
    expect(info.remaining).toBe(MONTHLY_LIMIT - 2)
    expect(info.periodEnd).toBe('2026-04-10T09:00:00.000Z')
    q.flush()
    expect(new QuotaTracker(f, () => now).info(plan).used).toBe(2)
  })

  it('reports 0 remaining after the server refused, until the period resets', () => {
    let now = Date.parse('2026-04-01T00:00:00Z')
    const q = new QuotaTracker(file(), () => now)
    q.markLimitReached('You have used all your downloads')
    expect(q.info(plan).remaining).toBe(0)
    now = Date.parse('2026-04-12T00:00:00Z')
    const next = { ...plan, Start: '2026-04-10T09:00:00Z', Finish: '2026-05-10T09:00:00Z' }
    expect(q.info(next).limitReached).toBeUndefined()
    expect(q.info(next).remaining).toBe(MONTHLY_LIMIT)
  })

  it('falls back to a rolling 30-day window without a plan', () => {
    const now = Date.parse('2026-11-22T00:00:00Z')
    const q = new QuotaTracker(file(), () => now)
    q.record('x', 'WAV')
    const info = q.info(null)
    expect(info.limit).toBeNull()
    expect(info.used).toBe(1)
    expect(info.remaining).toBeNull()
  })
})

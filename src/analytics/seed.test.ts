import { describe, expect, it } from 'vitest'
import { DEFAULT_FLAGS, generateSeed } from './seed'
import { computeFunnel } from './funnel'

describe('seed generator', () => {
  it('creates at least 200 users with sessions and events, deterministically', () => {
    const a = generateSeed({ users: 200, seed: 7, now: 1_700_000_000_000 })
    const b = generateSeed({ users: 200, seed: 7, now: 1_700_000_000_000 })
    expect(a.users).toHaveLength(200)
    expect(new Set(a.sessions.map((s) => s.userId)).size).toBe(200)
    expect(a.sessions.length).toBeGreaterThanOrEqual(200)
    expect(a.events.length).toBeGreaterThan(1000)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
    for (const s of a.sessions) {
      expect(s.synthetic).toBe(true)
      expect(s.hasRecording).toBe(false)
      expect(s.eventCount).toBeGreaterThan(0)
      expect(s.pageCount).toBeGreaterThan(0)
    }
  })

  it('produces a non-empty storefront funnel with monotonic drop-off', () => {
    const { events } = generateSeed({ users: 200, now: 1_700_000_000_000 })
    const funnel = computeFunnel(
      events,
      [
        { event: '$pageview' },
        { event: 'product_viewed' },
        { event: 'add_to_cart' },
        { event: 'checkout_started' },
        { event: 'purchase_completed' },
      ],
      30 * 60_000,
    )
    const counts = funnel.steps.map((s) => s.count)
    expect(counts[0]).toBeGreaterThanOrEqual(200)
    for (let i = 1; i < counts.length; i++) expect(counts[i]).toBeLessThanOrEqual(counts[i - 1])
    expect(counts[4]).toBeGreaterThan(20)
    expect(funnel.medianTimeToConvert).toBeGreaterThan(0)
  })

  it('stamps every event with active flags and a session id', () => {
    const { events, sessions } = generateSeed({ users: 20, now: 1_700_000_000_000, flags: DEFAULT_FLAGS })
    const ids = new Set(sessions.map((s) => s.id))
    for (const e of events) {
      expect(ids.has(e.sessionId)).toBe(true)
      expect(e.props.$flags).toBeDefined()
      expect(e.props.$current_url).toContain('/demo/store')
    }
  })
})

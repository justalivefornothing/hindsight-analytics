import { describe, expect, it } from 'vitest'
import { computeFunnel, matchesFilter, median } from './funnel'
import type { FunnelStep } from './funnel'
import type { AnalyticsEvent } from '../recorder/types'

const MIN = 60_000
let seq = 0

function ev(userId: string, name: string, ts: number, props: Record<string, string | number> = {}): AnalyticsEvent {
  return { id: `e${++seq}`, sessionId: `s_${userId}`, userId, name, ts, t: ts, props }
}

const STEPS: FunnelStep[] = [{ event: 'view' }, { event: 'cart' }, { event: 'buy' }]

describe('computeFunnel', () => {
  it('counts ordered conversions and drop-offs per user', () => {
    const events = [
      // u1 converts fully
      ev('u1', 'view', 0),
      ev('u1', 'cart', 1 * MIN),
      ev('u1', 'buy', 3 * MIN),
      // u2 drops after cart
      ev('u2', 'view', 0),
      ev('u2', 'cart', 2 * MIN),
      // u3 only views
      ev('u3', 'view', 5 * MIN),
      // u4 never enters the funnel
      ev('u4', 'cart', 0),
      ev('u4', 'buy', MIN),
    ]
    const r = computeFunnel(events, STEPS, 60 * MIN)
    expect(r.steps.map((s) => s.count)).toEqual([3, 2, 1])
    expect(r.totalUsers).toBe(3)
    expect(r.converted).toBe(1)
    expect(r.conversionRate).toBeCloseTo(1 / 3)
    expect(r.steps[0].dropped.map((d) => d.userId)).toEqual(['u3'])
    expect(r.steps[1].dropped.map((d) => d.userId)).toEqual(['u2'])
    expect(r.steps[1].dropped[0]).toMatchObject({ sessionId: 's_u2', ts: 2 * MIN, lastStep: 1 })
    expect(r.steps[2].dropped).toEqual([])
    expect(r.steps[1].conversionFromPrevious).toBeCloseTo(2 / 3)
    expect(r.steps[2].conversionFromStart).toBeCloseTo(1 / 3)
  })

  it('does not count steps that happen out of order', () => {
    const events = [
      ev('u1', 'cart', 0), // before view: must not count
      ev('u1', 'view', MIN),
      ev('u2', 'buy', 0),
      ev('u2', 'view', MIN),
      ev('u2', 'cart', 2 * MIN), // buy came before cart: user stops at cart
    ]
    const r = computeFunnel(events, STEPS, 60 * MIN)
    expect(r.steps.map((s) => s.count)).toEqual([2, 1, 0])
    expect(r.steps[0].dropped.map((d) => d.userId)).toEqual(['u1'])
    expect(r.steps[1].dropped.map((d) => d.userId)).toEqual(['u2'])
  })

  it('enforces the conversion window from the first step', () => {
    const events = [
      ev('fast', 'view', 0),
      ev('fast', 'cart', 5 * MIN),
      ev('fast', 'buy', 29 * MIN),
      ev('slow', 'view', 0),
      ev('slow', 'cart', 10 * MIN),
      ev('slow', 'buy', 31 * MIN), // outside a 30 minute window
    ]
    const r = computeFunnel(events, STEPS, 30 * MIN)
    expect(r.steps.map((s) => s.count)).toEqual([2, 2, 1])
    expect(r.steps[1].dropped.map((d) => d.userId)).toEqual(['slow'])
    // widen the window and everyone converts
    expect(computeFunnel(events, STEPS, 60 * MIN).converted).toBe(2)
  })

  it('picks the best attempt when a user re-enters the funnel', () => {
    const events = [
      ev('u1', 'view', 0),
      ev('u1', 'cart', 5 * MIN), // first attempt stalls
      ev('u1', 'view', 120 * MIN), // second attempt converts within the window
      ev('u1', 'cart', 121 * MIN),
      ev('u1', 'buy', 125 * MIN),
    ]
    const r = computeFunnel(events, STEPS, 30 * MIN)
    expect(r.steps.map((s) => s.count)).toEqual([1, 1, 1])
    expect(r.medianTimeToConvert).toBe(5 * MIN)
  })

  it('computes median time between steps and to convert', () => {
    const events = [
      ev('a', 'view', 0),
      ev('a', 'cart', 1 * MIN),
      ev('a', 'buy', 2 * MIN),
      ev('b', 'view', 0),
      ev('b', 'cart', 3 * MIN),
      ev('b', 'buy', 10 * MIN),
      ev('c', 'view', 0),
      ev('c', 'cart', 5 * MIN),
    ]
    const r = computeFunnel(events, STEPS, 60 * MIN)
    expect(r.steps[1].medianTimeFromPrevious).toBe(3 * MIN)
    expect(r.steps[2].medianTimeFromPrevious).toBe((1 * MIN + 7 * MIN) / 2)
    expect(r.medianTimeToConvert).toBe((2 * MIN + 10 * MIN) / 2)
    expect(r.steps[0].medianTimeFromPrevious).toBeNull()
  })

  it('applies property filters on steps', () => {
    const steps: FunnelStep[] = [
      { event: 'view', filter: { key: 'device', op: 'eq', value: 'mobile' } },
      { event: 'buy' },
    ]
    const events = [
      ev('m', 'view', 0, { device: 'mobile' }),
      ev('m', 'buy', MIN),
      ev('d', 'view', 0, { device: 'desktop' }),
      ev('d', 'buy', MIN),
    ]
    const r = computeFunnel(events, steps, 60 * MIN)
    expect(r.steps.map((s) => s.count)).toEqual([1, 1])
    expect(r.steps[0].users).toEqual(['m'])
  })

  it('handles empty input', () => {
    const r = computeFunnel([], STEPS, MIN)
    expect(r.steps.map((s) => s.count)).toEqual([0, 0, 0])
    expect(r.conversionRate).toBe(0)
    expect(r.medianTimeToConvert).toBeNull()
  })
})

describe('matchesFilter', () => {
  const props = { plan: 'pro', count: 3 }
  it('supports eq / neq / contains / set / not_set', () => {
    expect(matchesFilter(props, { key: 'plan', op: 'eq', value: 'pro' })).toBe(true)
    expect(matchesFilter(props, { key: 'count', op: 'eq', value: '3' })).toBe(true)
    expect(matchesFilter(props, { key: 'plan', op: 'neq', value: 'pro' })).toBe(false)
    expect(matchesFilter(props, { key: 'plan', op: 'contains', value: 'PR' })).toBe(true)
    expect(matchesFilter(props, { key: 'plan', op: 'set', value: '' })).toBe(true)
    expect(matchesFilter(props, { key: 'missing', op: 'not_set', value: '' })).toBe(true)
    expect(matchesFilter(props, { key: 'missing', op: 'eq', value: 'x' })).toBe(false)
    expect(matchesFilter(props, null)).toBe(true)
  })
})

describe('median', () => {
  it('handles odd, even and empty inputs', () => {
    expect(median([3, 1, 2])).toBe(2)
    expect(median([4, 1, 3, 2])).toBe(2.5)
    expect(median([])).toBeNull()
  })
})

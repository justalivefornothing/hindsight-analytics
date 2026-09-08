import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { evaluateFlags, fnv1a32, isFlagActive, normalizeFlagKey, rolloutBucket } from './flags'

describe('feature flag rollout hashing', () => {
  it('fnv1a32 matches known vectors', () => {
    expect(fnv1a32('')).toBe(0x811c9dc5)
    expect(fnv1a32('a')).toBe(0xe40c292c)
    expect(fnv1a32('foobar')).toBe(0xbf9cf968)
  })

  it('is deterministic per userId', () => {
    fc.assert(
      fc.property(fc.string(), fc.string({ minLength: 1 }), fc.integer({ min: 0, max: 100 }), (key, user, rollout) => {
        const flag = { key, enabled: true, rollout }
        const a = isFlagActive(flag, user)
        const b = isFlagActive(flag, user)
        return a === b && rolloutBucket(key, user) === rolloutBucket(key, user)
      }),
    )
  })

  it('gates a 50% rollout to between 48% and 52% of 10,000 synthetic ids', () => {
    const flag = { key: 'new-checkout', enabled: true, rollout: 50 }
    let active = 0
    for (let i = 0; i < 10_000; i++) if (isFlagActive(flag, `user_${i}`)) active++
    const share = active / 10_000
    expect(share).toBeGreaterThanOrEqual(0.48)
    expect(share).toBeLessThanOrEqual(0.52)
  })

  it('respects 0%, 100% and disabled flags', () => {
    for (let i = 0; i < 200; i++) {
      const id = `u${i}`
      expect(isFlagActive({ key: 'k', enabled: true, rollout: 0 }, id)).toBe(false)
      expect(isFlagActive({ key: 'k', enabled: true, rollout: 100 }, id)).toBe(true)
      expect(isFlagActive({ key: 'k', enabled: false, rollout: 100 }, id)).toBe(false)
    }
  })

  it('increasing the rollout never removes a user (monotonic buckets)', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), fc.integer({ min: 0, max: 99 }), (user, rollout) => {
        const lower = isFlagActive({ key: 'k', enabled: true, rollout }, user)
        const higher = isFlagActive({ key: 'k', enabled: true, rollout: rollout + 1 }, user)
        return !lower || higher
      }),
    )
  })

  it('evaluates a set of flags into a map and normalizes keys', () => {
    const flags = [
      { key: 'a', description: '', enabled: true, rollout: 100, createdAt: 0 },
      { key: 'b', description: '', enabled: false, rollout: 100, createdAt: 0 },
    ]
    expect(evaluateFlags(flags, 'x')).toEqual({ a: true, b: false })
    expect(normalizeFlagKey('  New Checkout!! ')).toBe('new-checkout')
  })
})

export interface FeatureFlag {
  key: string
  description: string
  enabled: boolean
  /** 0..100 percentage of users who receive the flag */
  rollout: number
  createdAt: number
}

/**
 * 32-bit FNV-1a. Small, fast, and spreads short user ids evenly across
 * buckets, which is all a percentage rollout needs.
 */
export function fnv1a32(input: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    // hash *= 16777619 using shifts to stay in 32-bit integer math
    hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0
  }
  return hash >>> 0
}

/** Deterministic bucket in [0, 100) for a user/flag pair. */
export function rolloutBucket(flagKey: string, userId: string): number {
  return (fnv1a32(`${flagKey}::${userId}`) % 10_000) / 100
}

export function isFlagActive(flag: Pick<FeatureFlag, 'key' | 'enabled' | 'rollout'>, userId: string): boolean {
  if (!flag.enabled || flag.rollout <= 0) return false
  if (flag.rollout >= 100) return true
  return rolloutBucket(flag.key, userId) < flag.rollout
}

/** Map of flag key -> active for a given user. */
export function evaluateFlags(flags: FeatureFlag[], userId: string): Record<string, boolean> {
  const out: Record<string, boolean> = {}
  for (const f of flags) out[f.key] = isFlagActive(f, userId)
  return out
}

export function normalizeFlagKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
}

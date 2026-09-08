import type { AnalyticsEvent, PropValue } from '../recorder/types'

export type FilterOp = 'eq' | 'neq' | 'contains' | 'set' | 'not_set'

export interface PropertyFilter {
  key: string
  op: FilterOp
  value: string
}

export interface FunnelStep {
  event: string
  filter?: PropertyFilter | null
  label?: string
}

export interface FunnelDefinition {
  id: string
  name: string
  steps: FunnelStep[]
  /** conversion window measured from the first step, in ms */
  windowMs: number
}

export interface DropOff {
  userId: string
  sessionId: string
  /** time of the last step this user completed */
  ts: number
  /** replay-relative offset of that step */
  t: number
  /** index of the last completed step */
  lastStep: number
}

export interface FunnelStepResult {
  step: FunnelStep
  index: number
  count: number
  /** users who reached this step */
  users: string[]
  /** fraction of the first step */
  conversionFromStart: number
  /** fraction of the previous step */
  conversionFromPrevious: number
  /** median ms from the previous step for users who completed both */
  medianTimeFromPrevious: number | null
  /** users who completed this step but never completed the next one */
  dropped: DropOff[]
}

export interface FunnelResult {
  steps: FunnelStepResult[]
  totalUsers: number
  converted: number
  conversionRate: number
  /** median ms from first to last step for converted users */
  medianTimeToConvert: number | null
}

export function matchesFilter(props: Record<string, PropValue>, filter?: PropertyFilter | null): boolean {
  if (!filter || !filter.key) return true
  const raw = props[filter.key]
  const present = raw !== undefined && raw !== null
  switch (filter.op) {
    case 'set':
      return present
    case 'not_set':
      return !present
    case 'eq':
      return present && String(raw) === filter.value
    case 'neq':
      return !present || String(raw) !== filter.value
    case 'contains':
      return present && String(raw).toLowerCase().includes(filter.value.toLowerCase())
  }
}

function matchesStep(e: AnalyticsEvent, step: FunnelStep): boolean {
  return e.name === step.event && matchesFilter(e.props, step.filter)
}

export function median(values: number[]): number | null {
  if (!values.length) return null
  const sorted = values.slice().sort((a, b) => a - b)
  const mid = sorted.length >> 1
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

interface Attempt {
  /** matched events, one per completed step */
  matched: AnalyticsEvent[]
}

/**
 * Best attempt for one user: try every occurrence of step 1 as an entry point
 * and greedily match the remaining steps strictly in order within the window.
 * The attempt that reaches the furthest wins (earliest on ties).
 */
function bestAttempt(events: AnalyticsEvent[], steps: FunnelStep[], windowMs: number): Attempt {
  let best: Attempt = { matched: [] }
  for (let i = 0; i < events.length; i++) {
    if (!matchesStep(events[i], steps[0])) continue
    const start = events[i]
    const matched = [start]
    let cursor = i + 1
    for (let s = 1; s < steps.length; s++) {
      let found = -1
      for (let j = cursor; j < events.length; j++) {
        const e = events[j]
        if (e.ts - start.ts > windowMs) break
        if (matchesStep(e, steps[s])) {
          found = j
          break
        }
      }
      if (found < 0) break
      matched.push(events[found])
      cursor = found + 1
    }
    if (matched.length > best.matched.length) best = { matched }
    if (best.matched.length === steps.length) break
  }
  return best
}

/**
 * Compute an ordered funnel over per-user event sequences.
 *
 * - steps must happen in order; an out-of-order occurrence does not count
 * - every step must fall within `windowMs` of the matched first step
 * - each user is counted at most once per step
 */
export function computeFunnel(
  events: AnalyticsEvent[],
  steps: FunnelStep[],
  windowMs: number,
): FunnelResult {
  const byUser = new Map<string, AnalyticsEvent[]>()
  for (const e of events) {
    let list = byUser.get(e.userId)
    if (!list) byUser.set(e.userId, (list = []))
    list.push(e)
  }

  const stepUsers: string[][] = steps.map(() => [])
  const stepDrops: DropOff[][] = steps.map(() => [])
  const stepDurations: number[][] = steps.map(() => [])
  const totalDurations: number[] = []

  for (const [userId, list] of byUser) {
    list.sort((a, b) => a.ts - b.ts)
    const { matched } = bestAttempt(list, steps, windowMs)
    if (!matched.length) continue
    for (let s = 0; s < matched.length; s++) {
      stepUsers[s].push(userId)
      if (s > 0) stepDurations[s].push(matched[s].ts - matched[s - 1].ts)
    }
    const last = matched.length - 1
    if (matched.length < steps.length) {
      const e = matched[last]
      stepDrops[last].push({ userId, sessionId: e.sessionId, ts: e.ts, t: e.t, lastStep: last })
    } else {
      totalDurations.push(matched[last].ts - matched[0].ts)
    }
  }

  const first = stepUsers[0]?.length ?? 0
  const results: FunnelStepResult[] = steps.map((step, index) => {
    const count = stepUsers[index].length
    const prev = index === 0 ? count : stepUsers[index - 1].length
    return {
      step,
      index,
      count,
      users: stepUsers[index],
      conversionFromStart: first ? count / first : 0,
      conversionFromPrevious: prev ? count / prev : 0,
      medianTimeFromPrevious: index === 0 ? null : median(stepDurations[index]),
      dropped: stepDrops[index],
    }
  })

  const converted = stepUsers[steps.length - 1]?.length ?? 0
  return {
    steps: results,
    totalUsers: first,
    converted,
    conversionRate: first ? converted / first : 0,
    medianTimeToConvert: median(totalDurations),
  }
}

export function formatDuration(ms: number | null): string {
  if (ms === null) return '—'
  if (ms < 1000) return `${Math.round(ms)}ms`
  const s = ms / 1000
  if (s < 60) return `${s.toFixed(s < 10 ? 1 : 0)}s`
  const m = s / 60
  if (m < 60) return `${Math.floor(m)}m ${Math.round(s % 60)}s`
  const h = m / 60
  if (h < 48) return `${Math.floor(h)}h ${Math.round(m % 60)}m`
  return `${(h / 24).toFixed(1)}d`
}

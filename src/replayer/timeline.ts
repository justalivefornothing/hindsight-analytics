import type { RecordedEvent, RecordedEventType } from '../recorder/types'

/** Pure helpers describing a recording's shape on a virtual timeline. */

export interface InactivitySegment {
  start: number
  end: number
}

export interface Marker {
  t: number
  name: string
}

/** Event types that count as "something happened" for inactivity detection. */
const ACTIVITY: ReadonlySet<RecordedEventType> = new Set<RecordedEventType>([
  'move',
  'click',
  'scroll',
  'input',
  'mutation',
  'url',
  'marker',
  'resize',
  'focus',
])

export const DEFAULT_INACTIVITY_MS = 4000

/** Sort events by time, keeping insertion order for ties. */
export function sortEvents(events: RecordedEvent[]): RecordedEvent[] {
  return events
    .map((e, i) => ({ e, i }))
    .sort((a, b) => a.e.t - b.e.t || a.i - b.i)
    .map((x) => x.e)
}

export function totalDuration(events: RecordedEvent[]): number {
  let max = 0
  for (const e of events) if (e.t > max) max = e.t
  return max
}

/** Gaps between activity events longer than `threshold`. */
export function findInactivity(
  events: RecordedEvent[],
  threshold = DEFAULT_INACTIVITY_MS,
): InactivitySegment[] {
  const out: InactivitySegment[] = []
  let last = 0
  for (const e of events) {
    if (!ACTIVITY.has(e.type)) continue
    if (e.t - last > threshold) out.push({ start: last, end: e.t })
    if (e.t > last) last = e.t
  }
  return out
}

/** Total time covered by inactivity segments. */
export function inactiveTotal(segments: InactivitySegment[]): number {
  return segments.reduce((sum, s) => sum + (s.end - s.start), 0)
}

/** If `t` falls inside a segment, return the segment's end; else `t`. */
export function skipInactive(t: number, segments: InactivitySegment[], padMs = 250): number {
  for (const s of segments) {
    if (t > s.start + padMs && t < s.end - padMs) return s.end - padMs
  }
  return t
}

export function collectMarkers(events: RecordedEvent[]): Marker[] {
  const out: Marker[] = []
  for (const e of events) if (e.type === 'marker') out.push({ t: e.t, name: e.name })
  return out
}

/** Indices of every snapshot event (ascending). */
export function snapshotIndices(events: RecordedEvent[]): number[] {
  const out: number[] = []
  for (let i = 0; i < events.length; i++) if (events[i].type === 'snapshot') out.push(i)
  return out
}

/**
 * Binary search: the index of the latest snapshot whose time is <= t, or -1.
 */
export function lastSnapshotIndex(events: RecordedEvent[], snapshots: number[], t: number): number {
  let lo = 0
  let hi = snapshots.length - 1
  let best = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (events[snapshots[mid]].t <= t) {
      best = snapshots[mid]
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  return best
}

/** Binary search: first index whose time is strictly greater than t. */
export function firstIndexAfter(events: RecordedEvent[], t: number): number {
  let lo = 0
  let hi = events.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (events[mid].t <= t) lo = mid + 1
    else hi = mid
  }
  return lo
}

export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

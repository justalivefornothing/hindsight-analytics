import type { AnalyticsEvent, RecordedEvent } from '../recorder/types'

export interface ClickPoint {
  /** normalised 0..1 within the viewport */
  x: number
  y: number
}

export interface SessionSummary {
  id: string
  userId: string
  startedAt: number
  /** last activity, epoch ms */
  endedAt: number
  durationMs: number
  eventCount: number
  pageCount: number
  /** distinct urls visited in order */
  urls: string[]
  viewport: { w: number; h: number }
  clickPoints: ClickPoint[]
  /** false for seeded sessions that carry analytics events but no DOM recording */
  hasRecording: boolean
  /** number of replay chunks stored */
  chunkCount: number
  /** active flags at session start */
  flags: Record<string, boolean>
  /** true when produced by the seed generator */
  synthetic?: boolean
}

export function emptySummary(id: string, userId: string, startedAt: number): SessionSummary {
  return {
    id,
    userId,
    startedAt,
    endedAt: startedAt,
    durationMs: 0,
    eventCount: 0,
    pageCount: 0,
    urls: [],
    viewport: { w: 1280, h: 800 },
    clickPoints: [],
    hasRecording: false,
    chunkCount: 0,
    flags: {},
  }
}

/**
 * Fold a batch of replay events into a running summary. Called on every
 * flush so the sessions list stays accurate without re-reading chunks.
 */
export function foldReplayEvents(summary: SessionSummary, events: RecordedEvent[]): SessionSummary {
  const next: SessionSummary = { ...summary, urls: summary.urls.slice(), clickPoints: summary.clickPoints.slice() }
  let { w, h } = next.viewport
  let maxT = next.durationMs
  for (const e of events) {
    if (e.t > maxT) maxT = e.t
    switch (e.type) {
      case 'meta':
        w = e.w
        h = e.h
        next.viewport = { w, h }
        if (!next.urls.includes(e.href)) next.urls.push(e.href)
        break
      case 'resize':
        w = e.w
        h = e.h
        next.viewport = { w, h }
        break
      case 'url':
        if (next.urls[next.urls.length - 1] !== e.href) next.urls.push(e.href)
        break
      case 'click':
        if (w > 0 && h > 0) {
          next.clickPoints.push({
            x: Math.min(1, Math.max(0, e.x / w)),
            y: Math.min(1, Math.max(0, e.y / h)),
          })
        }
        break
      case 'snapshot':
        next.hasRecording = true
        break
      default:
        break
    }
  }
  next.durationMs = maxT
  next.endedAt = next.startedAt + maxT
  next.pageCount = new Set(next.urls.map(stripHash)).size
  return next
}

export function foldAnalyticsEvents(summary: SessionSummary, events: AnalyticsEvent[]): SessionSummary {
  let maxT = summary.durationMs
  for (const e of events) if (e.t > maxT) maxT = e.t
  return {
    ...summary,
    eventCount: summary.eventCount + events.length,
    durationMs: maxT,
    endedAt: summary.startedAt + maxT,
  }
}

function stripHash(url: string): string {
  const i = url.indexOf('#')
  return i < 0 ? url : url.slice(0, i)
}

export function pathnameOf(url: string): string {
  try {
    return new URL(url).pathname
  } catch {
    return url
  }
}

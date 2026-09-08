import { createRecorder } from '../recorder/recorder'
import type { Recorder } from '../recorder/recorder'
import type { AnalyticsEvent, PropValue, RecordedEvent } from '../recorder/types'
import { emptySummary, foldAnalyticsEvents, foldReplayEvents } from '../analytics/session'
import type { SessionSummary } from '../analytics/session'
import { publish } from './bus'
import { addEvents, appendChunk } from './repo'
import { newSessionId } from './identity'

export interface RecordingSession {
  recorder: Recorder
  sessionId: string
  summary(): SessionSummary
  stop(): Promise<void>
}

export interface StartRecordingOptions {
  win: Window
  userId: string
  context?: () => Record<string, PropValue>
  flags?: Record<string, boolean>
}

/**
 * Wire the dependency-free recorder to IndexedDB: replay events are stored as
 * numbered chunks, analytics events go to their own store, and a running
 * summary row keeps the sessions list accurate while recording is live.
 */
export function startRecordingSession(options: StartRecordingOptions): RecordingSession {
  const sessionId = newSessionId()
  let summary = emptySummary(sessionId, options.userId, Date.now())
  summary.flags = options.flags ?? {}
  let seq = 0
  let writes: Promise<unknown> = Promise.resolve()
  let pendingAnalytics: AnalyticsEvent[] = []
  let analyticsTimer: ReturnType<typeof setTimeout> | null = null

  const enqueue = (fn: () => Promise<unknown>) => {
    writes = writes.then(fn, fn).catch(() => undefined)
    return writes
  }

  const flushAnalytics = () => {
    analyticsTimer = null
    if (!pendingAnalytics.length) return
    const batch = pendingAnalytics
    pendingAnalytics = []
    summary = foldAnalyticsEvents(summary, batch)
    const snapshot = summary
    enqueue(() => addEvents(batch, snapshot)).then(() => {
      publish({ kind: 'events', events: batch })
      publish({ kind: 'session', session: snapshot })
    })
  }

  const onEvents = (events: RecordedEvent[]) => {
    seq += 1
    summary = foldReplayEvents(summary, events)
    summary.chunkCount = seq
    const snapshot = summary
    enqueue(() => appendChunk({ sessionId, seq, events }, snapshot)).then(() =>
      publish({ kind: 'session', session: snapshot }),
    )
  }

  const onAnalytics = (event: AnalyticsEvent) => {
    pendingAnalytics.push(event)
    if (analyticsTimer === null) analyticsTimer = setTimeout(flushAnalytics, 150)
  }

  const recorder = createRecorder({
    win: options.win,
    sessionId,
    userId: options.userId,
    onEvents,
    onAnalytics,
    context: options.context,
  })
  summary = { ...summary, startedAt: Date.now() }
  recorder.start()

  return {
    recorder,
    sessionId,
    summary: () => summary,
    async stop() {
      recorder.stop()
      if (analyticsTimer !== null) clearTimeout(analyticsTimer)
      flushAnalytics()
      await writes
    },
  }
}

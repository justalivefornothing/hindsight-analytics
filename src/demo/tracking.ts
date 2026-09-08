import { create } from 'zustand'
import type { PropValue } from '../recorder/types'
import { evaluateFlags } from '../analytics/flags'
import { bootstrapDatabase, listFlags, publish, startRecordingSession, subscribe } from '../storage'
import type { RecordingSession } from '../storage'
import { getDistinctId } from '../storage/identity'

/**
 * The storefront's analytics SDK: one call boots the recorder against this
 * window, evaluates feature flags for the visitor and exposes `capture()`.
 * This is the "posthog.init()" equivalent for the demo app.
 */
interface TrackingState {
  ready: boolean
  userId: string
  sessionId: string | null
  flags: Record<string, boolean>
  startedAt: number
}

export const useTracking = create<TrackingState>(() => ({
  ready: false,
  userId: getDistinctId(),
  sessionId: null,
  flags: {},
  startedAt: 0,
}))

let recording: RecordingSession | null = null

function device(): string {
  return window.innerWidth < 640 ? 'mobile' : window.innerWidth < 1024 ? 'tablet' : 'desktop'
}

async function refreshFlags(userId: string): Promise<Record<string, boolean>> {
  const defs = await listFlags()
  const flags = evaluateFlags(defs, userId)
  useTracking.setState({ flags })
  return flags
}

export async function bootTracking(): Promise<void> {
  if (recording) return
  const userId = getDistinctId()
  const info = await bootstrapDatabase()
  const flags = evaluateFlags(info.flags, userId)
  useTracking.setState({ flags })

  recording = startRecordingSession({
    win: window,
    userId,
    flags,
    context: () => ({
      $flags: useTracking.getState().flags,
      $device: device(),
      $app: 'northlight-store',
    }),
  })
  useTracking.setState({ ready: true, sessionId: recording.sessionId, userId, startedAt: Date.now() })
  publish({ kind: 'live', sessionId: recording.sessionId })

  subscribe((msg) => {
    if (msg.kind === 'flags') void refreshFlags(useTracking.getState().userId)
  })

  const stop = () => {
    if (!recording) return
    const rec = recording
    recording = null
    publish({ kind: 'live', sessionId: null })
    void rec.stop()
  }
  window.addEventListener('pagehide', stop)
  window.addEventListener('beforeunload', stop)
}

/** Record a business event with the visitor's active flags attached. */
export function capture(name: string, props: Record<string, PropValue> = {}): void {
  recording?.recorder.capture(name, props)
}

export function useFlag(key: string): boolean {
  return useTracking((s) => s.flags[key] === true)
}

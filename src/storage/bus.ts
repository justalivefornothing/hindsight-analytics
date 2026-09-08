import type { AnalyticsEvent } from '../recorder/types'
import type { SessionSummary } from '../analytics/session'

/**
 * Cross-document live updates. The demo store runs in an iframe (or another
 * tab) and writes to IndexedDB; the dashboard listens here to refresh without
 * polling. Everything stays on-device.
 */
export type BusMessage =
  | { kind: 'events'; events: AnalyticsEvent[] }
  | { kind: 'session'; session: SessionSummary }
  | { kind: 'flags' }
  | { kind: 'identity'; userId: string }
  /** the demo store started (sessionId) or stopped (null) recording */
  | { kind: 'live'; sessionId: string | null }
  | { kind: 'reset' }

const CHANNEL = 'hindsight-live'

type Listener = (msg: BusMessage) => void

let channel: BroadcastChannel | null = null
const localListeners = new Set<Listener>()

function getChannel(): BroadcastChannel | null {
  if (channel) return channel
  if (typeof BroadcastChannel === 'undefined') return null
  channel = new BroadcastChannel(CHANNEL)
  channel.onmessage = (ev: MessageEvent<BusMessage>) => {
    for (const l of localListeners) l(ev.data)
  }
  return channel
}

export function publish(msg: BusMessage): void {
  const ch = getChannel()
  try {
    ch?.postMessage(msg)
  } catch {
    // Non-cloneable payloads should never happen; ignore defensively.
  }
  // Same-document listeners do not receive their own BroadcastChannel messages.
  for (const l of localListeners) l(msg)
}

export function subscribe(listener: Listener): () => void {
  getChannel()
  localListeners.add(listener)
  return () => {
    localListeners.delete(listener)
  }
}

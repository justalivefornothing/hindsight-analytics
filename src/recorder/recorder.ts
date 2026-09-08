import { Mirror } from './mirror'
import { isMasked, isSensitiveInput, maskText } from './mask'
import { MutationCollector } from './observer'
import { serializeDocument } from './snapshot'
import { describeElement } from './selector'
import { RageClickDetector, throttle } from './autocapture'
import type { AnalyticsEvent, PropValue, RecordedEvent } from './types'

export interface RecorderOptions {
  win: Window
  sessionId: string
  userId: string
  /** Receives batches of replay events (already timestamped relative to start). */
  onEvents: (events: RecordedEvent[]) => void
  /** Receives analytics events as they happen. */
  onAnalytics: (event: AnalyticsEvent) => void
  /** Extra properties merged into every analytics event (e.g. active flags). */
  context?: () => Record<string, PropValue>
  now?: () => number
  mouseMoveIntervalMs?: number
  scrollIntervalMs?: number
  flushIntervalMs?: number
  /** Emit a fresh full snapshot this often so seeking stays cheap. 0 disables. */
  snapshotIntervalMs?: number
}

export interface Recorder {
  readonly sessionId: string
  readonly userId: string
  readonly startedAt: number
  start(): void
  stop(): void
  /** Push buffered replay events to the sink immediately. */
  flush(): void
  /** Record a custom analytics event. */
  capture(name: string, props?: Record<string, PropValue>): AnalyticsEvent
  /** Force a full snapshot (also used by tests). */
  snapshot(): void
  /** Milliseconds elapsed since the session started. */
  elapsed(): number
}

const DOCUMENT_SCROLL_ID = -1

export function createRecorder(options: RecorderOptions): Recorder {
  const { win, sessionId, userId } = options
  const doc = win.document
  const now = options.now ?? (() => Date.now())
  const mouseInterval = options.mouseMoveIntervalMs ?? 50
  const scrollInterval = options.scrollIntervalMs ?? 100
  const flushInterval = options.flushIntervalMs ?? 500
  const snapshotInterval = options.snapshotIntervalMs ?? 45_000

  const mirror = new Mirror()
  let startedAt = 0
  let buffer: RecordedEvent[] = []
  let flushTimer: ReturnType<typeof setInterval> | null = null
  let snapshotTimer: ReturnType<typeof setInterval> | null = null
  let dirtySinceSnapshot = false
  let running = false
  let eventSeq = 0
  const rage = new RageClickDetector()
  const cleanups: Array<() => void> = []

  const elapsed = () => Math.max(0, now() - startedAt)

  const push = (event: RecordedEvent) => {
    buffer.push(event)
  }

  const flush = () => {
    if (!buffer.length) return
    const batch = buffer
    buffer = []
    options.onEvents(batch)
  }

  const collector = new MutationCollector(doc, mirror, (m) => {
    dirtySinceSnapshot = true
    push({ ...m, t: elapsed() })
  })

  const baseProps = (): Record<string, PropValue> => ({
    $current_url: win.location.href,
    $pathname: win.location.pathname,
    $viewport_width: win.innerWidth,
    $viewport_height: win.innerHeight,
    ...(options.context ? options.context() : {}),
  })

  const capture = (name: string, props: Record<string, PropValue> = {}): AnalyticsEvent => {
    const ts = now()
    const event: AnalyticsEvent = {
      id: `${sessionId}:${++eventSeq}`,
      sessionId,
      userId,
      name,
      ts,
      t: Math.max(0, ts - startedAt),
      props: { ...baseProps(), ...props },
    }
    push({ type: 'marker', t: event.t, name })
    options.onAnalytics(event)
    return event
  }

  const snapshot = () => {
    collector.flush()
    const node = serializeDocument(doc, mirror, {
      onShadowRoot: (root) => collector.observe(root),
    })
    push({ type: 'snapshot', t: elapsed(), node, sx: win.scrollX, sy: win.scrollY })
    dirtySinceSnapshot = false
  }

  const pageview = () => {
    push({ type: 'url', t: elapsed(), href: win.location.href })
    capture('$pageview', { $title: doc.title, $referrer: doc.referrer })
  }

  const listen = <K extends keyof DocumentEventMap>(
    target: Document,
    type: K,
    handler: (ev: DocumentEventMap[K]) => void,
    capture = true,
  ) => {
    target.addEventListener(type, handler, { capture, passive: true })
    cleanups.push(() => target.removeEventListener(type, handler, { capture }))
  }
  const listenWin = <K extends keyof WindowEventMap>(
    type: K,
    handler: (ev: WindowEventMap[K]) => void,
  ) => {
    win.addEventListener(type, handler, { passive: true })
    cleanups.push(() => win.removeEventListener(type, handler))
  }

  const mouse = throttle<{ x: number; y: number }>(mouseInterval, now, ({ x, y }) =>
    push({ type: 'move', t: elapsed(), x, y }),
  )
  const scrollThrottles = new Map<number, ReturnType<typeof throttle<{ x: number; y: number }>>>()
  const scrollFor = (id: number) => {
    let th = scrollThrottles.get(id)
    if (!th) {
      th = throttle<{ x: number; y: number }>(scrollInterval, now, ({ x, y }) =>
        push({ type: 'scroll', t: elapsed(), id, x, y }),
      )
      scrollThrottles.set(id, th)
    }
    return th
  }

  const attach = () => {
    listen(doc, 'mousemove', (e) => mouse.call({ x: e.clientX, y: e.clientY }))

    listen(doc, 'click', (e) => {
      const target = e.target as Node | null
      if (!target) return
      const el: Element | null = target.nodeType === 1 ? (target as Element) : target.parentElement
      const id = mirror.getId(target) ?? (el ? mirror.getId(el) : undefined) ?? 0
      const t = elapsed()
      mouse.flush()
      push({ type: 'click', t, x: e.clientX, y: e.clientY, id })
      if (!el) return
      const desc = describeElement(el)
      const elProps: Record<string, PropValue> = {
        $el_tag: desc.tag,
        $el_selector: desc.selector,
        $el_text: desc.text,
        $x: e.clientX,
        $y: e.clientY,
      }
      if (desc.href) elProps.$el_href = desc.href
      if (desc.track) elProps.$el_track = desc.track
      if (desc.name) elProps.$el_name = desc.name
      capture('$click', elProps)
      const burst = rage.push(e.clientX, e.clientY, t)
      if (burst !== null) capture('$rageclick', { ...elProps, $clicks: burst })
    })

    listen(doc, 'scroll', (e) => {
      const target = e.target as Node
      if (target === doc || target === doc.documentElement || target === doc.body) {
        scrollFor(DOCUMENT_SCROLL_ID).call({ x: win.scrollX, y: win.scrollY })
        return
      }
      const id = mirror.getId(target)
      if (id === undefined) return
      const el = target as Element
      scrollFor(id).call({ x: el.scrollLeft, y: el.scrollTop })
    })

    // Last recorded value per field so `change` after `input` does not duplicate.
    const lastValue = new WeakMap<Element, string>()
    const onInput = (e: Event) => {
      const el = e.target as Element | null
      if (!el || el.nodeType !== 1) return
      const id = mirror.getId(el)
      if (id === undefined) return
      const tag = el.localName
      if (tag === 'input') {
        const input = el as HTMLInputElement
        const type = (input.getAttribute('type') || 'text').toLowerCase()
        if (type === 'checkbox' || type === 'radio') {
          const key = `${input.checked}`
          if (lastValue.get(input) === key) return
          lastValue.set(input, key)
          push({ type: 'input', t: elapsed(), id, value: input.value, checked: input.checked })
          return
        }
        const masked = isMasked(input) || isSensitiveInput(input)
        const value = masked ? maskText(input.value) : input.value
        if (lastValue.get(input) === value) return
        lastValue.set(input, value)
        push({ type: 'input', t: elapsed(), id, value })
      } else if (tag === 'textarea' || tag === 'select') {
        const field = el as HTMLTextAreaElement | HTMLSelectElement
        const value = isMasked(field) ? maskText(field.value) : field.value
        if (lastValue.get(field) === value) return
        lastValue.set(field, value)
        push({ type: 'input', t: elapsed(), id, value })
      }
    }
    listen(doc, 'input', onInput)

    listen(doc, 'change', (e) => {
      const el = e.target as Element | null
      if (!el || el.nodeType !== 1) return
      const tag = el.localName
      if (tag !== 'input' && tag !== 'textarea' && tag !== 'select') return
      onInput(e)
      const desc = describeElement(el)
      const input = el as HTMLInputElement
      const type = tag === 'input' ? (input.getAttribute('type') || 'text').toLowerCase() : tag
      capture('$input', {
        $el_tag: desc.tag,
        $el_selector: desc.selector,
        $el_name: desc.name ?? null,
        $input_type: type,
        $masked: isMasked(el) || isSensitiveInput(el),
        $value_length: typeof input.value === 'string' ? input.value.length : 0,
      })
    })

    listen(doc, 'focusin', (e) => {
      const id = mirror.getId(e.target as Node)
      if (id !== undefined) push({ type: 'focus', t: elapsed(), id, on: true })
    })
    listen(doc, 'focusout', (e) => {
      const id = mirror.getId(e.target as Node)
      if (id !== undefined) push({ type: 'focus', t: elapsed(), id, on: false })
    })

    listenWin('resize', () =>
      push({ type: 'resize', t: elapsed(), w: win.innerWidth, h: win.innerHeight }),
    )
    listenWin('popstate', pageview)
    listenWin('hashchange', pageview)
    listenWin('pagehide', flush)

    // SPA navigations: wrap history so route changes become $pageview events.
    const history = win.history
    const origPush = history.pushState
    const origReplace = history.replaceState
    history.pushState = function (this: History, ...args: Parameters<History['pushState']>) {
      const before = win.location.href
      origPush.apply(this, args)
      if (win.location.href !== before) pageview()
    }
    history.replaceState = function (this: History, ...args: Parameters<History['replaceState']>) {
      const before = win.location.href
      origReplace.apply(this, args)
      if (win.location.href !== before) pageview()
    }
    cleanups.push(() => {
      history.pushState = origPush
      history.replaceState = origReplace
    })
  }

  const start = () => {
    if (running) return
    running = true
    startedAt = now()
    push({ type: 'meta', t: 0, href: win.location.href, w: win.innerWidth, h: win.innerHeight })
    snapshot()
    collector.start()
    attach()
    pageview()
    flush()
    flushTimer = setInterval(flush, flushInterval)
    if (snapshotInterval > 0) {
      snapshotTimer = setInterval(() => {
        if (dirtySinceSnapshot) snapshot()
      }, snapshotInterval)
    }
  }

  const stop = () => {
    if (!running) return
    running = false
    for (const c of cleanups.splice(0)) c()
    collector.stop()
    mouse.flush()
    for (const th of scrollThrottles.values()) th.flush()
    if (flushTimer) clearInterval(flushTimer)
    if (snapshotTimer) clearInterval(snapshotTimer)
    flushTimer = snapshotTimer = null
    flush()
  }

  return {
    sessionId,
    userId,
    get startedAt() {
      return startedAt
    },
    start,
    stop,
    flush,
    capture,
    snapshot,
    elapsed,
  }
}

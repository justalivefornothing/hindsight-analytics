import type { RecordedEvent, SnapshotEvent } from '../recorder/types'
import { applyFocus, applyInput, applyMutation, applyPendingScrolls, applyScroll } from './apply'
import { ReplayMirror, rebuildDocument, setFastMode } from './rebuild'
import type { PendingScroll } from './rebuild'
import {
  findInactivity,
  firstIndexAfter,
  lastSnapshotIndex,
  skipInactive,
  snapshotIndices,
  sortEvents,
  totalDuration,
} from './timeline'
import type { InactivitySegment } from './timeline'

export interface CursorState {
  x: number
  y: number
  visible: boolean
}

export interface PlayerFrame {
  t: number
  duration: number
  playing: boolean
  speed: number
  cursor: CursorState
  viewport: { w: number; h: number }
  url: string
}

export interface PlayerOptions {
  /** Provides the document to render into (an iframe's contentDocument). */
  getDocument: () => Document | null
  events: RecordedEvent[]
  speed?: number
  skipInactivity?: boolean
  inactivityThresholdMs?: number
  onFrame?: (frame: PlayerFrame) => void
  onClick?: (x: number, y: number) => void
  onViewport?: (w: number, h: number) => void
  onEnd?: () => void
  /** Injectable timers for tests. */
  now?: () => number
  raf?: (cb: (time: number) => void) => number
  caf?: (handle: number) => void
}

/**
 * Drives a recording on a virtual clock.
 *
 * Seeking backwards (or far forwards) rebuilds from the nearest preceding
 * snapshot, found by binary search, then fast-forwards the mutation stream to
 * the target time with transitions disabled.
 */
export class Player {
  events: RecordedEvent[]

  private durationMs: number
  private inactivitySegments: InactivitySegment[]
  private snapshots: number[]
  private mirror = new ReplayMirror()
  private pointer = 0
  private virtual = 0
  private lastReal = 0
  private rafHandle = 0
  private playing = false
  private speed: number
  private skip: boolean
  private cursor: CursorState = { x: 0, y: 0, visible: false }
  private viewport = { w: 1280, h: 800 }
  private url = ''
  private lastMoveIdx = -1
  private pendingScrolls: PendingScroll[] = []
  private built = false
  private destroyed = false
  private opts: PlayerOptions
  private now: () => number
  private raf: (cb: (time: number) => void) => number
  private caf: (handle: number) => void

  constructor(opts: PlayerOptions) {
    this.opts = opts
    this.events = sortEvents(opts.events)
    this.durationMs = totalDuration(this.events)
    this.snapshots = snapshotIndices(this.events)
    this.inactivitySegments = findInactivity(this.events, opts.inactivityThresholdMs)
    this.speed = opts.speed ?? 1
    this.skip = opts.skipInactivity ?? true
    this.now = opts.now ?? (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()))
    this.raf =
      opts.raf ??
      ((cb) =>
        typeof requestAnimationFrame === 'function'
          ? requestAnimationFrame(cb)
          : (setTimeout(() => cb(this.now()), 16) as unknown as number))
    this.caf =
      opts.caf ??
      ((h) => (typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame(h) : clearTimeout(h)))

    const meta = this.events.find((e) => e.type === 'meta')
    if (meta && meta.type === 'meta') {
      this.viewport = { w: meta.w, h: meta.h }
      this.url = meta.href
    }
  }

  get time(): number {
    return this.virtual
  }

  get duration(): number {
    return this.durationMs
  }

  get inactivity(): InactivitySegment[] {
    return this.inactivitySegments
  }

  /**
   * Extend a recording that is still being written (live sessions). New
   * events must not be older than the current tail; anything earlier is
   * merged by a full re-sort and the pointer is recomputed.
   */
  append(events: RecordedEvent[]): void {
    if (!events.length) return
    const tail = this.events.length ? this.events[this.events.length - 1].t : -Infinity
    let ordered = true
    for (let i = 0; i < events.length; i++) {
      const t = events[i].t
      if (t < tail || (i > 0 && t < events[i - 1].t)) {
        ordered = false
        break
      }
    }
    if (ordered) {
      for (const e of events) this.events.push(e)
    } else {
      // Rare: chunks arrived out of order. Merge and re-derive the pointer.
      const applied = this.pointer
      this.events = sortEvents([...this.events, ...events])
      this.pointer = Math.min(applied, firstIndexAfter(this.events, this.virtual))
    }
    this.durationMs = totalDuration(this.events)
    this.snapshots = snapshotIndices(this.events)
    this.inactivitySegments = findInactivity(this.events, this.opts.inactivityThresholdMs)
    this.emitFrame()
  }

  get isPlaying(): boolean {
    return this.playing
  }

  get currentSpeed(): number {
    return this.speed
  }

  get skipsInactivity(): boolean {
    return this.skip
  }

  get viewportSize(): { w: number; h: number } {
    return this.viewport
  }

  /** Reconstruct the document at time t. */
  seek(t: number): void {
    const target = Math.max(0, Math.min(this.duration, t))
    const backwards = target < this.virtual
    if (!this.built || backwards) {
      this.rebuildAt(target)
    } else {
      this.fastForward(target)
    }
    this.virtual = target
    this.emitFrame()
  }

  play(): void {
    if (this.playing || this.destroyed) return
    if (!this.built) this.rebuildAt(this.virtual)
    if (this.virtual >= this.duration) this.seek(0)
    this.playing = true
    this.lastReal = this.now()
    this.rafHandle = this.raf(this.tick)
    this.emitFrame()
  }

  pause(): void {
    if (!this.playing) return
    this.playing = false
    this.caf(this.rafHandle)
    this.emitFrame()
  }

  toggle(): void {
    if (this.playing) this.pause()
    else this.play()
  }

  setSpeed(speed: number): void {
    this.speed = speed
    this.emitFrame()
  }

  setSkipInactivity(on: boolean): void {
    this.skip = on
    this.emitFrame()
  }

  destroy(): void {
    this.pause()
    this.destroyed = true
  }

  /** Called by the host when the iframe document becomes available again. */
  rebuild(): void {
    this.rebuildAt(this.virtual)
    this.emitFrame()
  }

  private tick = (time: number): void => {
    if (!this.playing) return
    const real = this.opts.now ? this.now() : time
    const dt = Math.max(0, real - this.lastReal)
    this.lastReal = real
    let next = this.virtual + dt * this.speed
    if (this.skip) {
      const skipped = skipInactive(next, this.inactivity)
      if (skipped !== next) {
        next = skipped
        this.fastForward(next)
      }
    }
    if (next >= this.duration) {
      this.applyUntil(this.duration, false)
      this.virtual = this.duration
      this.playing = false
      this.emitFrame()
      this.opts.onEnd?.()
      return
    }
    this.applyUntil(next, false)
    this.virtual = next
    this.interpolateCursor(next)
    this.emitFrame()
    this.rafHandle = this.raf(this.tick)
  }

  private rebuildAt(t: number): void {
    const doc = this.opts.getDocument()
    if (!doc) return
    const idx = lastSnapshotIndex(this.events, this.snapshots, t)
    if (idx < 0) return
    const snap = this.events[idx] as SnapshotEvent
    setFastMode(doc, false)
    const result = rebuildDocument(snap.node, doc, this.mirror, { sanitize: true })
    this.pendingScrolls = result.scrolls
    this.built = true
    this.pointer = idx + 1
    this.cursor = { ...this.cursor, visible: false }
    this.lastMoveIdx = -1
    const win = doc.defaultView
    if (win) {
      try {
        win.scrollTo(snap.sx, snap.sy)
      } catch {
        /* ignore */
      }
    }
    applyPendingScrolls(this.pendingScrolls)
    // Replay everything between the snapshot and the target quickly.
    this.fastForward(t)
  }

  private fastForward(t: number): void {
    const doc = this.opts.getDocument()
    if (!doc) return
    setFastMode(doc, true)
    this.applyUntil(t, true)
    // Scroll offsets need layout; apply again now that everything is attached.
    applyPendingScrolls(this.pendingScrolls)
    this.pendingScrolls = []
    const win = doc.defaultView
    const clear = () => setFastMode(doc, false)
    if (win && typeof win.requestAnimationFrame === 'function') win.requestAnimationFrame(clear)
    else clear()
  }

  /** Apply every event with time <= t starting at the pointer. */
  private applyUntil(t: number, fast: boolean): void {
    const doc = this.opts.getDocument()
    if (!doc) return
    const end = firstIndexAfter(this.events, t)
    let lastMove: RecordedEvent | null = null
    for (let i = this.pointer; i < end; i++) {
      const e = this.events[i]
      switch (e.type) {
        case 'snapshot': {
          const result = rebuildDocument(e.node, doc, this.mirror, { sanitize: true })
          this.pendingScrolls.push(...result.scrolls)
          break
        }
        case 'mutation': {
          const scrolls = applyMutation(e, doc, this.mirror, { sanitize: true })
          if (scrolls.length) this.pendingScrolls.push(...scrolls)
          break
        }
        case 'move':
          lastMove = e
          this.lastMoveIdx = i
          break
        case 'click':
          this.cursor = { x: e.x, y: e.y, visible: true }
          if (!fast) this.opts.onClick?.(e.x, e.y)
          break
        case 'scroll':
          applyScroll(e, doc, this.mirror)
          break
        case 'input':
          applyInput(e, this.mirror)
          break
        case 'focus':
          applyFocus(e, this.mirror)
          break
        case 'resize':
          this.viewport = { w: e.w, h: e.h }
          this.opts.onViewport?.(e.w, e.h)
          break
        case 'url':
          this.url = e.href
          break
        case 'meta':
          this.viewport = { w: e.w, h: e.h }
          this.url = e.href
          this.opts.onViewport?.(e.w, e.h)
          break
        case 'marker':
          break
      }
    }
    if (lastMove && lastMove.type === 'move') {
      this.cursor = { x: lastMove.x, y: lastMove.y, visible: true }
    }
    this.pointer = Math.max(this.pointer, end)
    if (!fast && this.pendingScrolls.length) {
      applyPendingScrolls(this.pendingScrolls)
      this.pendingScrolls = []
    }
  }

  /** Smooth the cursor between the previous and next recorded positions. */
  private interpolateCursor(t: number): void {
    if (this.lastMoveIdx < 0) return
    const prev = this.events[this.lastMoveIdx]
    if (prev.type !== 'move') return
    let nextIdx = this.lastMoveIdx + 1
    while (nextIdx < this.events.length && this.events[nextIdx].type !== 'move') nextIdx++
    const next = this.events[nextIdx]
    if (!next || next.type !== 'move' || next.t <= prev.t || next.t - prev.t > 400) return
    const k = Math.max(0, Math.min(1, (t - prev.t) / (next.t - prev.t)))
    this.cursor = {
      x: prev.x + (next.x - prev.x) * k,
      y: prev.y + (next.y - prev.y) * k,
      visible: true,
    }
  }

  private emitFrame(): void {
    this.opts.onFrame?.({
      t: this.virtual,
      duration: this.duration,
      playing: this.playing,
      speed: this.speed,
      cursor: this.cursor,
      viewport: this.viewport,
      url: this.url,
    })
  }
}

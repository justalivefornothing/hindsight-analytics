/**
 * Rage-click detection: three or more clicks landing within a small radius in
 * quick succession. Pure logic so it can be unit-tested without a DOM.
 */
export interface RageClickOptions {
  /** clicks needed to trigger (default 3) */
  threshold?: number
  /** max time between first and last click in ms (default 1000) */
  windowMs?: number
  /** max distance from the first click in px (default 30) */
  radiusPx?: number
}

interface ClickPoint {
  x: number
  y: number
  t: number
}

export class RageClickDetector {
  private threshold: number
  private windowMs: number
  private radiusPx: number
  private burst: ClickPoint[] = []
  private fired = false

  constructor(opts: RageClickOptions = {}) {
    this.threshold = opts.threshold ?? 3
    this.windowMs = opts.windowMs ?? 1000
    this.radiusPx = opts.radiusPx ?? 30
  }

  /**
   * Feed a click; returns the number of clicks in the burst when a rage click
   * is detected (only once per burst), otherwise null.
   */
  push(x: number, y: number, t: number): number | null {
    const first = this.burst[0]
    if (
      !first ||
      t - first.t > this.windowMs ||
      Math.hypot(x - first.x, y - first.y) > this.radiusPx
    ) {
      this.burst = [{ x, y, t }]
      this.fired = false
      return null
    }
    this.burst.push({ x, y, t })
    if (!this.fired && this.burst.length >= this.threshold) {
      this.fired = true
      return this.burst.length
    }
    return null
  }

  reset(): void {
    this.burst = []
    this.fired = false
  }
}

/** Simple trailing throttle that always delivers the latest value. */
export function throttle<T>(intervalMs: number, now: () => number, fn: (value: T) => void) {
  let last = -Infinity
  let pending: T | undefined
  let timer: ReturnType<typeof setTimeout> | null = null
  const fire = () => {
    timer = null
    if (pending !== undefined) {
      last = now()
      const v = pending
      pending = undefined
      fn(v)
    }
  }
  return {
    call(value: T) {
      const elapsed = now() - last
      if (elapsed >= intervalMs) {
        last = now()
        fn(value)
        return
      }
      pending = value
      if (timer === null) timer = setTimeout(fire, intervalMs - elapsed)
    },
    flush() {
      if (timer !== null) {
        clearTimeout(timer)
        fire()
      }
    },
    cancel() {
      if (timer !== null) clearTimeout(timer)
      timer = null
      pending = undefined
    },
  }
}

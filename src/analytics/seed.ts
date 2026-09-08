import type { AnalyticsEvent, PropValue } from '../recorder/types'
import { PRODUCTS } from '../demo/catalog'
import { evaluateFlags } from './flags'
import type { FeatureFlag } from './flags'
import { createRng } from './rng'
import { emptySummary } from './session'
import type { SessionSummary } from './session'

export interface SeedOptions {
  users?: number
  seed?: number
  /** origin used for $current_url, e.g. "http://localhost:5173" */
  origin?: string
  /** anchor for "now"; sessions are spread over the 14 days before it */
  now?: number
  flags?: FeatureFlag[]
}

export interface SeedResult {
  sessions: SessionSummary[]
  events: AnalyticsEvent[]
  users: string[]
}

export const DEFAULT_FLAGS: FeatureFlag[] = [
  {
    key: 'new-checkout',
    description: 'Single-page express checkout instead of the 3-step legacy flow.',
    enabled: true,
    rollout: 50,
    createdAt: 0,
  },
  {
    key: 'free-shipping-banner',
    description: 'Show the free shipping promo bar on the storefront.',
    enabled: true,
    rollout: 100,
    createdAt: 0,
  },
]

const DAY = 86_400_000

/**
 * Generate a realistic population of shoppers moving through the storefront
 * funnel. Deterministic for a given seed so the dashboard always tells the
 * same story after "Seed sample data".
 */
export function generateSeed(options: SeedOptions = {}): SeedResult {
  const userCount = options.users ?? 200
  const rng = createRng(options.seed ?? 20260907)
  const origin = options.origin ?? 'http://localhost:5173'
  const now = options.now ?? Date.now()
  const flags = options.flags ?? DEFAULT_FLAGS
  const base = `${origin}/demo/store`

  const sessions: SessionSummary[] = []
  const events: AnalyticsEvent[] = []
  const users: string[] = []

  for (let u = 0; u < userCount; u++) {
    const userId = `usr_${rng.hex(6)}`
    users.push(userId)
    const activeFlags = evaluateFlags(flags, userId)
    const sessionCount = rng.chance(0.55) ? 1 : rng.chance(0.7) ? 2 : 3
    for (let s = 0; s < sessionCount; s++) {
      const startedAt = now - rng.range(0.02, 14) * DAY
      const session = simulateSession(rng, userId, startedAt, base, activeFlags)
      sessions.push(session.summary)
      events.push(...session.events)
    }
  }

  sessions.sort((a, b) => a.startedAt - b.startedAt)
  events.sort((a, b) => a.ts - b.ts)
  return { sessions, events, users }
}

type Rng = ReturnType<typeof createRng>

const VIEWPORTS = [
  { w: 1440, h: 900 },
  { w: 1536, h: 864 },
  { w: 1280, h: 720 },
  { w: 1920, h: 1080 },
  { w: 390, h: 844 },
  { w: 414, h: 896 },
]

function simulateSession(
  rng: Rng,
  userId: string,
  startedAt: number,
  base: string,
  flags: Record<string, boolean>,
) {
  const sessionId = `ses_${rng.hex(10)}`
  const viewport = rng.pick(VIEWPORTS)
  const mobile = viewport.w < 600
  const summary = emptySummary(sessionId, userId, startedAt)
  summary.viewport = viewport
  summary.hasRecording = false
  summary.synthetic = true
  summary.flags = flags

  const out: AnalyticsEvent[] = []
  let seq = 0
  let t = 0
  let url = `${base}`

  const emit = (name: string, props: Record<string, PropValue> = {}) => {
    const ev: AnalyticsEvent = {
      id: `${sessionId}:${++seq}`,
      sessionId,
      userId,
      name,
      ts: Math.round(startedAt + t),
      t: Math.round(t),
      props: {
        $current_url: url,
        $pathname: url.slice(url.indexOf('/demo')),
        $viewport_width: viewport.w,
        $viewport_height: viewport.h,
        $device: mobile ? 'mobile' : 'desktop',
        $flags: flags,
        ...props,
      },
    }
    out.push(ev)
    return ev
  }

  const click = (selector: string, text: string, cx: number, cy: number) => {
    const x = clamp(rng.gauss(cx, 0.06), 0.02, 0.98)
    const y = clamp(rng.gauss(cy, 0.05), 0.02, 0.98)
    summary.clickPoints.push({ x, y })
    emit('$click', {
      $el_tag: selector.split(/[ .#[:>]/)[0] || 'button',
      $el_selector: selector,
      $el_text: text,
      $x: Math.round(x * viewport.w),
      $y: Math.round(y * viewport.h),
    })
  }

  const pageview = (path: string) => {
    url = `${base}${path}`
    if (!summary.urls.includes(url)) summary.urls.push(url)
    emit('$pageview', { $title: 'Northlight Supply', $referrer: '' })
  }

  const wait = (minMs: number, maxMs: number) => {
    t += rng.range(minMs, maxMs)
  }

  // Landing
  pageview('')
  wait(1500, 6000)
  if (rng.chance(0.35)) click('header > nav > a:nth-of-type(2)', 'Desk', 0.4, 0.05)

  // Browse -> product
  const browsed = rng.chance(0.86)
  if (browsed) {
    const product = rng.pick(PRODUCTS)
    wait(2000, 14000)
    click(`main > section > div > article:nth-of-type(${rng.int(1, 8)}) > a`, product.name, 0.5, 0.55)
    pageview(`/p/${product.id}`)
    emit('product_viewed', { product_id: product.id, product_name: product.name, price: product.price })
    wait(3000, 25000)

    // Add to cart
    if (rng.chance(0.62)) {
      const qty = rng.chance(0.8) ? 1 : rng.int(2, 3)
      click('main > div > section:nth-of-type(2) > button', 'Add to cart', 0.7, 0.62)
      emit('add_to_cart', {
        product_id: product.id,
        product_name: product.name,
        price: product.price,
        quantity: qty,
      })
      wait(1000, 8000)
      click('header > a[data-track="cart"]', 'Cart', 0.93, 0.05)
      pageview('/cart')
      wait(2000, 12000)

      // Checkout
      if (rng.chance(0.7)) {
        click('main > aside > button', 'Checkout', 0.8, 0.6)
        pageview('/checkout')
        emit('checkout_started', { cart_value: product.price * qty, items: qty })
        wait(8000, 40000)
        const newCheckout = flags['new-checkout'] === true
        const purchaseRate = newCheckout ? 0.74 : 0.56
        if (rng.chance(purchaseRate)) {
          click('main > form > button[type="submit"]', newCheckout ? 'Pay now' : 'Place order', 0.6, 0.85)
          // Deliberately slow payment step.
          wait(2500, 4500)
          pageview('/done')
          emit('purchase_completed', {
            order_value: product.price * qty,
            items: qty,
            product_id: product.id,
            checkout_variant: newCheckout ? 'express' : 'legacy',
          })
        } else if (rng.chance(0.45)) {
          // Frustrated shopper hammering the slow "Pay" button.
          const cx = 0.6
          const cy = 0.85
          for (let i = 0; i < 3; i++) {
            click('main > form > button[type="submit"]', newCheckout ? 'Pay now' : 'Place order', cx, cy)
            t += rng.range(150, 320)
          }
          emit('$rageclick', {
            $el_selector: 'main > form > button[type="submit"]',
            $el_text: newCheckout ? 'Pay now' : 'Place order',
            $clicks: 3,
          })
        }
      }
    }
  } else if (rng.chance(0.5)) {
    click('header > nav > a:nth-of-type(3)', 'Audio', 0.47, 0.05)
  }

  wait(1500, 9000)
  summary.durationMs = Math.round(t)
  summary.endedAt = Math.round(startedAt + t)
  summary.eventCount = out.length
  summary.pageCount = summary.urls.length
  return { summary, events: out }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}

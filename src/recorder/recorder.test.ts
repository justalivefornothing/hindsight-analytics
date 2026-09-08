// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { createRecorder } from './recorder'
import type { AnalyticsEvent, RecordedEvent } from './types'
import { MASK_CHAR } from './mask'
import { ReplayMirror, rebuildDocument } from '../replayer/rebuild'
import { applyInput, applyMutation, applyScroll } from '../replayer/apply'

const PAGE = `<!DOCTYPE html><html><head><title>Store</title></head><body><header><a id="cart-link" href="/demo/store/cart" data-track="cart">Cart</a></header><main><section><article><button type="button" class="add">Add to cart</button></article></section><form><input id="email" type="text"><input id="card" type="text" data-mask=""><input id="pw" type="password"></form><div id="scroller" style="overflow:auto;height:20px"><p>a</p><p>b</p></div></main></body></html>`

function setup() {
  document.open()
  document.write(PAGE)
  document.close()
  let clock = 1_000_000
  const now = () => clock
  const advance = (ms: number) => {
    clock += ms
  }
  const replay: RecordedEvent[] = []
  const analytics: AnalyticsEvent[] = []
  const recorder = createRecorder({
    win: window,
    sessionId: 'ses_test',
    userId: 'usr_test',
    now,
    onEvents: (batch) => replay.push(...batch),
    onAnalytics: (e) => analytics.push(e),
    context: () => ({ $flags: { 'new-checkout': true } }),
    mouseMoveIntervalMs: 0,
    scrollIntervalMs: 0,
    snapshotIntervalMs: 0,
  })
  return { recorder, replay, analytics, advance }
}

function click(el: Element, x = 10, y = 10) {
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: x, clientY: y }))
}

describe('recorder', () => {
  it('emits meta, snapshot and a $pageview on start', () => {
    const { recorder, replay, analytics } = setup()
    recorder.start()
    expect(replay[0].type).toBe('meta')
    expect(replay[1].type).toBe('snapshot')
    expect(analytics[0].name).toBe('$pageview')
    expect(analytics[0].props.$pathname).toBe(window.location.pathname)
    expect(analytics[0].props.$flags).toEqual({ 'new-checkout': true })
    expect(analytics[0].sessionId).toBe('ses_test')
    expect(analytics[0].userId).toBe('usr_test')
    recorder.stop()
  })

  it('autocaptures $click with a selector and text, and $rageclick on three quick clicks', () => {
    const { recorder, replay, analytics, advance } = setup()
    recorder.start()
    const button = document.querySelector('button.add')!
    advance(500)
    click(button, 40, 50)
    const clickEvent = analytics.find((e) => e.name === '$click')!
    expect(clickEvent).toBeDefined()
    expect(clickEvent.props.$el_tag).toBe('button')
    expect(clickEvent.props.$el_text).toBe('Add to cart')
    expect(clickEvent.props.$el_selector).toBe('body > main > section > article > button')
    expect(clickEvent.t).toBe(500)

    advance(200)
    click(button, 42, 52)
    advance(200)
    click(button, 41, 49)
    const rage = analytics.filter((e) => e.name === '$rageclick')
    expect(rage).toHaveLength(1)
    expect(rage[0].props.$clicks).toBe(3)

    // clicks on the link resolve to the interactive ancestor and carry href/track
    click(document.getElementById('cart-link')!)
    const linkClick = analytics.filter((e) => e.name === '$click').at(-1)!
    expect(linkClick.props.$el_href).toBe('/demo/store/cart')
    expect(linkClick.props.$el_track).toBe('cart')

    recorder.stop()
    const replayClicks = replay.filter((e) => e.type === 'click')
    expect(replayClicks).toHaveLength(4)
    expect(replayClicks[0]).toMatchObject({ x: 40, y: 50, t: 500 })
    // markers mirror analytics events onto the replay timeline
    expect(replay.filter((e) => e.type === 'marker').map((m) => m.type === 'marker' && m.name)).toContain('$rageclick')
  })

  it('records input values (masking [data-mask] and passwords) and restores them on replay', () => {
    const { recorder, replay, analytics } = setup()
    recorder.start()
    const email = document.getElementById('email') as HTMLInputElement
    const card = document.getElementById('card') as HTMLInputElement
    const pw = document.getElementById('pw') as HTMLInputElement
    email.value = 'jafn@example.com'
    email.dispatchEvent(new Event('input', { bubbles: true }))
    card.value = '4242 4242'
    card.dispatchEvent(new Event('input', { bubbles: true }))
    pw.value = 'hunter2'
    pw.dispatchEvent(new Event('input', { bubbles: true }))
    email.dispatchEvent(new Event('change', { bubbles: true }))
    recorder.stop()

    const inputs = replay.filter((e) => e.type === 'input')
    expect(inputs).toHaveLength(3)
    expect(inputs[0]).toMatchObject({ value: 'jafn@example.com' })
    expect(inputs[1]).toMatchObject({ value: `${MASK_CHAR.repeat(4)} ${MASK_CHAR.repeat(4)}` })
    expect(inputs[2]).toMatchObject({ value: MASK_CHAR.repeat(7) })

    const inputAnalytics = analytics.find((e) => e.name === '$input')!
    expect(inputAnalytics.props.$input_type).toBe('text')
    expect(inputAnalytics.props.$value_length).toBe(16)
    expect(JSON.stringify(inputAnalytics)).not.toContain('jafn@example.com')

    // Rebuild and replay the input stream.
    const snapshot = replay.find((e) => e.type === 'snapshot')!
    const target = document.implementation.createHTMLDocument('')
    const mirror = new ReplayMirror()
    if (snapshot.type === 'snapshot') rebuildDocument(snapshot.node, target, mirror)
    for (const e of replay) {
      if (e.type === 'mutation') applyMutation(e, target, mirror)
      if (e.type === 'input') applyInput(e, mirror)
    }
    expect((target.getElementById('email') as HTMLInputElement).value).toBe('jafn@example.com')
    expect((target.getElementById('card') as HTMLInputElement).value).toBe(`${MASK_CHAR.repeat(4)} ${MASK_CHAR.repeat(4)}`)
  })

  it('captures element scroll offsets and restores them', () => {
    const { recorder, replay } = setup()
    recorder.start()
    const scroller = document.getElementById('scroller')!
    scroller.scrollTop = 33
    scroller.dispatchEvent(new Event('scroll'))
    recorder.stop()
    const scroll = replay.find((e) => e.type === 'scroll')
    expect(scroll).toBeDefined()
    expect(scroll).toMatchObject({ x: 0, y: 33 })

    const snapshot = replay.find((e) => e.type === 'snapshot')!
    const target = document.implementation.createHTMLDocument('')
    const mirror = new ReplayMirror()
    if (snapshot.type === 'snapshot') rebuildDocument(snapshot.node, target, mirror)
    if (scroll && scroll.type === 'scroll') applyScroll(scroll, target, mirror)
    expect(target.getElementById('scroller')!.scrollTop).toBe(33)
  })

  it('turns SPA history navigations into $pageview events and url markers', () => {
    const { recorder, replay, analytics } = setup()
    recorder.start()
    window.history.pushState({}, '', '/demo/store/cart')
    window.history.replaceState({}, '', '/demo/store/checkout')
    recorder.stop()
    const views = analytics.filter((e) => e.name === '$pageview').map((e) => e.props.$pathname)
    expect(views).toEqual(['/', '/demo/store/cart', '/demo/store/checkout'])
    expect(replay.filter((e) => e.type === 'url')).toHaveLength(3)
    window.history.replaceState({}, '', '/')
  })

  it('custom capture() merges context and records a marker', () => {
    const { recorder, replay, analytics, advance } = setup()
    recorder.start()
    advance(2500)
    const ev = recorder.capture('purchase_completed', { order_value: 89 })
    expect(ev.t).toBe(2500)
    expect(ev.props.order_value).toBe(89)
    expect(ev.props.$flags).toEqual({ 'new-checkout': true })
    expect(analytics.at(-1)).toBe(ev)
    recorder.stop()
    const marker = replay.find((e) => e.type === 'marker' && e.name === 'purchase_completed')
    expect(marker).toMatchObject({ t: 2500 })
  })
})

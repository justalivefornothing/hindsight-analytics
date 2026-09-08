// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { buildSelector, describeElement, interactiveAncestor } from './selector'
import { RageClickDetector, throttle } from './autocapture'

describe('selector generation', () => {
  it('anchors on ids and data-testid, falls back to nth-of-type paths', () => {
    document.body.innerHTML = `
      <div id="cart"><ul><li><button>One</button></li><li><button>Two</button></li></ul></div>
      <section><div data-testid="hero"><a href="#go"><span>Go <b>now</b></span></a></div></section>
      <section><p>x</p><p>y</p></section>`
    const two = document.querySelectorAll('button')[1]
    expect(buildSelector(two)).toBe('#cart > ul > li:nth-of-type(2) > button')
    const b = document.querySelector('b')!
    expect(buildSelector(b)).toBe('div[data-testid="hero"] > a > span > b')
    const y = document.querySelectorAll('p')[1]
    expect(buildSelector(y)).toBe('body > section:nth-of-type(2) > p:nth-of-type(2)')
  })

  it('describes the interactive ancestor of a click target', () => {
    document.body.innerHTML = `<nav><a href="/x" aria-label="Go home"><span id="inner">Home</span></a></nav>`
    const inner = document.getElementById('inner')!
    expect(interactiveAncestor(inner).tagName).toBe('A')
    const d = describeElement(inner)
    expect(d).toMatchObject({ tag: 'a', text: 'Home', href: '/x', name: 'Go home' })
    expect(d.selector).toBe('body > nav > a')
  })
})

describe('rage click detector', () => {
  it('fires once when three clicks land close together quickly', () => {
    const d = new RageClickDetector()
    expect(d.push(10, 10, 0)).toBeNull()
    expect(d.push(12, 11, 300)).toBeNull()
    expect(d.push(9, 13, 600)).toBe(3)
    expect(d.push(9, 13, 700)).toBeNull() // same burst, already fired
  })

  it('resets when clicks are far apart in space or time', () => {
    const d = new RageClickDetector()
    d.push(0, 0, 0)
    d.push(0, 0, 200)
    expect(d.push(200, 200, 300)).toBeNull() // far away -> new burst
    d.push(200, 200, 400)
    expect(d.push(200, 200, 500)).toBe(3)
    const slow = new RageClickDetector()
    slow.push(0, 0, 0)
    slow.push(0, 0, 600)
    expect(slow.push(0, 0, 1300)).toBeNull() // > 1s since first
  })
})

describe('throttle', () => {
  it('delivers immediately, then trails with the latest value', async () => {
    let now = 0
    const out: number[] = []
    const th = throttle<number>(50, () => now, (v) => out.push(v))
    th.call(1)
    th.call(2)
    th.call(3)
    expect(out).toEqual([1])
    now = 60
    await new Promise((r) => setTimeout(r, 60))
    expect(out).toEqual([1, 3])
    th.cancel()
  })
})

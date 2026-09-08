// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { Mirror } from './mirror'
import { serializeDocument } from './snapshot'
import { MASK_CHAR } from './mask'
import { ReplayMirror, rebuildDocument, HREF_ATTR, STRIPPED_ATTR } from '../replayer/rebuild'
import { applyPendingScrolls } from '../replayer/apply'
import { NodeKind } from './types'
import type { SElement } from './types'

const FIXTURE = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Fixture</title><style>
.card { color: rgb(10, 20, 30); padding: 4px }
</style></head><body class="theme-light" data-page="home"><!-- header --><header id="top"><nav><a href="https://example.com/">Home</a><a href="#cart" class="btn primary">Cart (2)</a></nav></header><main><section class="grid" style="display: grid; gap: 8px;"><article class="card" data-id="1"><h2>Aurora Lamp</h2><p>Warm &amp; dimmable</p><button type="button" class="add">Add to cart</button></article><article class="card" data-id="2"><h2>Notebook</h2><p>Dot grid</p><button type="button" class="add" disabled="">Sold out</button></article></section><svg viewBox="0 0 24 24" width="24" height="24"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor"></circle><path d="M4 12h16"></path></svg><form><label for="email">Email</label><input id="email" name="email" type="text" value="initial"><input id="agree" type="checkbox" checked=""><textarea id="notes" rows="2">default text</textarea><select id="size"><option value="s">S</option><option value="m">M</option><option value="l">L</option></select><div data-mask=""><p class="secret">Card 4242 4242 4242 4242</p><input id="cvc" type="text" value="123"></div></form><div id="scroller" style="height: 40px; overflow: auto;"><p>one</p><p>two</p><p>three</p></div></main></body></html>`

function loadFixture(html: string): Document {
  document.open()
  document.write(html)
  document.close()
  return document
}

function freshDoc(): Document {
  return document.implementation.createHTMLDocument('')
}

describe('snapshot serialize -> rebuild round trip', () => {
  it('reproduces the outerHTML of a fixture page, masking only [data-mask] content', () => {
    const doc = loadFixture(FIXTURE)
    const email = doc.getElementById('email') as HTMLInputElement
    email.value = 'typed@example.com' // live value differs from the attribute
    const size = doc.getElementById('size') as HTMLSelectElement
    size.value = 'l'
    const notes = doc.getElementById('notes') as HTMLTextAreaElement
    notes.value = 'edited notes'
    const scroller = doc.getElementById('scroller') as HTMLElement
    scroller.scrollTop = 24
    scroller.scrollLeft = 3

    const mirror = new Mirror()
    const snapshot = serializeDocument(doc, mirror)
    // Must be plain JSON.
    const json = JSON.stringify(snapshot)
    expect(JSON.parse(json)).toEqual(snapshot)

    const target = freshDoc()
    const replayMirror = new ReplayMirror()
    const { scrolls } = rebuildDocument(snapshot, target, replayMirror, { sanitize: false })
    applyPendingScrolls(scrolls)

    // Masked region: text replaced by bullets of equal length, digits gone.
    const secret = target.querySelector('.secret')!
    expect(secret.textContent).not.toContain('4242')
    expect(secret.textContent!.replace(/\s/g, '')).toMatch(new RegExp(`^${MASK_CHAR}+$`))
    expect(secret.textContent!.length).toBe('Card 4242 4242 4242 4242'.length)
    const cvc = target.getElementById('cvc') as HTMLInputElement
    expect(cvc.value).toBe(MASK_CHAR.repeat(3))

    // Compare markup with the masked text normalised on both sides.
    const originalSecret = doc.querySelector('.secret')!
    originalSecret.textContent = 'MASKED'
    secret.textContent = 'MASKED'
    expect(target.documentElement.outerHTML).toBe(doc.documentElement.outerHTML)
    expect(target.doctype?.name).toBe('html')

    // Live form state travels as properties, not markup.
    expect((target.getElementById('email') as HTMLInputElement).value).toBe('typed@example.com')
    expect((target.getElementById('agree') as HTMLInputElement).checked).toBe(true)
    expect((target.getElementById('size') as HTMLSelectElement).value).toBe('l')
    expect((target.getElementById('notes') as HTMLTextAreaElement).value).toBe('edited notes')

    // Scroll offsets captured and restored.
    const rebuiltScroller = target.getElementById('scroller') as HTMLElement
    expect(rebuiltScroller.scrollTop).toBe(24)
    expect(rebuiltScroller.scrollLeft).toBe(3)

    // Every node has a stable id in both mirrors.
    expect(replayMirror.size).toBeGreaterThan(30)
    const liveButton = doc.querySelector('button.add')!
    const liveId = mirror.getId(liveButton)!
    expect((replayMirror.get(liveId) as Element).outerHTML).toBe(liveButton.outerHTML)
  })

  it('captures viewport-independent metadata: namespaces, attributes and inline styles', () => {
    const doc = loadFixture(FIXTURE)
    const snapshot = serializeDocument(doc, new Mirror())
    const html = snapshot.ch.find((n) => n.t === NodeKind.Element) as SElement
    expect(html.tag).toBe('html')
    expect(html.attrs.lang).toBe('en')
    const findTag = (node: SElement, tag: string): SElement | undefined => {
      if (node.tag === tag) return node
      for (const c of node.ch) {
        if (c.t === NodeKind.Element) {
          const hit = findTag(c, tag)
          if (hit) return hit
        }
      }
      return undefined
    }
    const svg = findTag(html, 'svg')!
    expect(svg.ns).toBe('http://www.w3.org/2000/svg')
    expect(svg.attrs.viewBox).toBe('0 0 24 24')
    const section = findTag(html, 'section')!
    expect(section.attrs.style).toContain('display: grid')
    const style = findTag(html, 'style')!
    expect(style.css).toContain('.card')
    expect(style.ch).toHaveLength(0)
  })

  it('sanitized rebuild strips scripts, inline handlers and neutralizes links', () => {
    const doc = loadFixture(
      `<!DOCTYPE html><html><head><script src="https://evil.example/x.js"></script><script>window.pwned = 1</script></head><body><a id="link" href="https://example.com/away" target="_blank" onclick="alert(1)">Go</a><button onmouseover="steal()">Hover</button><form action="/submit"><input name="q"></form><iframe src="https://example.com/frame"></iframe><span>after</span></body></html>`,
    )
    const snapshot = serializeDocument(doc, new Mirror())
    const target = freshDoc()
    rebuildDocument(snapshot, target, new ReplayMirror())

    expect(target.querySelectorAll('script')).toHaveLength(0)
    expect(target.querySelectorAll(`[${STRIPPED_ATTR}="script"]`)).toHaveLength(2)
    const link = target.getElementById('link')!
    expect(link.hasAttribute('href')).toBe(false)
    expect(link.getAttribute(HREF_ATTR)).toBe('https://example.com/away')
    expect(link.hasAttribute('onclick')).toBe(false)
    expect(link.hasAttribute('target')).toBe(false)
    expect(target.querySelector('button')!.hasAttribute('onmouseover')).toBe(false)
    expect(target.querySelector('form')!.hasAttribute('action')).toBe(false)
    expect(target.querySelectorAll('iframe')).toHaveLength(0)
    expect(target.querySelector(`[${STRIPPED_ATTR}="iframe"]`)).not.toBeNull()
    expect(target.querySelector('span')!.textContent).toBe('after')
    // Replayer stylesheet makes the page inert.
    expect(target.querySelector('style[data-hs-replayer]')!.textContent).toContain('pointer-events: none')
  })

  it('serializes open shadow roots and rebuilds them', () => {
    const doc = loadFixture(`<!DOCTYPE html><html><body><div id="host"></div></body></html>`)
    const host = doc.getElementById('host')!
    const root = host.attachShadow({ mode: 'open' })
    root.innerHTML = '<p class="inner">shadow text</p>'
    const roots: ShadowRoot[] = []
    const snapshot = serializeDocument(doc, new Mirror(), { onShadowRoot: (r) => roots.push(r) })
    expect(roots).toHaveLength(1)
    const target = freshDoc()
    rebuildDocument(snapshot, target, new ReplayMirror(), { sanitize: false })
    const rebuiltHost = target.getElementById('host')!
    expect(rebuiltHost.shadowRoot).not.toBeNull()
    expect(rebuiltHost.shadowRoot!.querySelector('.inner')!.textContent).toBe('shadow text')
  })
})

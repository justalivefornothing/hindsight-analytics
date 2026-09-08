import { NodeKind } from '../recorder/types'
import type { SDocument, SElement, SNode } from '../recorder/types'

const XLINK_NS = 'http://www.w3.org/1999/xlink'
const XML_NS = 'http://www.w3.org/XML/1998/namespace'
const XHTML_NS = 'http://www.w3.org/1999/xhtml'

/** Marker attribute used for anything the sanitizer rewrote. */
export const STRIPPED_ATTR = 'data-hs-stripped'
export const HREF_ATTR = 'data-hs-href'
export const FOCUS_ATTR = 'data-hs-focus'
export const REPLAYER_STYLE_ATTR = 'data-hs-replayer'
export const FAST_STYLE_ATTR = 'data-hs-fast'

/** Elements that must never make it into the reconstructed document. */
const DROP_TAGS = new Set(['base', 'meta'])
/** Elements that are kept as inert placeholders so sibling ids stay valid. */
const INERT_TAGS = new Set(['script', 'iframe', 'object', 'embed', 'applet', 'frame'])

export interface RebuildOptions {
  /**
   * Sanitise the tree for a sandboxed replay: strip <script>, drop inline
   * handlers, neutralise links and forms. Defaults to true; tests turn it off
   * to verify pure round-trip fidelity.
   */
  sanitize?: boolean
}

/** Bidirectional id <-> node map for the reconstructed document. */
export class ReplayMirror {
  private byId = new Map<number, Node>()
  private ids = new WeakMap<Node, number>()

  get(id: number): Node | undefined {
    return this.byId.get(id)
  }

  idOf(node: Node): number | undefined {
    return this.ids.get(node)
  }

  has(id: number): boolean {
    return this.byId.has(id)
  }

  set(id: number, node: Node): void {
    this.byId.set(id, node)
    this.ids.set(node, id)
  }

  /** Forget a node and its entire subtree. */
  remove(node: Node): void {
    const id = this.ids.get(node)
    if (id !== undefined) {
      this.byId.delete(id)
      this.ids.delete(node)
    }
    const shadow = (node as Element).shadowRoot
    if (shadow) for (let c = shadow.firstChild; c; c = c.nextSibling) this.remove(c)
    for (let c = node.firstChild; c; c = c.nextSibling) this.remove(c)
  }

  clear(): void {
    this.byId = new Map()
    this.ids = new WeakMap()
  }

  get size(): number {
    return this.byId.size
  }
}

export interface PendingScroll {
  target: Element
  x: number
  y: number
}

export interface BuildContext {
  doc: Document
  mirror: ReplayMirror
  sanitize: boolean
  /** Scroll offsets that must be applied once the node is laid out. */
  scrolls: PendingScroll[]
}

function setAttr(el: Element, name: string, value: string, sanitize: boolean): void {
  if (sanitize) {
    if (name.startsWith('on')) return
    const tag = el.localName
    if (name === 'href' && tag === 'a') {
      el.setAttribute(HREF_ATTR, value)
      return
    }
    if (name === 'action' && tag === 'form') return
    if (name === 'target' && tag === 'a') return
    if ((name === 'src' || name === 'srcdoc') && INERT_TAGS.has(tag)) return
    if (name === 'data' && tag === 'object') return
  }
  try {
    if (name.startsWith('xlink:')) el.setAttributeNS(XLINK_NS, name, value)
    else if (name.startsWith('xml:')) el.setAttributeNS(XML_NS, name, value)
    else el.setAttribute(name, value)
  } catch {
    // Invalid attribute name for this document type; skip it.
  }
}

/** Apply a single attribute change coming from the mutation stream. */
export function applyAttribute(el: Element, name: string, value: string | null, sanitize: boolean): void {
  if (value === null) {
    if (sanitize && name === 'href' && el.localName === 'a') el.removeAttribute(HREF_ATTR)
    else el.removeAttribute(name)
    return
  }
  setAttr(el, name, value, sanitize)
}

function buildElement(snode: SElement, ctx: BuildContext): Element | null {
  const { doc, sanitize } = ctx
  let tag = snode.tag

  if (sanitize) {
    if (DROP_TAGS.has(tag)) {
      // Keep an inert stand-in so sibling references remain resolvable.
      const stub = doc.createElement('template')
      stub.setAttribute(STRIPPED_ATTR, tag)
      ctx.mirror.set(snode.id, stub)
      return stub
    }
    if (INERT_TAGS.has(tag)) {
      // <script> is stripped: replaced with an inert placeholder that carries no
      // code and can never execute. Other embed-like tags get the same treatment.
      const stub = doc.createElement(tag === 'script' ? 'template' : 'div')
      stub.setAttribute(STRIPPED_ATTR, tag)
      if (tag !== 'script') {
        // Preserve footprint for visual elements.
        for (const name of ['class', 'style', 'width', 'height']) {
          const v = snode.attrs[name]
          if (v !== undefined) stub.setAttribute(name, v)
        }
      }
      ctx.mirror.set(snode.id, stub)
      return stub
    }
    if (tag === 'link') {
      const rel = (snode.attrs.rel || '').toLowerCase()
      if (!/\bstylesheet\b/.test(rel) && !/\bicon\b/.test(rel)) {
        const stub = doc.createElement('template')
        stub.setAttribute(STRIPPED_ATTR, 'link')
        ctx.mirror.set(snode.id, stub)
        return stub
      }
    }
  }

  // Inlined stylesheet from a <link rel="stylesheet"> becomes a <style>.
  const isLinkWithCss = tag === 'link' && snode.css !== undefined
  if (isLinkWithCss) tag = 'style'

  let el: Element
  try {
    el = snode.ns ? doc.createElementNS(snode.ns, tag) : doc.createElement(tag)
  } catch {
    el = doc.createElement('span')
  }
  ctx.mirror.set(snode.id, el)

  for (const name in snode.attrs) {
    if (isLinkWithCss && (name === 'href' || name === 'rel')) {
      if (name === 'href') el.setAttribute(HREF_ATTR, snode.attrs[name])
      continue
    }
    setAttr(el, name, snode.attrs[name], sanitize)
  }

  if (snode.css !== undefined) {
    el.textContent = snode.css
  }

  for (const child of snode.ch) {
    const built = buildNode(child, ctx)
    if (built) el.appendChild(built)
  }

  if (snode.sr) {
    const root = (el as HTMLElement).attachShadow?.({ mode: 'open' })
    if (root) {
      for (const child of snode.sr) {
        const built = buildNode(child, ctx)
        if (built) root.appendChild(built)
      }
    }
  }

  // Live form state is restored through properties, never attributes, so the
  // markup stays byte-identical to the source page.
  if (snode.val !== undefined) {
    if (tag === 'textarea' || tag === 'input' || tag === 'select') {
      // For <select> the options are already appended, so the value sticks.
      ;(el as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value = snode.val
    }
  }
  if (snode.ck !== undefined) {
    ;(el as HTMLInputElement).checked = snode.ck
  }
  if (snode.sx || snode.sy) {
    ctx.scrolls.push({ target: el, x: snode.sx ?? 0, y: snode.sy ?? 0 })
  }
  return el
}

export function buildNode(snode: SNode, ctx: BuildContext): Node | null {
  const { doc, mirror } = ctx
  switch (snode.t) {
    case NodeKind.Document:
      return null // documents are rebuilt via rebuildDocument
    case NodeKind.DocumentType: {
      const dt = doc.implementation.createDocumentType(snode.name || 'html', snode.pub, snode.sys)
      mirror.set(snode.id, dt)
      return dt
    }
    case NodeKind.Element:
      return buildElement(snode, ctx)
    case NodeKind.Text: {
      const text = doc.createTextNode(snode.text)
      mirror.set(snode.id, text)
      return text
    }
    case NodeKind.CData: {
      // HTML documents cannot hold CDATA sections; a text node is the closest match.
      const text = doc.createTextNode(snode.text)
      mirror.set(snode.id, text)
      return text
    }
    case NodeKind.Comment: {
      const comment = doc.createComment(snode.text)
      mirror.set(snode.id, comment)
      return comment
    }
  }
}

/** CSS injected into every replay document so it is inert and looks right. */
export const REPLAYER_CSS = `
html, body, * { cursor: none !important; }
* { pointer-events: none !important; user-select: none !important; }
noscript, template[${STRIPPED_ATTR}] { display: none !important; }
[${FOCUS_ATTR}] { outline: 2px solid rgba(74, 99, 211, 0.85) !important; outline-offset: 2px !important; }
`

export const FAST_CSS = `* { transition: none !important; animation-duration: 0s !important; animation-delay: 0s !important; scroll-behavior: auto !important; }`

export function injectReplayerStyles(doc: Document): void {
  if (!doc.documentElement) return
  let head = doc.head
  if (!head) {
    head = doc.createElement('head')
    doc.documentElement.insertBefore(head, doc.documentElement.firstChild)
  }
  if (head.querySelector(`style[${REPLAYER_STYLE_ATTR}]`)) return
  const style = doc.createElement('style')
  style.setAttribute(REPLAYER_STYLE_ATTR, '')
  style.textContent = REPLAYER_CSS
  head.appendChild(style)
}

export function setFastMode(doc: Document, on: boolean): void {
  const existing = doc.querySelector(`style[${FAST_STYLE_ATTR}]`)
  if (on && !existing && doc.head) {
    const style = doc.createElement('style')
    style.setAttribute(FAST_STYLE_ATTR, '')
    style.textContent = FAST_CSS
    doc.head.appendChild(style)
  } else if (!on && existing) {
    existing.remove()
  }
}

export interface RebuildResult {
  scrolls: PendingScroll[]
}

/**
 * Replace the contents of `doc` with the serialized snapshot.
 * The mirror is reset so ids from the snapshot become authoritative.
 */
export function rebuildDocument(
  snapshot: SDocument,
  doc: Document,
  mirror: ReplayMirror,
  options: RebuildOptions = {},
): RebuildResult {
  const sanitize = options.sanitize ?? true
  const ctx: BuildContext = { doc, mirror, sanitize, scrolls: [] }
  mirror.clear()
  mirror.set(snapshot.id, doc)

  while (doc.firstChild) doc.removeChild(doc.firstChild)

  for (const child of snapshot.ch) {
    const built = buildNode(child, ctx)
    if (!built) continue
    if (built.nodeType === 10 && doc.doctype) continue
    if (built.nodeType === 1 && doc.documentElement) continue
    try {
      doc.appendChild(built)
    } catch {
      // Documents are picky about what they accept at the top level; ignore extras.
    }
  }

  if (!doc.documentElement) {
    const html = doc.createElementNS(XHTML_NS, 'html')
    doc.appendChild(html)
  }
  if (sanitize) injectReplayerStyles(doc)
  return { scrolls: ctx.scrolls }
}

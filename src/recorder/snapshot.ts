import { Mirror } from './mirror'
import { isMasked, isSensitiveInput, maskText } from './mask'
import { NodeKind } from './types'
import type { SDocument, SElement, SNode } from './types'

const XHTML_NS = 'http://www.w3.org/1999/xhtml'

/** Attributes whose values are URLs and must be made absolute for replay. */
const URL_ATTRS = new Set(['src', 'href', 'poster', 'action', 'data', 'xlink:href'])

/** Elements whose children we never serialize. */
const OPAQUE_TAGS = new Set(['script', 'iframe', 'object', 'embed', 'noscript'])

/** Input types that carry no user-entered value worth recording. */
const VALUELESS_INPUTS = new Set(['button', 'submit', 'reset', 'image', 'file', 'hidden'])

export interface SerializeOptions {
  /**
   * When true (default) the text of same-origin stylesheets is captured so the
   * replay does not depend on the original CSS URLs still resolving.
   */
  inlineStylesheets?: boolean
  /** Invoked for every open shadow root so the caller can observe it. */
  onShadowRoot?: (root: ShadowRoot) => void
}

interface Ctx {
  doc: Document
  mirror: Mirror
  opts: Required<Pick<SerializeOptions, 'inlineStylesheets'>> & SerializeOptions
}

export function absoluteUrl(value: string, doc: Document): string {
  if (!value || value.startsWith('data:') || value.startsWith('blob:') || value.startsWith('#')) {
    return value
  }
  try {
    return new URL(value, doc.baseURI).href
  } catch {
    return value
  }
}

function absoluteSrcset(value: string, doc: Document): string {
  return value
    .split(',')
    .map((candidate) => {
      const parts = candidate.trim().split(/\s+/)
      if (parts.length === 0 || !parts[0]) return candidate
      parts[0] = absoluteUrl(parts[0], doc)
      return parts.join(' ')
    })
    .join(', ')
}

function readStylesheetText(el: Element, doc: Document): string | undefined {
  const sheets = doc.styleSheets
  for (let i = 0; i < sheets.length; i++) {
    const sheet = sheets[i]
    if (sheet.ownerNode !== el) continue
    try {
      const rules = sheet.cssRules
      let out = ''
      for (let r = 0; r < rules.length; r++) out += rules[r].cssText + '\n'
      return out
    } catch {
      // Cross-origin sheet: rules are not readable, fall back to the link.
      return undefined
    }
  }
  return undefined
}

function serializeElement(el: Element, ctx: Ctx): SElement {
  const { doc, mirror } = ctx
  const tag = el.localName
  const ns = el.namespaceURI && el.namespaceURI !== XHTML_NS ? el.namespaceURI : undefined
  const attrs: Record<string, string> = {}

  for (let i = 0; i < el.attributes.length; i++) {
    const { name, value } = el.attributes[i]
    if (name.startsWith('on')) continue // never carry inline handlers
    if (name === 'srcset') attrs[name] = absoluteSrcset(value, doc)
    else if (URL_ATTRS.has(name)) attrs[name] = absoluteUrl(value, doc)
    else attrs[name] = value
  }

  const out: SElement = { t: NodeKind.Element, id: mirror.assign(el), tag, attrs, ch: [] }
  if (ns) out.ns = ns

  const masked = isMasked(el)
  if (masked) out.m = true

  // Live form state (properties, not attributes).
  if (tag === 'input') {
    const input = el as HTMLInputElement
    const type = (input.getAttribute('type') || 'text').toLowerCase()
    if (type === 'checkbox' || type === 'radio') {
      out.ck = input.checked
    } else if (!VALUELESS_INPUTS.has(type)) {
      const v = input.value
      if (v) out.val = masked || isSensitiveInput(input) ? maskText(v) : v
    }
  } else if (tag === 'textarea') {
    const v = (el as HTMLTextAreaElement).value
    if (v) out.val = masked ? maskText(v) : v
  } else if (tag === 'select') {
    out.val = (el as HTMLSelectElement).value
  } else if (tag === 'option') {
    // selected is reflected through the parent <select>'s value
  }

  // Scroll offsets for overflow containers.
  const sx = (el as HTMLElement).scrollLeft
  const sy = (el as HTMLElement).scrollTop
  if (sx) out.sx = sx
  if (sy) out.sy = sy

  // Stylesheets are inlined so the replay is self-contained.
  if (ctx.opts.inlineStylesheets) {
    if (tag === 'style') {
      // Prefer the authored text (faithful, no browser normalisation); fall
      // back to the CSSOM for sheets populated via insertRule().
      const authored = el.textContent ?? ''
      out.css = authored.trim() ? authored : (readStylesheetText(el, doc) ?? '')
      return out // children replaced by css
    }
    if (tag === 'link' && /\bstylesheet\b/i.test(el.getAttribute('rel') || '')) {
      const css = readStylesheetText(el, doc)
      if (css !== undefined) out.css = css
      return out
    }
  }

  if (OPAQUE_TAGS.has(tag)) return out

  for (let c = el.firstChild; c; c = c.nextSibling) {
    const s = serializeNode(c, ctx)
    if (s) out.ch.push(s)
  }

  const shadow = el.shadowRoot
  if (shadow) {
    ctx.opts.onShadowRoot?.(shadow)
    out.sr = []
    for (let c = shadow.firstChild; c; c = c.nextSibling) {
      const s = serializeNode(c, ctx)
      if (s) out.sr.push(s)
    }
  }
  return out
}

export function serializeNode(node: Node, ctx: Ctx): SNode | null {
  const { mirror } = ctx
  switch (node.nodeType) {
    case 9: {
      // DOCUMENT_NODE
      const doc = node as Document
      const out: SDocument = { t: NodeKind.Document, id: mirror.assign(doc), ch: [] }
      for (let c = doc.firstChild; c; c = c.nextSibling) {
        const s = serializeNode(c, ctx)
        if (s) out.ch.push(s)
      }
      return out
    }
    case 10: {
      // DOCUMENT_TYPE_NODE
      const dt = node as DocumentType
      return {
        t: NodeKind.DocumentType,
        id: mirror.assign(dt),
        name: dt.name,
        pub: dt.publicId,
        sys: dt.systemId,
      }
    }
    case 1:
      return serializeElement(node as Element, ctx)
    case 3: {
      const parent = node.parentNode as Element | null
      const parentTag = parent && parent.nodeType === 1 ? parent.localName : ''
      let text = (node as Text).data
      if (parentTag !== 'style' && parentTag !== 'script' && isMasked(node)) text = maskText(text)
      return { t: NodeKind.Text, id: mirror.assign(node), text }
    }
    case 4:
      return { t: NodeKind.CData, id: mirror.assign(node), text: (node as CDATASection).data }
    case 8:
      return { t: NodeKind.Comment, id: mirror.assign(node), text: (node as Comment).data }
    default:
      return null
  }
}

/** Serialize a single subtree (used for incremental adds). */
export function serializeSubtree(
  node: Node,
  doc: Document,
  mirror: Mirror,
  options: SerializeOptions = {},
): SNode | null {
  const ctx: Ctx = { doc, mirror, opts: { inlineStylesheets: true, ...options } }
  return serializeNode(node, ctx)
}

/** Serialize the whole document into a snapshot tree. */
export function serializeDocument(
  doc: Document,
  mirror: Mirror,
  options: SerializeOptions = {},
): SDocument {
  const ctx: Ctx = { doc, mirror, opts: { inlineStylesheets: true, ...options } }
  return serializeNode(doc, ctx) as SDocument
}

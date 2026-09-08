/**
 * Autocapture needs a human-readable, reasonably stable way to describe the
 * element a user interacted with. We build a short structural selector that
 * anchors on the nearest id or data-testid and falls back to tag + position.
 */

const INTERACTIVE = 'a,button,input,select,textarea,label,summary,[role="button"],[role="link"],[data-track]'
const MAX_DEPTH = 6
const MAX_TEXT = 80

function cssEscape(value: string): string {
  return value.replace(/([^a-zA-Z0-9_-])/g, '\\$1')
}

function segment(el: Element): string {
  const tag = el.localName
  const parent = el.parentElement
  if (!parent) return tag
  let index = 1
  let count = 0
  for (const sibling of Array.from(parent.children)) {
    if (sibling.localName !== tag) continue
    count++
    if (sibling === el) index = count
  }
  return count > 1 ? `${tag}:nth-of-type(${index})` : tag
}

/** Build a selector such as `#cart > ul > li:nth-of-type(2) > button`. */
export function buildSelector(target: Element): string {
  const parts: string[] = []
  let el: Element | null = target
  let depth = 0
  while (el && el.nodeType === 1 && depth < MAX_DEPTH) {
    if (el.id) {
      parts.unshift(`#${cssEscape(el.id)}`)
      return parts.join(' > ')
    }
    const testId = el.getAttribute('data-testid') || el.getAttribute('data-track')
    if (testId) {
      parts.unshift(`${el.localName}[data-${el.hasAttribute('data-testid') ? 'testid' : 'track'}="${testId}"]`)
      return parts.join(' > ')
    }
    if (el.localName === 'body' || el.localName === 'html') {
      parts.unshift(el.localName)
      return parts.join(' > ')
    }
    parts.unshift(segment(el))
    el = el.parentElement
    depth++
  }
  return parts.join(' > ')
}

/** The element autocapture should attribute a click to. */
export function interactiveAncestor(target: Element): Element {
  const hit = target.closest(INTERACTIVE)
  return hit ?? target
}

/** Short, whitespace-normalised visible text for an element. */
export function elementText(el: Element): string {
  const raw = (el as HTMLElement).innerText ?? el.textContent ?? ''
  const text = raw.replace(/\s+/g, ' ').trim()
  return text.length > MAX_TEXT ? text.slice(0, MAX_TEXT - 1) + '…' : text
}

export interface ElementDescriptor {
  tag: string
  selector: string
  text: string
  href?: string
  type?: string
  name?: string
  track?: string
}

export function describeElement(target: Element): ElementDescriptor {
  const el = interactiveAncestor(target)
  const out: ElementDescriptor = {
    tag: el.localName,
    selector: buildSelector(el),
    text: elementText(el),
  }
  const href = el.getAttribute('href')
  if (href) out.href = href
  const type = el.getAttribute('type')
  if (type) out.type = type
  const name = el.getAttribute('name') || el.getAttribute('aria-label')
  if (name) out.name = name
  const track = el.getAttribute('data-track')
  if (track) out.track = track
  return out
}

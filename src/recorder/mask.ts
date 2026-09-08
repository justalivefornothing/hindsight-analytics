/** Masking rules shared by the snapshot serializer and the live observers. */

export const MASK_ATTR = 'data-mask'
export const MASK_CHAR = '•'

/** True when the node lives inside (or is) a `[data-mask]` element. */
export function isMasked(node: Node | null): boolean {
  let el: Element | null =
    node === null ? null : node.nodeType === 1 ? (node as Element) : node.parentElement
  while (el) {
    if (el.hasAttribute(MASK_ATTR)) return true
    // Cross open shadow boundaries: the host might be masked.
    const parent: Node | null = el.parentNode
    if (parent && parent.nodeType === 11 /* DOCUMENT_FRAGMENT */) {
      el = (parent as ShadowRoot).host
    } else {
      el = el.parentElement
    }
  }
  return false
}

/** Replace every non-whitespace character so line breaks and word lengths survive. */
export function maskText(text: string): string {
  return text.replace(/\S/g, MASK_CHAR)
}

/** Password fields are always masked regardless of markup. */
export function isSensitiveInput(el: Element): boolean {
  if (el.tagName.toLowerCase() !== 'input') return false
  const type = (el.getAttribute('type') || 'text').toLowerCase()
  return type === 'password'
}

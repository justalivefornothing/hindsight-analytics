import type {
  AddedNode,
  FocusEvent,
  InputEvent,
  MutationEvent,
  ScrollEvent,
} from '../recorder/types'
import { FOCUS_ATTR, applyAttribute, buildNode } from './rebuild'
import type { BuildContext, PendingScroll, ReplayMirror } from './rebuild'

export interface ApplyOptions {
  sanitize?: boolean
}

/**
 * Apply one mutation batch to the reconstructed document.
 *
 * Additions are retried until no progress is made: a parent or "next sibling"
 * may itself be part of the same batch and appear later in the list.
 */
export function applyMutation(
  m: MutationEvent,
  doc: Document,
  mirror: ReplayMirror,
  options: ApplyOptions = {},
): PendingScroll[] {
  const sanitize = options.sanitize ?? true
  const ctx: BuildContext = { doc, mirror, sanitize, scrolls: [] }

  for (const r of m.removes) {
    const node = mirror.get(r.id)
    if (!node) continue
    const parent = node.parentNode
    if (parent) parent.removeChild(node)
    mirror.remove(node)
  }

  let queue: AddedNode[] = m.adds.slice()
  let guard = 0
  while (queue.length && guard++ < 50) {
    const deferred: AddedNode[] = []
    for (const add of queue) {
      if (!tryAdd(add, ctx)) deferred.push(add)
    }
    if (deferred.length === queue.length) {
      // No progress: force-append whatever is left so we never lose content.
      for (const add of deferred) tryAdd(add, ctx, true)
      break
    }
    queue = deferred
  }

  for (const a of m.attrs) {
    const el = mirror.get(a.id)
    if (!el || el.nodeType !== 1) continue
    for (const name in a.attrs) applyAttribute(el as Element, name, a.attrs[name], sanitize)
  }

  for (const t of m.texts) {
    const node = mirror.get(t.id)
    if (!node) continue
    if (node.nodeType === 3 || node.nodeType === 8 || node.nodeType === 4) {
      ;(node as CharacterData).data = t.text
    }
  }

  return ctx.scrolls
}

function tryAdd(add: AddedNode, ctx: BuildContext, force = false): boolean {
  const { mirror } = ctx
  const parentNode = mirror.get(add.pid)
  if (!parentNode) return force // cannot attach anywhere; drop when forced

  let container: Node = parentNode
  if (add.sr) {
    const host = parentNode as Element
    const root = host.shadowRoot ?? host.attachShadow?.({ mode: 'open' })
    if (!root) return force
    container = root
  }

  let before: Node | null = null
  if (add.next !== null) {
    const next = mirror.get(add.next)
    if (!next && !force) return false
    if (next && next.parentNode === container) before = next
  }

  // A node id that already exists means a stale copy is in the tree; replace it.
  const existing = mirror.get(add.node.id)
  if (existing) {
    existing.parentNode?.removeChild(existing)
    mirror.remove(existing)
  }

  const built = buildNode(add.node, ctx)
  if (!built) return true
  try {
    container.insertBefore(built, before)
  } catch {
    try {
      container.appendChild(built)
    } catch {
      return true
    }
  }
  return true
}

export function applyScroll(ev: ScrollEvent, doc: Document, mirror: ReplayMirror): void {
  if (ev.id === -1) {
    const win = doc.defaultView
    if (win) win.scrollTo(ev.x, ev.y)
    else if (doc.documentElement) {
      doc.documentElement.scrollLeft = ev.x
      doc.documentElement.scrollTop = ev.y
    }
    return
  }
  const el = mirror.get(ev.id) as Element | undefined
  if (!el || el.nodeType !== 1) return
  el.scrollLeft = ev.x
  el.scrollTop = ev.y
}

export function applyPendingScrolls(scrolls: PendingScroll[]): void {
  for (const s of scrolls) {
    s.target.scrollLeft = s.x
    s.target.scrollTop = s.y
  }
}

export function applyInput(ev: InputEvent, mirror: ReplayMirror): void {
  const el = mirror.get(ev.id) as HTMLInputElement | undefined
  if (!el || el.nodeType !== 1) return
  if (ev.checked !== undefined) {
    el.checked = ev.checked
    return
  }
  if ('value' in el) el.value = ev.value
}

export function applyFocus(ev: FocusEvent, mirror: ReplayMirror): void {
  const el = mirror.get(ev.id) as Element | undefined
  if (!el || el.nodeType !== 1) return
  if (ev.on) el.setAttribute(FOCUS_ATTR, '')
  else el.removeAttribute(FOCUS_ATTR)
}

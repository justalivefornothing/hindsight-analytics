import { Mirror } from './mirror'
import { isMasked, maskText } from './mask'
import { serializeSubtree } from './snapshot'
import type { SerializeOptions } from './snapshot'
import type { AddedNode, AttrChange, MutationEvent, RemovedNode, TextChange } from './types'

const FOLLOWING = 4 // Node.DOCUMENT_POSITION_FOLLOWING

export interface MutationSink {
  (event: Omit<MutationEvent, 't'>): void
}

/**
 * Turns raw MutationRecords into a compact, replayable mutation batch.
 *
 * The tricky part is that a single observer callback can contain a node that
 * was added, moved and removed again, or a subtree whose parent is also new.
 * We resolve this by processing in phases:
 *
 *   1. removals   – anything with an id that is no longer where it was
 *   2. additions  – every connected node without an id, collapsed to the
 *                   top-most new ancestor so subtrees are serialized once
 *   3. attributes – only for nodes that existed before this batch
 *   4. text       – same rule as attributes
 *
 * Nodes are addressed by id and positioned with a "next sibling" pointer, so
 * additions are emitted in reverse document order to guarantee the sibling
 * already exists when the replayer inserts.
 */
export class MutationCollector {
  private observer: MutationObserver | null = null
  private observedRoots = new Set<Node>()
  private doc: Document
  private mirror: Mirror
  private sink: MutationSink
  private serializeOptions: SerializeOptions

  constructor(doc: Document, mirror: Mirror, sink: MutationSink, serializeOptions: SerializeOptions = {}) {
    this.doc = doc
    this.mirror = mirror
    this.sink = sink
    this.serializeOptions = serializeOptions
  }

  start(): void {
    const win = this.doc.defaultView
    if (!win) throw new Error('document has no window')
    this.observer = new win.MutationObserver((records) => this.process(records))
    this.observe(this.doc)
  }

  /** Observe an additional root (open shadow roots discovered while serializing). */
  observe(root: Node): void {
    if (!this.observer || this.observedRoots.has(root)) return
    this.observedRoots.add(root)
    this.observer.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true,
    })
  }

  /** Flush any pending records synchronously (useful before snapshots / tests). */
  flush(): void {
    if (!this.observer) return
    const pending = this.observer.takeRecords()
    if (pending.length) this.process(pending)
  }

  stop(): void {
    this.flush()
    this.observer?.disconnect()
    this.observer = null
    this.observedRoots.clear()
  }

  private process(records: MutationRecord[]): void {
    const { mirror } = this
    const removes: RemovedNode[] = []
    const adds: AddedNode[] = []
    const attrs: AttrChange[] = []
    const texts: TextChange[] = []

    const addedCandidates = new Set<Node>()
    const attrCandidates = new Map<Element, Set<string>>()
    const textCandidates = new Set<Node>()

    // Phase 1: removals. A node that was removed and is still connected has
    // simply moved; it will be re-serialized under its new parent below.
    for (const rec of records) {
      if (rec.type === 'childList') {
        for (let i = 0; i < rec.removedNodes.length; i++) {
          const node = rec.removedNodes[i]
          const id = mirror.getId(node)
          if (id === undefined) continue
          const inShadow = rec.target.nodeType === 11
          const pid = mirror.getId(inShadow ? (rec.target as ShadowRoot).host : rec.target)
          if (pid !== undefined) removes.push(inShadow ? { id, pid, sr: true } : { id, pid })
          mirror.forget(node)
        }
        for (let i = 0; i < rec.addedNodes.length; i++) addedCandidates.add(rec.addedNodes[i])
      } else if (rec.type === 'attributes') {
        const el = rec.target as Element
        const name = rec.attributeName
        if (!name || name.startsWith('on')) continue
        let set = attrCandidates.get(el)
        if (!set) attrCandidates.set(el, (set = new Set()))
        set.add(name)
      } else if (rec.type === 'characterData') {
        textCandidates.add(rec.target)
      }
    }

    // Attribute / text changes only matter for nodes that already existed;
    // fresh nodes are serialized with their current state anyway. Capture the
    // "existed before" set now, before additions allocate new ids.
    const preExistingAttr = [...attrCandidates].filter(([el]) => mirror.has(el))
    const preExistingText = [...textCandidates].filter((n) => mirror.has(n))

    // Phase 2: additions. Collapse each new node to its top-most new ancestor
    // whose parent is known to the mirror.
    const tops = new Set<Node>()
    for (const node of addedCandidates) {
      if (!node.isConnected || mirror.has(node)) continue
      let top: Node = node
      let parent = parentOf(top)
      while (parent && !mirror.has(parent)) {
        top = parent
        parent = parentOf(top)
      }
      if (!parent) continue // detached from everything we know about
      tops.add(top)
    }

    if (tops.size) {
      // Serialize first so every new sibling has an id before we link them.
      const serialized = new Map<Node, ReturnType<typeof serializeSubtree>>()
      for (const top of tops) {
        serialized.set(
          top,
          serializeSubtree(top, this.doc, mirror, {
            ...this.serializeOptions,
            onShadowRoot: (root) => {
              this.observe(root)
              this.serializeOptions.onShadowRoot?.(root)
            },
          }),
        )
      }
      const ordered = [...tops].sort((a, b) =>
        a === b ? 0 : a.compareDocumentPosition(b) & FOLLOWING ? 1 : -1,
      )
      for (const top of ordered) {
        const snode = serialized.get(top)
        const parent = parentOf(top)
        if (!snode || !parent) continue
        const pid = mirror.getId(parent)
        if (pid === undefined) continue
        const add: AddedNode = { pid, next: nextSiblingId(top, mirror), node: snode }
        if (top.parentNode && top.parentNode.nodeType === 11) add.sr = true
        adds.push(add)
      }
    }

    // Phase 3: attributes.
    for (const [el, names] of preExistingAttr) {
      const id = mirror.getId(el)
      if (id === undefined) continue
      const changed: Record<string, string | null> = {}
      for (const name of names) changed[name] = el.getAttribute(name)
      attrs.push({ id, attrs: changed })
    }

    // Phase 4: character data.
    for (const node of preExistingText) {
      const id = mirror.getId(node)
      if (id === undefined) continue
      let text = (node as CharacterData).data
      if (isMasked(node)) text = maskText(text)
      texts.push({ id, text })
    }

    if (removes.length || adds.length || attrs.length || texts.length) {
      this.sink({ type: 'mutation', removes, adds, attrs, texts })
    }
  }
}

/** Parent for tree walking that treats a shadow root's host as its parent. */
function parentOf(node: Node): Node | null {
  const p = node.parentNode
  if (!p) return null
  if (p.nodeType === 11 /* fragment */) {
    const host = (p as ShadowRoot).host
    return host ?? null
  }
  return p
}

/** Id of the nearest following sibling that the mirror knows about. */
function nextSiblingId(node: Node, mirror: Mirror): number | null {
  for (let s = node.nextSibling; s; s = s.nextSibling) {
    const id = mirror.getId(s)
    if (id !== undefined) return id
  }
  return null
}

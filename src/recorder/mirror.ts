/**
 * The mirror hands out stable integer ids for live DOM nodes.
 *
 * Ids are what tie the incremental mutation stream to the snapshot: every
 * event refers to nodes by id, never by reference, so the replayer can
 * rebuild the same tree in a different document and still address it.
 */
export class Mirror {
  private ids = new WeakMap<Node, number>()
  private next = 1

  getId(node: Node): number | undefined {
    return this.ids.get(node)
  }

  has(node: Node): boolean {
    return this.ids.has(node)
  }

  /** Return the existing id for the node or allocate a fresh one. */
  assign(node: Node): number {
    const existing = this.ids.get(node)
    if (existing !== undefined) return existing
    const id = this.next++
    this.ids.set(node, id)
    return id
  }

  /** Drop the id of a node and its whole subtree (used after removal). */
  forget(node: Node): void {
    this.ids.delete(node)
    const el = node as Element
    if (el.shadowRoot) this.forget(el.shadowRoot)
    for (let c = node.firstChild; c; c = c.nextSibling) this.forget(c)
  }
}

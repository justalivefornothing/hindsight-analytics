/**
 * Wire format for Hindsight recordings.
 *
 * Everything here is plain JSON so a session can be persisted as compact
 * chunks and reconstructed later without any reference to the live DOM.
 * Field names are deliberately short: a busy session produces thousands of
 * events and the serialized size matters.
 */

/** Node type discriminators (mirrors a subset of `Node.nodeType`). */
export const NodeKind = {
  Document: 0,
  DocumentType: 1,
  Element: 2,
  Text: 3,
  CData: 4,
  Comment: 5,
} as const

export type NodeKindValue = (typeof NodeKind)[keyof typeof NodeKind]

export interface SDocument {
  t: typeof NodeKind.Document
  id: number
  ch: SNode[]
}

export interface SDocumentType {
  t: typeof NodeKind.DocumentType
  id: number
  name: string
  pub: string
  sys: string
}

export interface SElement {
  t: typeof NodeKind.Element
  id: number
  /** lower-case tag name */
  tag: string
  /** namespace URI when not XHTML (svg, mathml) */
  ns?: string
  attrs: Record<string, string>
  ch: SNode[]
  /** open shadow root children */
  sr?: SNode[]
  /** live value of an input / textarea / select (already masked if needed) */
  val?: string
  /** checked state for checkbox / radio */
  ck?: boolean
  /** scroll offsets when non-zero */
  sx?: number
  sy?: number
  /** captured stylesheet text for <style> and <link rel="stylesheet"> */
  css?: string
  /** true when text descendants were masked */
  m?: boolean
}

export interface SText {
  t: typeof NodeKind.Text
  id: number
  text: string
}

export interface SCData {
  t: typeof NodeKind.CData
  id: number
  text: string
}

export interface SComment {
  t: typeof NodeKind.Comment
  id: number
  text: string
}

export type SNode = SDocument | SDocumentType | SElement | SText | SCData | SComment

/* ------------------------------------------------------------------ */
/* Incremental events                                                  */
/* ------------------------------------------------------------------ */

export interface AddedNode {
  /** id of the parent the node was attached to */
  pid: number
  /** id of the next sibling, or null to append */
  next: number | null
  node: SNode
  /** true when the parent id refers to a shadow host and the node lives in its shadow root */
  sr?: boolean
}

export interface RemovedNode {
  id: number
  pid: number
  sr?: boolean
}

export interface AttrChange {
  id: number
  /** attribute name -> new value, or null when removed */
  attrs: Record<string, string | null>
}

export interface TextChange {
  id: number
  text: string
}

export interface MetaEvent {
  type: 'meta'
  t: number
  href: string
  w: number
  h: number
}

export interface SnapshotEvent {
  type: 'snapshot'
  t: number
  node: SDocument
  /** document scroll position at snapshot time */
  sx: number
  sy: number
}

export interface MutationEvent {
  type: 'mutation'
  t: number
  removes: RemovedNode[]
  adds: AddedNode[]
  attrs: AttrChange[]
  texts: TextChange[]
}

export interface MouseMoveEvent {
  type: 'move'
  t: number
  x: number
  y: number
}

export interface ClickEvent {
  type: 'click'
  t: number
  x: number
  y: number
  id: number
}

export interface ScrollEvent {
  type: 'scroll'
  t: number
  /** id of the scrolled element; -1 means the document itself */
  id: number
  x: number
  y: number
}

export interface InputEvent {
  type: 'input'
  t: number
  id: number
  value: string
  checked?: boolean
}

export interface ResizeEvent {
  type: 'resize'
  t: number
  w: number
  h: number
}

export interface FocusEvent {
  type: 'focus'
  t: number
  id: number
  on: boolean
}

export interface UrlEvent {
  type: 'url'
  t: number
  href: string
}

export interface MarkerEvent {
  type: 'marker'
  t: number
  /** analytics event name, e.g. "$click" or "purchase_completed" */
  name: string
}

export type RecordedEvent =
  | MetaEvent
  | SnapshotEvent
  | MutationEvent
  | MouseMoveEvent
  | ClickEvent
  | ScrollEvent
  | InputEvent
  | ResizeEvent
  | FocusEvent
  | UrlEvent
  | MarkerEvent

export type RecordedEventType = RecordedEvent['type']

/* ------------------------------------------------------------------ */
/* Analytics                                                            */
/* ------------------------------------------------------------------ */

export type PropValue = string | number | boolean | null | Record<string, unknown> | unknown[]

export interface AnalyticsEvent {
  id: string
  sessionId: string
  userId: string
  name: string
  /** absolute epoch millis */
  ts: number
  /** millis since session start (matches replay timeline) */
  t: number
  props: Record<string, PropValue>
}

export interface Chunk {
  sessionId: string
  seq: number
  events: RecordedEvent[]
}

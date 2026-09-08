import { getDB } from './db'
import type { AnalyticsEvent, Chunk, RecordedEvent } from '../recorder/types'
import type { SessionSummary } from '../analytics/session'
import type { FeatureFlag } from '../analytics/flags'
import type { FunnelDefinition } from '../analytics/funnel'
import { DEFAULT_FLAGS, generateSeed } from '../analytics/seed'
import { publish } from './bus'

/* ---------------------------------- sessions ---------------------------------- */

export async function putSession(session: SessionSummary): Promise<void> {
  const db = await getDB()
  await db.put('sessions', session)
}

export async function getSession(id: string): Promise<SessionSummary | undefined> {
  const db = await getDB()
  return db.get('sessions', id)
}

/** Newest first. One bulk read; a cursor would cost a round trip per row. */
export async function listSessions(limit = 500): Promise<SessionSummary[]> {
  const db = await getDB()
  const all = await db.getAllFromIndex('sessions', 'byStartedAt')
  return all.length > limit ? all.slice(all.length - limit).reverse() : all.reverse()
}

export async function countSessions(): Promise<number> {
  const db = await getDB()
  return db.count('sessions')
}

/* ----------------------------------- chunks ----------------------------------- */

export async function appendChunk(chunk: Chunk, session: SessionSummary): Promise<void> {
  const db = await getDB()
  const tx = db.transaction(['chunks', 'sessions'], 'readwrite')
  await Promise.all([tx.objectStore('chunks').put(chunk), tx.objectStore('sessions').put(session), tx.done])
}

export interface LoadedRecording {
  events: RecordedEvent[]
  /** highest chunk sequence number included */
  lastSeq: number
}

/** Load every replay chunk for a session (optionally only those after `afterSeq`). */
export async function loadRecording(sessionId: string, afterSeq = 0): Promise<LoadedRecording> {
  const db = await getDB()
  const range = IDBKeyRange.bound([sessionId, afterSeq], [sessionId, Number.MAX_SAFE_INTEGER], true, false)
  const chunks = await db.getAll('chunks', range)
  chunks.sort((a, b) => a.seq - b.seq)
  const events: RecordedEvent[] = []
  let lastSeq = afterSeq
  for (const c of chunks) {
    events.push(...c.events)
    if (c.seq > lastSeq) lastSeq = c.seq
  }
  return { events, lastSeq }
}

/* ----------------------------------- events ----------------------------------- */

export async function addEvents(events: AnalyticsEvent[], session?: SessionSummary): Promise<void> {
  if (!events.length && !session) return
  const db = await getDB()
  const tx = db.transaction(['events', 'sessions'], 'readwrite')
  const store = tx.objectStore('events')
  const ops: Promise<unknown>[] = events.map((e) => store.put(e))
  if (session) ops.push(tx.objectStore('sessions').put(session))
  ops.push(tx.done)
  await Promise.all(ops)
}

export interface EventQuery {
  limit?: number
  /** epoch ms lower bound */
  since?: number
}

/** All events, newest first (capped). Dashboards keep this in memory. */
export async function listEvents(query: EventQuery = {}): Promise<AnalyticsEvent[]> {
  const db = await getDB()
  const limit = query.limit ?? 20_000
  const range = query.since !== undefined ? IDBKeyRange.lowerBound(query.since) : null
  const all = await db.getAllFromIndex('events', 'byTs', range)
  const newest = all.length > limit ? all.slice(all.length - limit) : all
  return newest.reverse()
}

export async function listSessionEvents(sessionId: string): Promise<AnalyticsEvent[]> {
  const db = await getDB()
  const events = await db.getAllFromIndex('events', 'bySession', sessionId)
  return events.sort((a, b) => a.ts - b.ts)
}

export async function countEvents(): Promise<number> {
  const db = await getDB()
  return db.count('events')
}

/* ----------------------------------- flags ----------------------------------- */

export async function listFlags(): Promise<FeatureFlag[]> {
  const db = await getDB()
  const flags = await db.getAll('flags')
  return flags.sort((a, b) => a.createdAt - b.createdAt)
}

export async function putFlag(flag: FeatureFlag): Promise<void> {
  const db = await getDB()
  await db.put('flags', flag)
  publish({ kind: 'flags' })
}

export async function deleteFlag(key: string): Promise<void> {
  const db = await getDB()
  await db.delete('flags', key)
  publish({ kind: 'flags' })
}

/* ---------------------------------- funnels ---------------------------------- */

export async function listFunnels(): Promise<FunnelDefinition[]> {
  const db = await getDB()
  return db.getAll('funnels')
}

export async function putFunnel(funnel: FunnelDefinition): Promise<void> {
  const db = await getDB()
  await db.put('funnels', funnel)
}

export async function deleteFunnel(id: string): Promise<void> {
  const db = await getDB()
  await db.delete('funnels', id)
}

/* ------------------------------------ meta ------------------------------------ */

export async function getMeta<T>(key: string): Promise<T | undefined> {
  const db = await getDB()
  const row = await db.get('meta', key)
  return row?.value as T | undefined
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  const db = await getDB()
  await db.put('meta', { key, value })
}

/* ------------------------------------ seed ------------------------------------ */

export const DEFAULT_FUNNEL: FunnelDefinition = {
  id: 'storefront',
  name: 'Storefront purchase funnel',
  steps: [
    { event: '$pageview', label: 'Visited store' },
    { event: 'product_viewed', label: 'Viewed a product' },
    { event: 'add_to_cart', label: 'Added to cart' },
    { event: 'checkout_started', label: 'Started checkout' },
    { event: 'purchase_completed', label: 'Purchased' },
  ],
  windowMs: 30 * 60_000,
}

export interface SeedStats {
  users: number
  sessions: number
  events: number
}

export interface BootstrapInfo {
  flags: FeatureFlag[]
  funnels: FunnelDefinition[]
  sessionCount: number
  seededAt: number | undefined
}

/**
 * Ensure default flags and the default funnel exist and report what is in the
 * database, all inside ONE transaction. IndexedDB commits are comparatively
 * expensive (a fresh profile can spend hundreds of ms per transaction), so
 * boot deliberately touches the database as few times as possible.
 */
export async function bootstrapDatabase(): Promise<BootstrapInfo> {
  const db = await getDB()
  const tx = db.transaction(['flags', 'funnels', 'sessions', 'meta'], 'readwrite')
  const flagStore = tx.objectStore('flags')
  const funnelStore = tx.objectStore('funnels')
  const now = Date.now()
  let flags = await flagStore.getAll()
  if (flags.length === 0) {
    for (const f of DEFAULT_FLAGS) await flagStore.put({ ...f, createdAt: now })
    flags = await flagStore.getAll()
  }
  let funnels = await funnelStore.getAll()
  if (!funnels.some((f) => f.id === DEFAULT_FUNNEL.id)) {
    await funnelStore.put(DEFAULT_FUNNEL)
    funnels = await funnelStore.getAll()
  }
  const [sessionCount, seededRow] = await Promise.all([tx.objectStore('sessions').count(), tx.objectStore('meta').get('seededAt')])
  await tx.done
  return {
    flags: flags.sort((a, b) => a.createdAt - b.createdAt),
    funnels,
    sessionCount,
    seededAt: seededRow?.value as number | undefined,
  }
}

/** Ensure default flags and the default funnel exist (idempotent). */
export async function ensureDefaults(): Promise<void> {
  await bootstrapDatabase()
}

/** Populate the database with 200 synthetic shoppers. */
export async function seedDatabase(options: { users?: number; origin?: string; flags?: FeatureFlag[] } = {}): Promise<SeedStats> {
  const flags = options.flags ?? (await bootstrapDatabase()).flags
  const seed = generateSeed({
    users: options.users ?? 200,
    origin: options.origin ?? (typeof location !== 'undefined' ? location.origin : 'http://localhost:5173'),
    flags,
  })
  const db = await getDB()
  const tx = db.transaction(['sessions', 'events', 'meta'], 'readwrite')
  const sessions = tx.objectStore('sessions')
  const events = tx.objectStore('events')
  const ops: Promise<unknown>[] = []
  for (const s of seed.sessions) ops.push(sessions.put(s))
  for (const e of seed.events) ops.push(events.put(e))
  ops.push(tx.objectStore('meta').put({ key: 'seededAt', value: Date.now() }))
  ops.push(tx.done)
  await Promise.all(ops)
  publish({ kind: 'reset' })
  return { users: seed.users.length, sessions: seed.sessions.length, events: seed.events.length }
}

/** Remove every session, chunk and event (flags and funnels survive). */
export async function clearData(): Promise<void> {
  const db = await getDB()
  const tx = db.transaction(['sessions', 'chunks', 'events', 'meta'], 'readwrite')
  await Promise.all([
    tx.objectStore('sessions').clear(),
    tx.objectStore('chunks').clear(),
    tx.objectStore('events').clear(),
    tx.objectStore('meta').delete('seededAt'),
    tx.done,
  ])
  publish({ kind: 'reset' })
}

export async function deleteSession(id: string): Promise<void> {
  const db = await getDB()
  const tx = db.transaction(['sessions', 'chunks', 'events'], 'readwrite')
  const chunkKeys = await tx.objectStore('chunks').index('bySession').getAllKeys(id)
  const eventKeys = await tx.objectStore('events').index('bySession').getAllKeys(id)
  await Promise.all([
    tx.objectStore('sessions').delete(id),
    ...chunkKeys.map((k) => tx.objectStore('chunks').delete(k)),
    ...eventKeys.map((k) => tx.objectStore('events').delete(k)),
    tx.done,
  ])
  publish({ kind: 'reset' })
}

/** Distinct event names, most frequent first. */
export function eventNames(events: AnalyticsEvent[]): string[] {
  const counts = new Map<string, number>()
  for (const e of events) counts.set(e.name, (counts.get(e.name) ?? 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name)
}

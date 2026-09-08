import { openDB } from 'idb'
import type { DBSchema, IDBPDatabase } from 'idb'
import type { AnalyticsEvent, Chunk } from '../recorder/types'
import type { SessionSummary } from '../analytics/session'
import type { FeatureFlag } from '../analytics/flags'
import type { FunnelDefinition } from '../analytics/funnel'

export interface HindsightSchema extends DBSchema {
  sessions: {
    key: string
    value: SessionSummary
    indexes: { byStartedAt: number; byUser: string }
  }
  chunks: {
    key: [string, number]
    value: Chunk
    indexes: { bySession: string }
  }
  events: {
    key: string
    value: AnalyticsEvent
    indexes: { bySession: string; byName: string; byTs: number; byUser: string }
  }
  flags: {
    key: string
    value: FeatureFlag
  }
  funnels: {
    key: string
    value: FunnelDefinition
  }
  meta: {
    key: string
    value: { key: string; value: unknown }
  }
}

export type HindsightDB = IDBPDatabase<HindsightSchema>

export const DB_NAME = 'hindsight'
export const DB_VERSION = 1

let dbPromise: Promise<HindsightDB> | null = null

export function getDB(): Promise<HindsightDB> {
  if (!dbPromise) {
    dbPromise = openDB<HindsightSchema>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const sessions = db.createObjectStore('sessions', { keyPath: 'id' })
        sessions.createIndex('byStartedAt', 'startedAt')
        sessions.createIndex('byUser', 'userId')

        const chunks = db.createObjectStore('chunks', { keyPath: ['sessionId', 'seq'] })
        chunks.createIndex('bySession', 'sessionId')

        const events = db.createObjectStore('events', { keyPath: 'id' })
        events.createIndex('bySession', 'sessionId')
        events.createIndex('byName', 'name')
        events.createIndex('byTs', 'ts')
        events.createIndex('byUser', 'userId')

        db.createObjectStore('flags', { keyPath: 'key' })
        db.createObjectStore('funnels', { keyPath: 'id' })
        db.createObjectStore('meta', { keyPath: 'key' })
      },
    })
  }
  return dbPromise
}

/** Drop the cached connection (used after deleting the database). */
export function resetDBConnection(): void {
  dbPromise = null
}

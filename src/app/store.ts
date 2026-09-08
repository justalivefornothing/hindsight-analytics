import { create } from 'zustand'
import type { AnalyticsEvent } from '../recorder/types'
import type { SessionSummary } from '../analytics/session'
import type { FeatureFlag } from '../analytics/flags'
import type { FunnelDefinition } from '../analytics/funnel'
import {
  bootstrapDatabase,
  clearData,
  deleteFlag,
  deleteFunnel,
  deleteSession,
  listEvents,
  listFlags,
  listFunnels,
  listSessions,
  putFlag,
  putFunnel,
  seedDatabase,
  subscribe,
} from '../storage'
import type { BusMessage } from '../storage'
import { getDistinctId, rotateDistinctId } from '../storage/identity'

export type Theme = 'light' | 'dark'

const THEME_KEY = 'hindsight:theme'
const MAX_EVENTS_IN_MEMORY = 25_000

function readTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_KEY)
    if (stored === 'dark' || stored === 'light') return stored
  } catch {
    /* ignore */
  }
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark')
  try {
    localStorage.setItem(THEME_KEY, theme)
  } catch {
    /* ignore */
  }
}

export interface Toast {
  id: number
  message: string
  tone: 'info' | 'success' | 'error'
}

export interface DashboardState {
  theme: Theme
  ready: boolean
  loading: boolean
  seeding: boolean
  sessions: SessionSummary[]
  events: AnalyticsEvent[]
  flags: FeatureFlag[]
  funnels: FunnelDefinition[]
  userId: string
  /** id of the session the demo iframe is currently recording */
  liveSessionId: string | null
  toasts: Toast[]

  boot(): Promise<void>
  reload(): Promise<void>
  toggleTheme(): void
  seed(): Promise<void>
  clearAll(): Promise<void>
  removeSession(id: string): Promise<void>
  saveFlag(flag: FeatureFlag): Promise<void>
  removeFlag(key: string): Promise<void>
  saveFunnel(funnel: FunnelDefinition): Promise<void>
  removeFunnel(id: string): Promise<void>
  rotateUser(): void
  setLiveSession(id: string | null): void
  toast(message: string, tone?: Toast['tone']): void
  dismissToast(id: number): void
  handleBus(msg: BusMessage): void
}

let toastSeq = 0
let refetchTimer: ReturnType<typeof setTimeout> | null = null
let unsubscribeBus: (() => void) | null = null

export const useDashboard = create<DashboardState>((set, get) => ({
  theme: readTheme(),
  ready: false,
  loading: false,
  seeding: false,
  sessions: [],
  events: [],
  flags: [],
  funnels: [],
  userId: getDistinctId(),
  liveSessionId: null,
  toasts: [],

  async boot() {
    applyTheme(get().theme)
    if (!unsubscribeBus) unsubscribeBus = subscribe((msg) => get().handleBus(msg))
    const info = await bootstrapDatabase()
    set({ flags: info.flags, funnels: info.funnels })
    if (info.sessionCount === 0 && !info.seededAt) {
      set({ seeding: true })
      const stats = await seedDatabase({ flags: info.flags })
      set({ seeding: false })
      get().toast(`Seeded ${stats.users} synthetic users, ${stats.sessions} sessions and ${stats.events} events`, 'success')
    }
    await get().reload()
    set({ ready: true })
  },

  async reload() {
    set({ loading: true })
    const [sessions, events, flags, funnels] = await Promise.all([
      listSessions(2000),
      listEvents({ limit: MAX_EVENTS_IN_MEMORY }),
      listFlags(),
      listFunnels(),
    ])
    set({ sessions, events, flags, funnels, loading: false })
  },

  toggleTheme() {
    const theme: Theme = get().theme === 'dark' ? 'light' : 'dark'
    applyTheme(theme)
    set({ theme })
  },

  async seed() {
    if (get().seeding) return
    set({ seeding: true })
    try {
      const stats = await seedDatabase()
      await get().reload()
      get().toast(`Added ${stats.users} synthetic users and ${stats.events} events`, 'success')
    } catch (err) {
      get().toast(`Seeding failed: ${String(err)}`, 'error')
    } finally {
      set({ seeding: false })
    }
  },

  async clearAll() {
    await clearData()
    await get().reload()
    get().toast('Cleared all sessions and events', 'info')
  },

  async removeSession(id) {
    await deleteSession(id)
    set((s) => ({ sessions: s.sessions.filter((x) => x.id !== id), events: s.events.filter((e) => e.sessionId !== id) }))
  },

  async saveFlag(flag) {
    await putFlag(flag)
    set((s) => {
      const others = s.flags.filter((f) => f.key !== flag.key)
      return { flags: [...others, flag].sort((a, b) => a.createdAt - b.createdAt) }
    })
  },

  async removeFlag(key) {
    await deleteFlag(key)
    set((s) => ({ flags: s.flags.filter((f) => f.key !== key) }))
  },

  async saveFunnel(funnel) {
    await putFunnel(funnel)
    set((s) => ({ funnels: [...s.funnels.filter((f) => f.id !== funnel.id), funnel] }))
  },

  async removeFunnel(id) {
    await deleteFunnel(id)
    set((s) => ({ funnels: s.funnels.filter((f) => f.id !== id) }))
  },

  rotateUser() {
    const userId = rotateDistinctId()
    set({ userId })
    get().toast(`Now browsing as ${userId}`, 'info')
  },

  setLiveSession(id) {
    set({ liveSessionId: id })
  },

  toast(message, tone = 'info') {
    const id = ++toastSeq
    set((s) => ({ toasts: [...s.toasts, { id, message, tone }] }))
    setTimeout(() => get().dismissToast(id), 4200)
  },

  dismissToast(id) {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
  },

  handleBus(msg) {
    switch (msg.kind) {
      case 'events':
        set((s) => {
          const seen = new Set(msg.events.map((e) => e.id))
          const rest = s.events.filter((e) => !seen.has(e.id))
          const merged = [...msg.events.slice().sort((a, b) => b.ts - a.ts), ...rest]
          return { events: merged.slice(0, MAX_EVENTS_IN_MEMORY) }
        })
        break
      case 'session':
        set((s) => {
          const idx = s.sessions.findIndex((x) => x.id === msg.session.id)
          if (idx < 0) return { sessions: [msg.session, ...s.sessions] }
          const next = s.sessions.slice()
          next[idx] = msg.session
          return { sessions: next }
        })
        break
      case 'flags':
        listFlags().then((flags) => set({ flags }))
        break
      case 'identity':
        set({ userId: msg.userId })
        break
      case 'live':
        set({ liveSessionId: msg.sessionId })
        break
      case 'reset':
        if (refetchTimer) clearTimeout(refetchTimer)
        refetchTimer = setTimeout(() => {
          refetchTimer = null
          get().reload()
        }, 200)
        break
    }
  },
}))

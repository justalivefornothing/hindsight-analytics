import { publish } from './bus'

const KEY = 'hindsight:distinct_id'

function randomId(): string {
  const bytes = new Uint8Array(4)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(bytes)
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256)
  return 'usr_' + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('').slice(0, 6)
}

/** The current visitor id shared by the dashboard and the demo store. */
export function getDistinctId(): string {
  try {
    const existing = localStorage.getItem(KEY)
    if (existing) return existing
    const fresh = randomId()
    localStorage.setItem(KEY, fresh)
    return fresh
  } catch {
    return 'usr_anon'
  }
}

export function setDistinctId(id: string): void {
  try {
    localStorage.setItem(KEY, id)
  } catch {
    /* storage unavailable */
  }
  publish({ kind: 'identity', userId: id })
}

export function rotateDistinctId(): string {
  const id = randomId()
  setDistinctId(id)
  return id
}

export function newSessionId(): string {
  const bytes = new Uint8Array(6)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(bytes)
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256)
  return 'ses_' + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

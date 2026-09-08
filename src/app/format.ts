export function formatNumber(n: number): string {
  return new Intl.NumberFormat('en-US').format(n)
}

export function compactNumber(n: number): string {
  if (Math.abs(n) < 1000) return String(n)
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n)
}

export function percent(fraction: number, digits = 0): string {
  return `${(fraction * 100).toFixed(digits)}%`
}

export function relativeTime(ts: number, now = Date.now()): string {
  const diff = now - ts
  const s = Math.round(diff / 1000)
  if (s < 45) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.round(h / 24)
  if (d < 14) return `${d}d ago`
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function formatDateTime(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', second: '2-digit' })
}

export function formatMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`
  const total = Math.round(ms / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  if (m === 0) return `${s}s`
  if (m < 60) return `${m}m ${s.toString().padStart(2, '0')}s`
  const h = Math.floor(m / 60)
  return `${h}h ${(m % 60).toString().padStart(2, '0')}m`
}

export function shortId(id: string, keep = 6): string {
  const i = id.indexOf('_')
  const tail = i >= 0 ? id.slice(i + 1) : id
  return tail.length > keep ? tail.slice(0, keep) : tail
}

/** Convert a full URL into a short path for tables. */
export function shortPath(url: string): string {
  try {
    const u = new URL(url)
    return u.pathname.replace(/^\/demo\/store/, '/store') + u.search
  } catch {
    return url
  }
}

export function truncate(text: string, max = 40): string {
  return text.length > max ? text.slice(0, max - 1) + '…' : text
}

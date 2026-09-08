import { useEffect, useState, type MouseEvent, type ReactNode } from 'react'

/**
 * A deliberately tiny history router: the dashboard has six routes and the
 * demo store has five, so a full routing library would be more code than this.
 */

const LISTENERS = new Set<() => void>()

export interface Location {
  pathname: string
  search: string
  query: URLSearchParams
}

function read(): Location {
  const { pathname, search } = window.location
  return { pathname: pathname.replace(/\/+$/, '') || '/', search, query: new URLSearchParams(search) }
}

export function navigate(to: string, options: { replace?: boolean } = {}): void {
  const current = window.location.pathname + window.location.search
  if (current === to) return
  if (options.replace) window.history.replaceState(null, '', to)
  else window.history.pushState(null, '', to)
  for (const l of LISTENERS) l()
}

export function useLocation(): Location {
  const [loc, setLoc] = useState<Location>(read)
  useEffect(() => {
    const update = () => setLoc(read())
    LISTENERS.add(update)
    window.addEventListener('popstate', update)
    return () => {
      LISTENERS.delete(update)
      window.removeEventListener('popstate', update)
    }
  }, [])
  return loc
}

/** Match `/replays/:id` style patterns. Returns params or null. */
export function matchPath(pattern: string, pathname: string): Record<string, string> | null {
  const p = pattern.split('/').filter(Boolean)
  const a = pathname.split('/').filter(Boolean)
  if (p[p.length - 1] === '*') {
    if (a.length < p.length - 1) return null
  } else if (p.length !== a.length) {
    return null
  }
  const params: Record<string, string> = {}
  for (let i = 0; i < p.length; i++) {
    if (p[i] === '*') break
    if (p[i].startsWith(':')) params[p[i].slice(1)] = decodeURIComponent(a[i])
    else if (p[i] !== a[i]) return null
  }
  return params
}

interface LinkProps {
  to: string
  children: ReactNode
  className?: string
  title?: string
  'aria-current'?: 'page' | undefined
  'aria-label'?: string
  onClick?: () => void
  'data-track'?: string
}

export function Link({ to, children, onClick, ...rest }: LinkProps) {
  const handle = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    onClick?.()
    navigate(to)
  }
  return (
    <a href={to} onClick={handle} {...rest}>
      {children}
    </a>
  )
}

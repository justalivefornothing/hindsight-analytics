import { useEffect, useState, type ReactNode } from 'react'
import { Link, useLocation } from '../router'
import { useDashboard } from '../store'
import {
  IconClose,
  IconEvents,
  IconFlag,
  IconFunnel,
  IconMenu,
  IconMoon,
  IconReplay,
  IconSeed,
  IconStore,
  IconSun,
  IconUser,
  Logo,
} from './icons'
import { Spinner } from './ui'

const NAV = [
  { to: '/replays', label: 'Replays', icon: IconReplay, match: /^\/replays/ },
  { to: '/events', label: 'Events', icon: IconEvents, match: /^\/events/ },
  { to: '/funnels', label: 'Funnels', icon: IconFunnel, match: /^\/funnels/ },
  { to: '/flags', label: 'Flags', icon: IconFlag, match: /^\/flags/ },
  { to: '/demo', label: 'Demo App', icon: IconStore, match: /^\/demo/ },
]

export function Layout({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  const loc = useLocation()
  const [open, setOpen] = useState(false)
  const theme = useDashboard((s) => s.theme)
  const toggleTheme = useDashboard((s) => s.toggleTheme)
  const seed = useDashboard((s) => s.seed)
  const seeding = useDashboard((s) => s.seeding)
  const userId = useDashboard((s) => s.userId)
  const sessions = useDashboard((s) => s.sessions.length)
  const events = useDashboard((s) => s.events.length)

  useEffect(() => setOpen(false), [loc.pathname])

  const nav = (
    <nav aria-label="Primary" className="flex flex-col gap-0.5">
      {NAV.map((item) => {
        const active = item.match.test(loc.pathname)
        const Icon = item.icon
        return (
          <Link key={item.to} to={item.to} className="nav-item" aria-current={active ? 'page' : undefined}>
            <Icon size={17} />
            {item.label}
          </Link>
        )
      })}
    </nav>
  )

  const footer = (
    <div className="mt-auto flex flex-col gap-3 border-t border-line pt-4">
      <div className="flex items-center gap-2 px-1 text-xs text-ink-3">
        <IconUser size={14} />
        <span className="truncate font-mono text-ink-2" title="Your visitor id in the demo store">
          {userId}
        </span>
      </div>
      <div className="px-1 text-[11px] text-ink-3">
        {sessions.toLocaleString()} sessions · {events.toLocaleString()} events · stored locally
      </div>
      <div className="flex items-center gap-2">
        <button type="button" className="btn-secondary h-8 flex-1 text-xs" onClick={() => seed()} disabled={seeding}>
          {seeding ? <Spinner /> : <IconSeed size={14} />}
          Seed sample data
        </button>
        <button
          type="button"
          className="btn-secondary h-8 w-8 px-0"
          onClick={toggleTheme}
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
        >
          {theme === 'dark' ? <IconSun size={15} /> : <IconMoon size={15} />}
        </button>
      </div>
    </div>
  )

  return (
    <div className="flex min-h-dvh bg-canvas text-ink">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-[232px] shrink-0 flex-col border-r border-line bg-card px-3 py-4 md:flex">
        <Link to="/replays" className="mb-6 flex items-center gap-2.5 px-1.5" aria-label="Hindsight home">
          <Logo size={28} />
          <span className="text-[15px] font-semibold tracking-[-0.01em]">Hindsight</span>
        </Link>
        {nav}
        {footer}
      </aside>

      {/* Mobile header */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-card px-3 md:hidden">
          <Link to="/replays" className="flex items-center gap-2" aria-label="Hindsight home">
            <Logo size={26} />
            <span className="text-[15px] font-semibold">Hindsight</span>
          </Link>
          <button
            type="button"
            className="btn-ghost h-9 w-9 px-0"
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <IconClose size={18} /> : <IconMenu size={18} />}
          </button>
        </header>
        {open ? (
          <div className="fixed inset-x-0 top-14 z-20 flex flex-col gap-4 border-b border-line bg-card p-3 shadow-pop md:hidden">
            {nav}
            {footer}
          </div>
        ) : null}

        <main className={`mx-auto w-full flex-1 px-4 py-6 sm:px-6 lg:px-8 ${wide ? 'max-w-[1600px]' : 'max-w-[1200px]'}`}>
          {children}
        </main>
      </div>
    </div>
  )
}

export function Toasts() {
  const toasts = useDashboard((s) => s.toasts)
  const dismiss = useDashboard((s) => s.dismissToast)
  if (!toasts.length) return null
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`hs-fade-up pointer-events-auto flex max-w-lg items-center gap-3 rounded-lg border px-4 py-2.5 text-sm shadow-pop ${
            t.tone === 'error'
              ? 'border-bad/30 bg-card text-bad'
              : t.tone === 'success'
                ? 'border-good/30 bg-card text-ink'
                : 'border-line bg-card text-ink'
          }`}
        >
          <span className={`size-2 shrink-0 rounded-full ${t.tone === 'error' ? 'bg-bad' : t.tone === 'success' ? 'bg-good' : 'bg-primary'}`} />
          <span>{t.message}</span>
          <button type="button" className="btn-ghost -mr-2 h-7 w-7 px-0" onClick={() => dismiss(t.id)} aria-label="Dismiss">
            <IconClose size={14} />
          </button>
        </div>
      ))}
    </div>
  )
}

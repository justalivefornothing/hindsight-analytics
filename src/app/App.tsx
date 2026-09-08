import { useEffect, type ReactNode } from 'react'
import { Layout, Toasts } from './components/Layout'
import { Logo } from './components/icons'
import { Spinner } from './components/ui'
import { matchPath, navigate, useLocation } from './router'
import { useDashboard } from './store'
import { ReplaysPage } from './pages/ReplaysPage'
import { ReplayPage } from './pages/ReplayPage'
import { EventsPage } from './pages/EventsPage'
import { FunnelsPage } from './pages/FunnelsPage'
import { FlagsPage } from './pages/FlagsPage'
import { DemoPage } from './pages/DemoPage'
import { NotFoundPage } from './pages/NotFoundPage'

export function App() {
  const loc = useLocation()
  const ready = useDashboard((s) => s.ready)
  const seeding = useDashboard((s) => s.seeding)
  const boot = useDashboard((s) => s.boot)

  useEffect(() => {
    void boot()
  }, [boot])

  useEffect(() => {
    if (loc.pathname === '/') navigate('/replays', { replace: true })
  }, [loc.pathname])

  if (!ready) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-canvas text-ink">
        <Logo size={40} />
        <div className="flex items-center gap-2 text-sm text-ink-2">
          <Spinner />
          {seeding ? 'Seeding 200 synthetic shoppers…' : 'Opening local database…'}
        </div>
      </div>
    )
  }

  let params: Record<string, string> | null
  let page: ReactNode
  let wide = false
  if (loc.pathname === '/replays' || loc.pathname === '/') page = <ReplaysPage />
  else if ((params = matchPath('/replays/:id', loc.pathname))) {
    page = <ReplayPage id={params.id} key={params.id} />
    wide = true
  } else if (loc.pathname === '/events') {
    page = <EventsPage />
    wide = true
  } else if (loc.pathname === '/funnels') page = <FunnelsPage />
  else if (loc.pathname === '/flags') page = <FlagsPage />
  else if (loc.pathname === '/demo') {
    page = <DemoPage />
    wide = true
  } else page = <NotFoundPage />

  return (
    <>
      <Layout wide={wide}>{page}</Layout>
      <Toasts />
    </>
  )
}

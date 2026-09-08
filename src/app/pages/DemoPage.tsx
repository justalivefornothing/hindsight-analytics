import { useEffect, useMemo, useState } from 'react'
import { useDashboard } from '../store'
import { Link } from '../router'
import { Card, Chip, PageHeader, SegmentedControl } from '../components/ui'
import { IconExternal, IconPlay, IconRefresh, IconUser } from '../components/icons'
import { eventTone, prettyEventName } from '../eventStyle'
import { formatMs, formatTime, shortPath } from '../format'
import { useNow } from '../hooks'
import { evaluateFlags } from '../../analytics/flags'

type Device = 'desktop' | 'mobile'

/**
 * The storefront runs in a same-origin iframe. It records *itself* (the
 * recorder is booted inside that window) and streams chunks to IndexedDB;
 * this page just listens on the broadcast bus and shows what arrives.
 */
export function DemoPage() {
  const liveId = useDashboard((s) => s.liveSessionId)
  const sessions = useDashboard((s) => s.sessions)
  const events = useDashboard((s) => s.events)
  const flags = useDashboard((s) => s.flags)
  const userId = useDashboard((s) => s.userId)
  const rotateUser = useDashboard((s) => s.rotateUser)
  const setLiveSession = useDashboard((s) => s.setLiveSession)
  const [frameKey, setFrameKey] = useState(0)
  const [device, setDevice] = useState<Device>('desktop')
  const now = useNow(1000)

  const live = liveId ? sessions.find((s) => s.id === liveId) ?? null : null
  const liveEvents = useMemo(() => (liveId ? events.filter((e) => e.sessionId === liveId).slice(0, 60) : []), [events, liveId])
  const activeFlags = useMemo(() => evaluateFlags(flags, userId), [flags, userId])
  const currentUrl = liveEvents.find((e) => e.name === '$pageview')?.props.$current_url

  // Leaving the page unmounts the iframe, which ends the session.
  useEffect(() => () => setLiveSession(null), [setLiveSession])

  const reload = () => setFrameKey((k) => k + 1)
  const elapsed = live ? Math.max(live.durationMs, now - live.startedAt) : 0

  return (
    <>
      <PageHeader
        title="Demo app"
        description={
          <>
            Northlight Supply is a small storefront bundled with this project. Click around it: every DOM mutation, click, scroll and keystroke is
            recorded locally and shows up under <Link to="/replays" className="text-primary underline-offset-2 hover:underline">Replays</Link> a few
            seconds later.
          </>
        }
        actions={
          <>
            <SegmentedControl
              label="Viewport"
              value={device}
              onChange={(d) => {
                setDevice(d)
                reload()
              }}
              options={[
                { value: 'desktop', label: 'Desktop' },
                { value: 'mobile', label: 'Mobile' },
              ]}
            />
            <button type="button" className="btn-secondary" onClick={reload} title="Reload the store to start a fresh session">
              <IconRefresh size={15} />
              New session
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                rotateUser()
                reload()
              }}
              title="Become a different visitor (re-rolls feature flags)"
            >
              <IconUser size={15} />
              New visitor
            </button>
            <a href="/demo/store" target="_blank" rel="noopener" className="btn-ghost" title="Open the store in its own tab">
              <IconExternal size={15} />
              Open in tab
            </a>
          </>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="card overflow-hidden">
          <div className="flex h-10 items-center gap-2 border-b border-line bg-card-2 px-3">
            <span className="flex gap-1.5" aria-hidden="true">
              <span className="size-2.5 rounded-full bg-line" />
              <span className="size-2.5 rounded-full bg-line" />
              <span className="size-2.5 rounded-full bg-line" />
            </span>
            <div className="mx-auto flex h-6 max-w-md flex-1 items-center justify-center gap-2 rounded-md border border-line bg-card px-3 font-mono text-[11px] text-ink-3">
              {liveId ? <span className="hs-rec-dot size-1.5 rounded-full bg-bad" /> : null}
              <span className="truncate">{typeof currentUrl === 'string' ? shortPath(currentUrl).replace(/^\/store/, 'northlight.demo') : 'northlight.demo'}</span>
            </div>
          </div>
          <div className="flex justify-center bg-[repeating-linear-gradient(45deg,var(--line-2)_0_6px,transparent_6px_12px)] p-0 sm:p-4">
            <iframe
              key={frameKey}
              src="/demo/store"
              title="Northlight Supply demo store"
              className={`block h-[72dvh] min-h-[560px] border-0 bg-white ${device === 'mobile' ? 'w-[390px] max-w-full rounded-[28px] border-8 border-ink/90 shadow-pop' : 'w-full sm:rounded-lg sm:shadow-pop'}`}
            />
          </div>
        </div>

        <aside className="flex flex-col gap-4">
          <Card>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-ink">Live session</h2>
              {liveId ? (
                <Chip tone="bad" className="gap-1">
                  <span className="hs-rec-dot size-1.5 rounded-full bg-bad" />
                  Recording
                </Chip>
              ) : (
                <Chip tone="neutral">Waiting</Chip>
              )}
            </div>
            {live ? (
              <>
                <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg bg-card-2 p-2">
                    <dt className="text-[11px] text-ink-3">Elapsed</dt>
                    <dd className="font-mono text-sm font-medium text-ink tabular-nums">{formatMs(elapsed)}</dd>
                  </div>
                  <div className="rounded-lg bg-card-2 p-2">
                    <dt className="text-[11px] text-ink-3">Events</dt>
                    <dd className="font-mono text-sm font-medium text-ink tabular-nums">{live.eventCount}</dd>
                  </div>
                  <div className="rounded-lg bg-card-2 p-2">
                    <dt className="text-[11px] text-ink-3">Pages</dt>
                    <dd className="font-mono text-sm font-medium text-ink tabular-nums">{live.pageCount}</dd>
                  </div>
                </dl>
                <p className="mt-3 truncate font-mono text-[11px] text-ink-3" title={live.id}>
                  {live.id} · {live.chunkCount} chunks
                </p>
                <Link to={`/replays/${live.id}`} className="btn-primary mt-3 w-full">
                  <IconPlay size={15} />
                  Watch this session
                </Link>
              </>
            ) : (
              <p className="mt-2 text-sm text-ink-2">The store is starting its recorder. Interact with it and the session will appear here.</p>
            )}
          </Card>

          <Card>
            <h2 className="text-sm font-semibold text-ink">Flags for {userId}</h2>
            <ul className="mt-2 space-y-1.5">
              {flags.map((f) => (
                <li key={f.key} className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate font-mono text-[12px] text-ink-2">{f.key}</span>
                  <Chip tone={activeFlags[f.key] ? 'good' : 'neutral'}>{activeFlags[f.key] ? 'on' : 'off'}</Chip>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-ink-3">
              Deterministic per visitor: the same id always lands in the same bucket. Use <em>New visitor</em> to re-roll.
            </p>
          </Card>

          <Card padded={false} className="flex min-h-0 flex-1 flex-col">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <h2 className="text-sm font-semibold text-ink">Live events</h2>
              <span className="text-xs text-ink-3">{liveEvents.length}</span>
            </div>
            <ul className="scroll-thin max-h-[420px] flex-1 overflow-y-auto" aria-live="polite">
              {liveEvents.length === 0 ? (
                <li className="px-4 py-6 text-center text-sm text-ink-3">No events yet</li>
              ) : (
                liveEvents.map((e) => (
                  <li key={e.id} className="hs-fade-up flex items-center gap-3 border-b border-line-2 px-4 py-2 text-sm last:border-b-0">
                    <Chip tone={eventTone(e.name)}>{prettyEventName(e.name)}</Chip>
                    <span className="min-w-0 flex-1 truncate text-xs text-ink-2">
                      {typeof e.props.$el_text === 'string' && e.props.$el_text
                        ? e.props.$el_text
                        : typeof e.props.$pathname === 'string'
                          ? shortPath(String(e.props.$current_url))
                          : ''}
                    </span>
                    <span className="font-mono text-[11px] text-ink-3 tabular-nums">{formatTime(e.ts)}</span>
                  </li>
                ))
              )}
            </ul>
          </Card>
        </aside>
      </div>
    </>
  )
}

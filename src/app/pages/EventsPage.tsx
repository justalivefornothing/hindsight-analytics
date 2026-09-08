import { useEffect, useMemo, useState } from 'react'
import type { AnalyticsEvent, PropValue } from '../../recorder/types'
import { useDashboard } from '../store'
import { Link } from '../router'
import { Card, Chip, EmptyState, PageHeader, StatTile } from '../components/ui'
import { IconClose, IconEvents, IconPlay, IconSearch } from '../components/icons'
import { eventColor, eventTone, prettyEventName } from '../eventStyle'
import { useDebounced } from '../hooks'
import { compactNumber, formatDateTime, formatNumber, formatTime, shortPath } from '../format'
import { formatClock } from '../../replayer/timeline'
import { eventNames } from '../../storage'

const PAGE = 100

export function EventsPage() {
  const events = useDashboard((s) => s.events)
  const sessions = useDashboard((s) => s.sessions)
  const liveId = useDashboard((s) => s.liveSessionId)
  const [query, setQuery] = useState('')
  const [names, setNames] = useState<Set<string>>(new Set())
  const [onlyRecorded, setOnlyRecorded] = useState(false)
  const [selected, setSelected] = useState<AnalyticsEvent | null>(null)
  const [limit, setLimit] = useState(PAGE)
  const q = useDebounced(query.trim().toLowerCase(), 120)

  const allNames = useMemo(() => eventNames(events), [events])
  const recordedIds = useMemo(() => new Set(sessions.filter((s) => s.hasRecording).map((s) => s.id)), [sessions])

  const filtered = useMemo(() => {
    let list = events
    if (names.size) list = list.filter((e) => names.has(e.name))
    if (onlyRecorded) list = list.filter((e) => recordedIds.has(e.sessionId))
    if (q) {
      list = list.filter((e) => {
        if (e.name.toLowerCase().includes(q) || e.userId.toLowerCase().includes(q) || e.sessionId.toLowerCase().includes(q)) return true
        for (const k in e.props) {
          const v = e.props[k]
          if (typeof v === 'string' && v.toLowerCase().includes(q)) return true
          if (typeof v === 'number' && String(v).includes(q)) return true
        }
        return false
      })
    }
    return list
  }, [events, names, onlyRecorded, q, recordedIds])

  useEffect(() => setLimit(PAGE), [q, names, onlyRecorded])

  const toggleName = (n: string) =>
    setNames((prev) => {
      const next = new Set(prev)
      if (next.has(n)) next.delete(n)
      else next.add(n)
      return next
    })

  const users = useMemo(() => new Set(events.map((e) => e.userId)).size, [events])
  const lastHour = useMemo(() => {
    const cutoff = Date.now() - 3_600_000
    let n = 0
    for (const e of events) {
      if (e.ts < cutoff) break
      n++
    }
    return n
  }, [events])
  const rage = useMemo(() => events.filter((e) => e.name === '$rageclick').length, [events])

  return (
    <>
      <PageHeader
        title="Events"
        description="Every autocaptured and custom event, live. Autocapture derives $pageview, $click, $input and $rageclick from the recording stream; the store calls capture() for business events."
        actions={
          liveId ? (
            <Chip tone="bad" className="gap-1.5">
              <span className="hs-rec-dot size-1.5 rounded-full bg-bad" />
              Live session streaming
            </Chip>
          ) : null
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Events" value={formatNumber(events.length)} hint={`${formatNumber(allNames.length)} distinct names`} />
        <StatTile label="Users" value={formatNumber(users)} hint="distinct visitor ids" />
        <StatTile label="Last hour" value={compactNumber(lastHour)} hint="events received" accent="good" />
        <StatTile label="Rage clicks" value={formatNumber(rage)} hint="3+ clicks in one spot" accent="bad" />
      </div>

      <div className="mb-3 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative flex-1 min-w-[200px] max-w-md">
            <IconSearch size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" />
            <input
              type="search"
              className="field w-full pl-9"
              placeholder="Search events, users, properties…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search events"
            />
          </label>
          <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-line bg-card px-3 text-sm text-ink-2 select-none">
            <input type="checkbox" className="accent-primary" checked={onlyRecorded} onChange={(e) => setOnlyRecorded(e.target.checked)} />
            Only sessions with replays
          </label>
          <span className="ml-auto text-xs text-ink-3">
            {formatNumber(filtered.length)} of {formatNumber(events.length)}
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by event name">
          {allNames.slice(0, 14).map((n) => {
            const on = names.has(n)
            return (
              <button
                key={n}
                type="button"
                onClick={() => toggleName(n)}
                aria-pressed={on}
                className={`chip border transition-colors ${on ? 'border-transparent bg-ink text-card' : 'border-line bg-card text-ink-2 hover:border-ink-3 hover:text-ink'}`}
              >
                <span className="size-1.5 rounded-full" style={{ background: eventColor(n) }} aria-hidden="true" />
                {prettyEventName(n)}
              </button>
            )
          })}
          {names.size ? (
            <button type="button" className="chip text-ink-3 hover:text-ink" onClick={() => setNames(new Set())}>
              <IconClose size={12} /> Clear
            </button>
          ) : null}
        </div>
      </div>

      <div className={`grid gap-4 ${selected ? 'xl:grid-cols-[minmax(0,1fr)_360px]' : ''}`}>
        {filtered.length === 0 ? (
          <EmptyState icon={<IconEvents size={20} />} title="No events match" description="Try a different search, or open the demo app to generate some." />
        ) : (
          <div className="card overflow-hidden">
            <div className="scroll-thin overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-line bg-card-2">
                    <th className="table-head px-4 py-2.5">Time</th>
                    <th className="table-head px-3 py-2.5">Event</th>
                    <th className="table-head px-3 py-2.5">Visitor</th>
                    <th className="table-head px-3 py-2.5">Page</th>
                    <th className="table-head px-3 py-2.5">Details</th>
                    <th className="table-head px-3 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice(0, limit).map((e) => {
                    const active = selected?.id === e.id
                    return (
                      <tr
                        key={e.id}
                        className={`row-hover cursor-pointer border-b border-line-2 last:border-b-0 ${active ? 'bg-primary-soft/60' : ''}`}
                        onClick={() => setSelected(active ? null : e)}
                        tabIndex={0}
                        onKeyDown={(k) => {
                          if (k.key === 'Enter') setSelected(active ? null : e)
                        }}
                        aria-selected={active}
                      >
                        <td className="px-4 py-2 align-middle font-mono text-[12px] text-ink-2 tabular-nums whitespace-nowrap" title={formatDateTime(e.ts)}>
                          {formatTime(e.ts)}
                        </td>
                        <td className="px-3 py-2 align-middle">
                          <Chip tone={eventTone(e.name)}>{prettyEventName(e.name)}</Chip>
                        </td>
                        <td className="px-3 py-2 align-middle font-mono text-[12px] text-ink-2">
                          <span className="inline-flex items-center gap-1.5">
                            {e.userId}
                            {recordedIds.has(e.sessionId) ? <span className="size-1.5 rounded-full bg-accent" title="Has a replay" /> : null}
                          </span>
                        </td>
                        <td className="max-w-[180px] truncate px-3 py-2 align-middle text-xs text-ink-2">{typeof e.props.$current_url === 'string' ? shortPath(e.props.$current_url) : ''}</td>
                        <td className="max-w-[260px] truncate px-3 py-2 align-middle text-xs text-ink-2">{summarize(e)}</td>
                        <td className="px-3 py-2 text-right align-middle">
                          {recordedIds.has(e.sessionId) ? (
                            <Link to={`/replays/${e.sessionId}?t=${Math.max(0, Math.round(e.t - 1500))}`} className="btn-ghost h-7 px-2 text-xs" aria-label="Watch replay at this moment" onClick={() => undefined}>
                              <IconPlay size={12} />
                              {formatClock(e.t)}
                            </Link>
                          ) : null}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {filtered.length > limit ? (
              <div className="flex justify-center border-t border-line p-3">
                <button type="button" className="btn-secondary h-8 text-xs" onClick={() => setLimit((l) => l + PAGE)}>
                  Show more ({formatNumber(filtered.length - limit)} remaining)
                </button>
              </div>
            ) : null}
          </div>
        )}

        {selected ? <Inspector event={selected} hasReplay={recordedIds.has(selected.sessionId)} onClose={() => setSelected(null)} /> : null}
      </div>
    </>
  )
}

function summarize(e: AnalyticsEvent): string {
  const p = e.props
  if (typeof p.$el_text === 'string' && p.$el_text) return `${p.$el_tag ?? ''} “${p.$el_text}”`.trim()
  if (e.name === '$pageview' && typeof p.$title === 'string') return p.$title
  if (e.name === '$input') return `${p.$input_type ?? 'field'} · ${p.$value_length ?? 0} chars${p.$masked ? ' · masked' : ''}`
  if (typeof p.product_name === 'string') return `${p.product_name}${typeof p.quantity === 'number' ? ` ×${p.quantity}` : ''}`
  if (typeof p.order_value === 'number') return `$${p.order_value} · ${p.checkout_variant ?? ''}`
  if (typeof p.cart_value === 'number') return `$${p.cart_value} · ${p.items} items`
  const keys = Object.keys(p).filter((k) => !k.startsWith('$'))
  return keys.length ? keys.map((k) => `${k}=${String(p[k])}`).join(' · ') : ''
}

function Inspector({ event: e, hasReplay, onClose }: { event: AnalyticsEvent; hasReplay: boolean; onClose: () => void }) {
  const entries = Object.entries(e.props).sort(([a], [b]) => {
    const as = a.startsWith('$') ? 1 : 0
    const bs = b.startsWith('$') ? 1 : 0
    return as - bs || a.localeCompare(b)
  })
  return (
    <Card padded={false} className="hs-fade-up h-fit xl:sticky xl:top-6">
      <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Chip tone={eventTone(e.name)}>{prettyEventName(e.name)}</Chip>
          </div>
          <p className="mt-1.5 text-xs text-ink-3">
            {formatDateTime(e.ts)} · <span className="font-mono">{e.userId}</span>
          </p>
        </div>
        <button type="button" className="btn-ghost h-7 w-7 px-0" onClick={onClose} aria-label="Close inspector">
          <IconClose size={14} />
        </button>
      </div>
      <div className="px-4 py-3">
        {hasReplay ? (
          <Link to={`/replays/${e.sessionId}?t=${Math.max(0, Math.round(e.t - 1500))}`} className="btn-primary h-8 w-full text-xs">
            <IconPlay size={13} />
            Watch replay at {formatClock(e.t)}
          </Link>
        ) : (
          <p className="rounded-lg bg-card-2 px-3 py-2 text-xs text-ink-3">Synthetic session: events only, no DOM recording.</p>
        )}
      </div>
      <dl className="scroll-thin max-h-[60dvh] overflow-y-auto border-t border-line text-xs">
        <Row k="event" v={e.name} />
        <Row k="session" v={e.sessionId} />
        <Row k="offset" v={`${formatClock(e.t)} (${e.t} ms)`} />
        {entries.map(([k, v]) => (
          <Row key={k} k={k} v={v} />
        ))}
      </dl>
    </Card>
  )
}

function Row({ k, v }: { k: string; v: PropValue }) {
  const isObj = v !== null && typeof v === 'object'
  const type = v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v
  return (
    <div className="grid grid-cols-[130px_1fr] gap-3 border-b border-line-2 px-4 py-2 last:border-b-0">
      <dt className="truncate font-mono text-ink-3" title={k}>
        {k}
      </dt>
      <dd className="min-w-0">
        {isObj ? (
          <pre className="scroll-thin overflow-x-auto rounded bg-card-2 p-2 font-mono text-[11px] text-ink-2">{JSON.stringify(v, null, 2)}</pre>
        ) : (
          <span className={`font-mono break-all ${type === 'string' ? 'text-ink' : type === 'number' ? 'text-primary' : type === 'boolean' ? 'text-accent' : 'text-ink-3'}`}>{String(v)}</span>
        )}
        <span className="ml-2 text-[10px] text-ink-3 uppercase">{type}</span>
      </dd>
    </div>
  )
}

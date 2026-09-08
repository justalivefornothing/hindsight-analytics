import { useMemo, useState } from 'react'
import { useDashboard } from '../store'
import { Link, navigate } from '../router'
import { Chip, EmptyState, PageHeader, SegmentedControl, StatTile } from '../components/ui'
import { HeatmapThumb } from '../components/HeatmapThumb'
import { IconPlay, IconReplay, IconTrash } from '../components/icons'
import { compactNumber, formatMs, formatNumber, relativeTime, shortPath } from '../format'
import type { SessionSummary } from '../../analytics/session'

type Filter = 'all' | 'recorded' | 'synthetic'

export function ReplaysPage() {
  const sessions = useDashboard((s) => s.sessions)
  const events = useDashboard((s) => s.events)
  const liveId = useDashboard((s) => s.liveSessionId)
  const removeSession = useDashboard((s) => s.removeSession)
  const [filter, setFilter] = useState<Filter>('all')
  const [limit, setLimit] = useState(50)

  const filtered = useMemo(() => {
    const list = sessions.filter((s) =>
      filter === 'all' ? true : filter === 'recorded' ? s.hasRecording : !s.hasRecording,
    )
    return list
  }, [sessions, filter])

  const recorded = sessions.filter((s) => s.hasRecording).length
  const avgDuration = sessions.length ? sessions.reduce((a, s) => a + s.durationMs, 0) / sessions.length : 0
  const rageSessions = useMemo(() => new Set(events.filter((e) => e.name === '$rageclick').map((e) => e.sessionId)), [events])

  return (
    <>
      <PageHeader
        title="Session replays"
        description="Every visit to the demo store is recorded as a DOM snapshot plus a mutation stream. Watch any of them back, pixel for pixel."
        actions={
          <Link to="/demo" className="btn-primary">
            <IconReplay size={16} />
            Record a new session
          </Link>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Sessions" value={formatNumber(sessions.length)} hint={`${formatNumber(new Set(sessions.map((s) => s.userId)).size)} distinct users`} />
        <StatTile label="Recorded replays" value={formatNumber(recorded)} hint="with a DOM recording" accent="accent" />
        <StatTile label="Events captured" value={compactNumber(events.length)} hint="autocaptured + custom" />
        <StatTile label="Avg. session" value={formatMs(avgDuration)} hint={`${formatNumber(rageSessions.size)} sessions with rage clicks`} />
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl
          label="Filter sessions"
          value={filter}
          onChange={(v) => {
            setFilter(v)
            setLimit(50)
          }}
          options={[
            { value: 'all', label: `All (${sessions.length})` },
            { value: 'recorded', label: `Recorded (${recorded})` },
            { value: 'synthetic', label: `Synthetic (${sessions.length - recorded})` },
          ]}
        />
        <p className="text-xs text-ink-3">Synthetic sessions come from the seed generator and carry events but no DOM recording.</p>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<IconReplay size={20} />}
          title={filter === 'recorded' ? 'No recorded sessions yet' : 'No sessions'}
          description="Open the demo app, click around for a few seconds and come back. Your session will appear here with a replay."
          action={
            <Link to="/demo" className="btn-primary">
              Open the demo app
            </Link>
          }
        />
      ) : (
        <div className="card overflow-hidden" aria-live="polite">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-line bg-card-2">
                <th className="table-head px-4 py-2.5">Heatmap</th>
                <th className="table-head px-3 py-2.5">Session</th>
                <th className="table-head hidden px-3 py-2.5 md:table-cell">Pages</th>
                <th className="table-head px-3 py-2.5 text-right">Duration</th>
                <th className="table-head px-3 py-2.5 text-right">Events</th>
                <th className="table-head hidden px-3 py-2.5 lg:table-cell">Flags</th>
                <th className="table-head px-3 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, limit).map((s) => (
                <SessionRow key={s.id} session={s} live={s.id === liveId} rage={rageSessions.has(s.id)} onDelete={() => removeSession(s.id)} />
              ))}
            </tbody>
          </table>
          {filtered.length > limit ? (
            <div className="flex justify-center border-t border-line p-3">
              <button type="button" className="btn-secondary h-8 text-xs" onClick={() => setLimit((l) => l + 50)}>
                Show more ({filtered.length - limit} remaining)
              </button>
            </div>
          ) : null}
        </div>
      )}
    </>
  )
}

function SessionRow({ session: s, live, rage, onDelete }: { session: SessionSummary; live: boolean; rage: boolean; onDelete: () => void }) {
  const href = `/replays/${s.id}`
  const activeFlags = Object.entries(s.flags ?? {}).filter(([, on]) => on).map(([k]) => k)
  return (
    <tr
      className="row-hover cursor-pointer border-b border-line-2 last:border-b-0"
      onClick={() => navigate(href)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') navigate(href)
      }}
      tabIndex={0}
      aria-label={`Open replay for ${s.userId}`}
    >
      <td className="w-[88px] px-4 py-2.5 align-middle">
        <HeatmapThumb points={s.clickPoints} viewport={s.viewport} width={64} title={`${s.clickPoints.length} clicks`} />
      </td>
      <td className="px-3 py-2.5 align-middle">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[13px] font-medium text-ink">{s.userId}</span>
          {live ? (
            <Chip tone="bad" className="gap-1">
              <span className="hs-rec-dot size-1.5 rounded-full bg-bad" />
              Live
            </Chip>
          ) : s.hasRecording ? (
            <Chip tone="accent">Recorded</Chip>
          ) : (
            <Chip tone="neutral">Synthetic</Chip>
          )}
          {rage ? <Chip tone="bad">Rage click</Chip> : null}
        </div>
        <div className="mt-0.5 text-xs text-ink-3">
          {relativeTime(s.startedAt)} · {s.viewport.w}×{s.viewport.h}
          {s.urls[0] ? <span className="hidden sm:inline"> · {shortPath(s.urls[0])}</span> : null}
        </div>
      </td>
      <td className="hidden px-3 py-2.5 align-middle text-ink-2 md:table-cell">{s.pageCount}</td>
      <td className="px-3 py-2.5 text-right align-middle font-mono text-[13px] text-ink-2 tabular-nums">{formatMs(s.durationMs)}</td>
      <td className="px-3 py-2.5 text-right align-middle font-mono text-[13px] text-ink-2 tabular-nums">{s.eventCount}</td>
      <td className="hidden px-3 py-2.5 align-middle lg:table-cell">
        <div className="flex flex-wrap gap-1">
          {activeFlags.length ? activeFlags.map((k) => <Chip key={k} tone="primary">{k}</Chip>) : <span className="text-xs text-ink-3">—</span>}
        </div>
      </td>
      <td className="px-3 py-2.5 align-middle">
        <div className="flex items-center justify-end gap-1">
          <Link to={href} className="btn-secondary h-8 px-2.5 text-xs" aria-label="Watch replay" onClick={() => undefined}>
            <IconPlay size={14} />
            <span className="hidden sm:inline">Watch</span>
          </Link>
          <button
            type="button"
            className="btn-ghost h-8 w-8 px-0 text-ink-3 hover:text-bad"
            aria-label="Delete session"
            onClick={(e) => {
              e.stopPropagation()
              onDelete()
            }}
          >
            <IconTrash size={15} />
          </button>
        </div>
      </td>
    </tr>
  )
}

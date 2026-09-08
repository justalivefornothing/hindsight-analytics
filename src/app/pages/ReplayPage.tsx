import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Player } from '../../replayer/player'
import type { PlayerFrame } from '../../replayer/player'
import { collectMarkers, findInactivity, formatClock, inactiveTotal, sortEvents } from '../../replayer/timeline'
import type { AnalyticsEvent, RecordedEvent } from '../../recorder/types'
import type { SessionSummary } from '../../analytics/session'
import { getSession, listSessionEvents, loadRecording, subscribe } from '../../storage'
import { useDashboard } from '../store'
import { Link, useLocation } from '../router'
import { Stage } from '../components/Stage'
import type { Ripple } from '../components/Stage'
import { Timeline } from '../components/Timeline'
import { Card, Chip, EmptyState, Kbd, SegmentedControl, Spinner, Toggle } from '../components/ui'
import { IconArrowLeft, IconPause, IconPlay, IconReplay, IconSkipBack, IconWarning } from '../components/icons'
import { eventTone, prettyEventName } from '../eventStyle'
import { formatDateTime, formatMs, shortPath } from '../format'

type Speed = '0.5' | '1' | '2' | '4'

interface Loaded {
  session: SessionSummary | null
  events: RecordedEvent[]
  analytics: AnalyticsEvent[]
  lastSeq: number
}

export function ReplayPage({ id }: { id: string }) {
  const loc = useLocation()
  const initialT = Number(loc.query.get('t') ?? 0) || 0
  const cached = useDashboard((s) => s.sessions.find((x) => x.id === id))
  const liveId = useDashboard((s) => s.liveSessionId)
  const isLive = liveId === id

  const [data, setData] = useState<Loaded | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([getSession(id), loadRecording(id), listSessionEvents(id)])
      .then(([session, rec, analytics]) => {
        if (cancelled) return
        setData({ session: session ?? cached ?? null, events: rec.events, analytics, lastSeq: rec.lastSeq })
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(String(err))
      })
    return () => {
      cancelled = true
    }
    // The cached summary is only a fallback for first paint.
  }, [id])

  if (error) {
    return <EmptyState icon={<IconWarning size={20} />} title="Could not load this session" description={error} />
  }
  if (!data) {
    return (
      <div className="flex h-[60dvh] items-center justify-center gap-2 text-sm text-ink-2">
        <Spinner /> Loading recording…
      </div>
    )
  }
  if (!data.session) {
    return (
      <EmptyState
        icon={<IconWarning size={20} />}
        title="Session not found"
        description="It may have been deleted, or the database was cleared."
        action={
          <Link to="/replays" className="btn-primary">
            Back to replays
          </Link>
        }
      />
    )
  }
  const hasRecording = data.events.some((e) => e.type === 'snapshot')
  if (!hasRecording) {
    return <SyntheticSession session={data.session} analytics={data.analytics} />
  }
  return <Cinema key={id} id={id} initial={data} initialT={initialT} isLive={isLive} />
}

/* ---------------------------------------------------------------------------- */

function Cinema({ id, initial, initialT, isLive }: { id: string; initial: Loaded; initialT: number; isLive: boolean }) {
  const session = initial.session!
  const [analytics, setAnalytics] = useState(initial.analytics)
  const playerRef = useRef<Player | null>(null)
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const lastSeq = useRef(initial.lastSeq)
  const [frame, setFrame] = useState<PlayerFrame | null>(null)
  const [ripples, setRipples] = useState<Ripple[]>([])
  const rippleSeq = useRef(0)
  const wasPlaying = useRef(false)
  const [speed, setSpeed] = useState<Speed>('1')
  const [skip, setSkip] = useState(true)
  const [markers, setMarkers] = useState(() => collectMarkers(initial.events))
  const [inactivity, setInactivity] = useState(() => findInactivity(sortEvents(initial.events)))

  // Build the player once the iframe document is ready.
  const onFrameReady = useCallback(
    (iframe: HTMLIFrameElement) => {
      iframeRef.current = iframe
      if (playerRef.current) {
        playerRef.current.rebuild()
        return
      }
      const player = new Player({
        getDocument: () => iframeRef.current?.contentDocument ?? null,
        events: initial.events,
        speed: 1,
        skipInactivity: true,
        onFrame: (f) => setFrame(f),
        onClick: (x, y) => {
          const ripple = { id: ++rippleSeq.current, x, y }
          setRipples((r) => [...r, ripple])
          setTimeout(() => setRipples((r) => r.filter((q) => q.id !== ripple.id)), 700)
        },
      })
      playerRef.current = player
      player.seek(Math.min(initialT, player.duration))
      if (initialT <= 0) player.play()
    },
    [initial.events, initialT],
  )

  useEffect(
    () => () => {
      playerRef.current?.destroy()
      playerRef.current = null
    },
    [],
  )

  // Live sessions: pull new chunks as the store writes them.
  useEffect(() => {
    if (!isLive) return
    let timer: ReturnType<typeof setTimeout> | null = null
    const pull = async () => {
      timer = null
      const [rec, events] = await Promise.all([loadRecording(id, lastSeq.current), listSessionEvents(id)])
      if (rec.events.length && playerRef.current) {
        lastSeq.current = rec.lastSeq
        playerRef.current.append(rec.events)
        setMarkers(collectMarkers(playerRef.current.events))
        setInactivity(playerRef.current.inactivity)
      }
      setAnalytics(events)
    }
    const unsub = subscribe((msg) => {
      if (msg.kind === 'session' && msg.session.id === id && timer === null) timer = setTimeout(pull, 250)
      if (msg.kind === 'events' && msg.events.some((e) => e.sessionId === id) && timer === null) timer = setTimeout(pull, 250)
    })
    return () => {
      unsub()
      if (timer) clearTimeout(timer)
    }
  }, [id, isLive])

  // Keyboard: space toggles, arrows seek, 0-9 jump to a percentage.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)) return
      const p = playerRef.current
      if (!p) return
      if (e.key === ' ' || e.key === 'k') {
        e.preventDefault()
        p.toggle()
      } else if (e.key === 'ArrowRight' || e.key === 'l') {
        e.preventDefault()
        p.seek(p.time + (e.shiftKey ? 30_000 : 5_000))
      } else if (e.key === 'ArrowLeft' || e.key === 'j') {
        e.preventDefault()
        p.seek(p.time - (e.shiftKey ? 30_000 : 5_000))
      } else if (/^[0-9]$/.test(e.key)) {
        p.seek((Number(e.key) / 10) * p.duration)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const player = playerRef.current
  const t = frame?.t ?? initialT
  const duration = frame?.duration ?? 0
  const playing = frame?.playing ?? false
  const viewport = frame?.viewport ?? session.viewport
  const inactiveMs = useMemo(() => inactiveTotal(inactivity), [inactivity])
  const activeEventIndex = useMemo(() => {
    let idx = -1
    for (let i = 0; i < analytics.length; i++) if (analytics[i].t <= t) idx = i
    return idx
  }, [analytics, t])
  const inGap = useMemo(() => inactivity.some((s) => t > s.start && t < s.end), [inactivity, t])

  const onSpeed = (s: Speed) => {
    setSpeed(s)
    player?.setSpeed(Number(s))
  }
  const onSkip = (on: boolean) => {
    setSkip(on)
    player?.setSkipInactivity(on)
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Link to="/replays" className="btn-ghost h-8 px-2 text-xs" aria-label="Back to replays">
            <IconArrowLeft size={15} />
            Replays
          </Link>
          <div className="min-w-0">
            <h1 className="flex flex-wrap items-center gap-2 text-lg font-semibold tracking-[-0.01em] text-ink">
              <span className="font-mono">{session.userId}</span>
              {isLive ? (
                <Chip tone="bad" className="gap-1">
                  <span className="hs-rec-dot size-1.5 rounded-full bg-bad" />
                  Live
                </Chip>
              ) : null}
            </h1>
            <p className="truncate text-xs text-ink-3">
              {formatDateTime(session.startedAt)} · {viewport.w}×{viewport.h} · {session.pageCount} {session.pageCount === 1 ? 'page' : 'pages'} · {analytics.length} events
              {inactiveMs > 0 ? ` · ${formatMs(inactiveMs)} idle` : ''}
            </p>
          </div>
        </div>
        <div className="hidden items-center gap-1.5 text-xs text-ink-3 lg:flex">
          <Kbd>Space</Kbd> play/pause <span className="mx-1 text-line">|</span> <Kbd>←</Kbd> <Kbd>→</Kbd> ±5s <span className="mx-1 text-line">|</span> <Kbd>0</Kbd>–<Kbd>9</Kbd> jump
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="card overflow-hidden">
          {/* URL bar */}
          <div className="flex h-10 items-center gap-3 border-b border-line bg-card-2 px-3">
            <span className="flex gap-1.5" aria-hidden="true">
              <span className="size-2.5 rounded-full bg-line" />
              <span className="size-2.5 rounded-full bg-line" />
              <span className="size-2.5 rounded-full bg-line" />
            </span>
            <div className="mx-auto flex h-6 min-w-0 max-w-lg flex-1 items-center justify-center rounded-md border border-line bg-card px-3 font-mono text-[11px] text-ink-2">
              <span className="truncate">{frame?.url ? shortPath(frame.url) : ''}</span>
            </div>
            <span className="hidden font-mono text-[11px] text-ink-3 sm:inline">
              {viewport.w}×{viewport.h}
            </span>
          </div>

          <Stage
            viewport={viewport}
            cursor={frame?.cursor ?? { x: 0, y: 0, visible: false }}
            ripples={ripples}
            onFrameReady={onFrameReady}
            overlay={
              <>
                {!playing && frame && t >= duration && duration > 0 ? (
                  <div className="absolute inset-0 flex items-center justify-center bg-stage/55">
                    <button
                      type="button"
                      className="btn-primary pointer-events-auto h-11 px-5 text-sm shadow-pop"
                      onClick={() => {
                        player?.seek(0)
                        player?.play()
                      }}
                    >
                      <IconSkipBack size={16} />
                      Watch again
                    </button>
                  </div>
                ) : null}
                {inGap && !skip ? (
                  <div className="absolute top-3 left-1/2 -translate-x-1/2 rounded-full bg-stage/80 px-3 py-1 text-xs text-white/80 ring-1 ring-white/10">User is idle</div>
                ) : null}
              </>
            }
          />

          {/* Controls */}
          <div className="border-t border-line px-3 pt-3 pb-3 sm:px-4">
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <button
                type="button"
                className="btn-primary h-9 w-9 px-0"
                onClick={() => player?.toggle()}
                aria-label={playing ? 'Pause' : 'Play'}
                aria-pressed={playing}
              >
                {playing ? <IconPause size={16} /> : <IconPlay size={16} />}
              </button>
              <button type="button" className="btn-ghost h-9 w-9 px-0" onClick={() => player?.seek(0)} aria-label="Restart">
                <IconSkipBack size={16} />
              </button>
              <span className="font-mono text-[13px] text-ink tabular-nums" aria-live="off">
                {formatClock(t)} <span className="text-ink-3">/ {formatClock(duration)}</span>
              </span>
              <div className="ml-auto flex flex-wrap items-center gap-3">
                <SegmentedControl
                  label="Playback speed"
                  value={speed}
                  onChange={onSpeed}
                  size="sm"
                  options={[
                    { value: '0.5', label: '0.5×' },
                    { value: '1', label: '1×' },
                    { value: '2', label: '2×' },
                    { value: '4', label: '4×' },
                  ]}
                />
                <label className="flex items-center gap-2 text-xs text-ink-2 select-none">
                  <Toggle checked={skip} onChange={onSkip} label="Skip inactivity" size="sm" />
                  Skip inactivity
                </label>
              </div>
            </div>
            <div className="mt-2">
              <Timeline
                duration={duration}
                time={t}
                markers={markers}
                inactivity={inactivity}
                onSeek={(v) => player?.seek(v)}
                onScrubStart={() => {
                  wasPlaying.current = player?.isPlaying ?? false
                  player?.pause()
                }}
                onScrubEnd={() => {
                  if (wasPlaying.current) player?.play()
                }}
              />
            </div>
          </div>
        </div>

        <aside className="flex min-h-0 flex-col gap-4">
          <Card>
            <h2 className="text-sm font-semibold text-ink">Session</h2>
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-xs">
              <dt className="text-ink-3">Visitor</dt>
              <dd className="truncate font-mono text-ink">{session.userId}</dd>
              <dt className="text-ink-3">Session</dt>
              <dd className="truncate font-mono text-ink" title={session.id}>
                {session.id}
              </dd>
              <dt className="text-ink-3">Started</dt>
              <dd className="text-ink">{formatDateTime(session.startedAt)}</dd>
              <dt className="text-ink-3">Duration</dt>
              <dd className="text-ink">{formatMs(Math.max(duration, session.durationMs))}</dd>
              <dt className="text-ink-3">Chunks</dt>
              <dd className="text-ink">
                {session.chunkCount} · {initial.events.length.toLocaleString()} replay events
              </dd>
              <dt className="text-ink-3">Flags</dt>
              <dd className="flex flex-wrap gap-1">
                {Object.entries(session.flags ?? {}).filter(([, on]) => on).length ? (
                  Object.entries(session.flags)
                    .filter(([, on]) => on)
                    .map(([k]) => (
                      <Chip key={k} tone="primary">
                        {k}
                      </Chip>
                    ))
                ) : (
                  <span className="text-ink-3">none</span>
                )}
              </dd>
            </dl>
          </Card>

          <Card padded={false} className="flex min-h-0 flex-1 flex-col">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <h2 className="text-sm font-semibold text-ink">Events</h2>
              <span className="text-xs text-ink-3">click to seek</span>
            </div>
            <ol className="scroll-thin max-h-[52dvh] flex-1 overflow-y-auto">
              {analytics.length === 0 ? <li className="px-4 py-6 text-center text-sm text-ink-3">No events captured</li> : null}
              {analytics.map((e, i) => {
                const active = i === activeEventIndex
                const past = e.t <= t
                return (
                  <li key={e.id}>
                    <button
                      type="button"
                      onClick={() => player?.seek(e.t)}
                      className={`row-hover flex w-full items-start gap-3 border-b border-line-2 px-4 py-2 text-left last:border-b-0 ${active ? 'bg-primary-soft/70' : ''}`}
                      aria-current={active ? 'true' : undefined}
                    >
                      <span className={`mt-0.5 font-mono text-[11px] tabular-nums ${past ? 'text-ink-2' : 'text-ink-3'}`}>{formatClock(e.t)}</span>
                      <span className="min-w-0 flex-1">
                        <Chip tone={eventTone(e.name)} className={past ? '' : 'opacity-60'}>
                          {prettyEventName(e.name)}
                        </Chip>
                        <span className="mt-1 block truncate text-xs text-ink-2">
                          {typeof e.props.$el_text === 'string' && e.props.$el_text
                            ? e.props.$el_text
                            : e.name === '$pageview'
                              ? shortPath(String(e.props.$current_url))
                              : typeof e.props.product_name === 'string'
                                ? e.props.product_name
                                : typeof e.props.order_value === 'number'
                                  ? `$${e.props.order_value}`
                                  : ''}
                        </span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ol>
          </Card>
        </aside>
      </div>
    </>
  )
}

/* ---------------------------------------------------------------------------- */

function SyntheticSession({ session, analytics }: { session: SessionSummary; analytics: AnalyticsEvent[] }) {
  return (
    <>
      <div className="mb-4 flex items-center gap-3">
        <Link to="/replays" className="btn-ghost h-8 px-2 text-xs">
          <IconArrowLeft size={15} />
          Replays
        </Link>
        <h1 className="flex items-center gap-2 text-lg font-semibold text-ink">
          <span className="font-mono">{session.userId}</span>
          <Chip tone="neutral">Synthetic</Chip>
        </h1>
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <EmptyState
          icon={<IconReplay size={20} />}
          title="No DOM recording for this session"
          description="Seeded sessions carry analytics events so funnels and the events explorer have data, but only real visits to the demo store produce a pixel-level replay. Open the demo app, click around, and watch yourself back."
          action={
            <Link to="/demo" className="btn-primary">
              Record a real session
            </Link>
          }
        />
        <Card padded={false}>
          <div className="border-b border-line px-4 py-3">
            <h2 className="text-sm font-semibold text-ink">Event timeline</h2>
            <p className="text-xs text-ink-3">
              {formatDateTime(session.startedAt)} · {formatMs(session.durationMs)}
            </p>
          </div>
          <ol className="scroll-thin max-h-[60dvh] overflow-y-auto">
            {analytics.map((e) => (
              <li key={e.id} className="flex items-start gap-3 border-b border-line-2 px-4 py-2 last:border-b-0">
                <span className="mt-0.5 font-mono text-[11px] text-ink-3 tabular-nums">{formatClock(e.t)}</span>
                <span className="min-w-0 flex-1">
                  <Chip tone={eventTone(e.name)}>{prettyEventName(e.name)}</Chip>
                  <span className="mt-1 block truncate text-xs text-ink-2">
                    {typeof e.props.$el_text === 'string' && e.props.$el_text ? e.props.$el_text : e.name === '$pageview' ? shortPath(String(e.props.$current_url)) : typeof e.props.product_name === 'string' ? e.props.product_name : ''}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </Card>
      </div>
    </>
  )
}

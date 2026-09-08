import { useEffect, useMemo, useState } from 'react'
import { computeFunnel, formatDuration } from '../../analytics/funnel'
import type { FilterOp, FunnelDefinition, FunnelStep, PropertyFilter } from '../../analytics/funnel'
import { eventNames } from '../../storage'
import { useDashboard } from '../store'
import { Link } from '../router'
import { FunnelChart } from '../components/FunnelChart'
import { Card, Chip, EmptyState, PageHeader, StatTile } from '../components/ui'
import { IconClose, IconFunnel, IconPlay, IconPlus, IconTrash } from '../components/icons'
import { prettyEventName } from '../eventStyle'
import { formatNumber, percent, relativeTime, shortId } from '../format'
import { formatClock } from '../../replayer/timeline'

const WINDOWS: Array<{ ms: number; label: string }> = [
  { ms: 10 * 60_000, label: '10 minutes' },
  { ms: 30 * 60_000, label: '30 minutes' },
  { ms: 60 * 60_000, label: '1 hour' },
  { ms: 24 * 3_600_000, label: '24 hours' },
  { ms: 7 * 86_400_000, label: '7 days' },
]

const OPS: Array<{ op: FilterOp; label: string }> = [
  { op: 'eq', label: '=' },
  { op: 'neq', label: '≠' },
  { op: 'contains', label: 'contains' },
  { op: 'set', label: 'is set' },
  { op: 'not_set', label: 'is not set' },
]

const MIN_STEPS = 3
const MAX_STEPS = 5

function newId(): string {
  return `fn_${Math.random().toString(36).slice(2, 8)}`
}

export function FunnelsPage() {
  const events = useDashboard((s) => s.events)
  const sessions = useDashboard((s) => s.sessions)
  const funnels = useDashboard((s) => s.funnels)
  const saveFunnel = useDashboard((s) => s.saveFunnel)
  const removeFunnel = useDashboard((s) => s.removeFunnel)
  const toast = useDashboard((s) => s.toast)

  const [draft, setDraft] = useState<FunnelDefinition | null>(null)
  const [selectedDrop, setSelectedDrop] = useState<number | null>(null)

  // Start from the first saved funnel (the seeded storefront funnel).
  useEffect(() => {
    if (!draft && funnels.length) setDraft(structuredClone(funnels[0]))
  }, [funnels, draft])

  const names = useMemo(() => eventNames(events), [events])
  const propKeysByEvent = useMemo(() => {
    const map = new Map<string, Set<string>>()
    for (const e of events) {
      let set = map.get(e.name)
      if (!set) map.set(e.name, (set = new Set()))
      for (const k of Object.keys(e.props)) set.add(k)
    }
    return map
  }, [events])
  const sessionById = useMemo(() => new Map(sessions.map((s) => [s.id, s])), [sessions])

  const result = useMemo(() => {
    if (!draft) return null
    const steps = draft.steps.filter((s) => s.event)
    if (steps.length < 2) return null
    return computeFunnel(events, steps, draft.windowMs)
  }, [draft, events])

  useEffect(() => setSelectedDrop(null), [draft?.steps.length, draft?.id])

  if (!draft) {
    return <EmptyState icon={<IconFunnel size={20} />} title="Loading funnels…" />
  }

  const update = (patch: Partial<FunnelDefinition>) => setDraft({ ...draft, ...patch })
  const updateStep = (i: number, patch: Partial<FunnelStep>) => update({ steps: draft.steps.map((s, j) => (j === i ? { ...s, ...patch } : s)) })
  const isSaved = funnels.some((f) => f.id === draft.id)
  const savedVersion = funnels.find((f) => f.id === draft.id)
  const dirty = !savedVersion || JSON.stringify(savedVersion) !== JSON.stringify(draft)

  const dropped = selectedDrop !== null && result ? result.steps[selectedDrop]?.dropped ?? [] : []
  const dropStep = selectedDrop !== null && result ? result.steps[selectedDrop] : null
  const nextStep = selectedDrop !== null && result ? result.steps[selectedDrop + 1] : null

  return (
    <>
      <PageHeader
        title="Funnels"
        description="Pick 3–5 ordered steps. Conversion is computed per user: steps must happen in order, inside the window measured from the first step. Click a hatched drop-off to see who stalled there."
        actions={
          <>
            <select
              className="field"
              value={draft.id}
              onChange={(e) => {
                const f = funnels.find((x) => x.id === e.target.value)
                if (f) setDraft(structuredClone(f))
              }}
              aria-label="Saved funnels"
            >
              {funnels.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
              {!isSaved ? <option value={draft.id}>{draft.name || 'Untitled funnel'} (unsaved)</option> : null}
            </select>
            <button
              type="button"
              className="btn-secondary"
              onClick={() =>
                setDraft({
                  id: newId(),
                  name: 'New funnel',
                  steps: [{ event: names[0] ?? '$pageview' }, { event: names[1] ?? '$click' }, { event: names[2] ?? '$click' }],
                  windowMs: 30 * 60_000,
                })
              }
            >
              <IconPlus size={15} />
              New
            </button>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
        {/* Builder */}
        <Card className="h-fit lg:sticky lg:top-6">
          <div className="flex items-center justify-between gap-2">
            <input
              className="field h-8 min-w-0 flex-1 font-semibold"
              value={draft.name}
              onChange={(e) => update({ name: e.target.value })}
              aria-label="Funnel name"
              placeholder="Funnel name"
            />
            {isSaved && funnels.length > 1 ? (
              <button
                type="button"
                className="btn-ghost h-8 w-8 px-0 text-ink-3 hover:text-bad"
                aria-label="Delete funnel"
                onClick={async () => {
                  await removeFunnel(draft.id)
                  const next = funnels.find((f) => f.id !== draft.id)
                  setDraft(next ? structuredClone(next) : null)
                  toast('Funnel deleted', 'info')
                }}
              >
                <IconTrash size={15} />
              </button>
            ) : null}
          </div>

          <ol className="mt-4 flex flex-col gap-2">
            {draft.steps.map((step, i) => (
              <li key={i} className="rounded-lg border border-line bg-card-2 p-2.5">
                <div className="flex items-center gap-2">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent text-[11px] font-semibold text-white">{i + 1}</span>
                  <select className="field h-8 min-w-0 flex-1 text-[13px]" value={step.event} onChange={(e) => updateStep(i, { event: e.target.value, label: undefined, filter: null })} aria-label={`Step ${i + 1} event`}>
                    {!names.includes(step.event) ? <option value={step.event}>{step.event}</option> : null}
                    {names.map((n) => (
                      <option key={n} value={n}>
                        {prettyEventName(n)}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="btn-ghost h-8 w-8 shrink-0 px-0 text-ink-3 disabled:opacity-30"
                    aria-label="Remove step"
                    disabled={draft.steps.length <= MIN_STEPS}
                    onClick={() => update({ steps: draft.steps.filter((_, j) => j !== i) })}
                  >
                    <IconClose size={14} />
                  </button>
                </div>
                <div className="mt-2 flex items-center gap-2 pl-8">
                  <input
                    className="field h-7 min-w-0 flex-1 text-xs"
                    placeholder="Label (optional)"
                    value={step.label ?? ''}
                    onChange={(e) => updateStep(i, { label: e.target.value || undefined })}
                    aria-label={`Step ${i + 1} label`}
                  />
                  {step.filter ? (
                    <button type="button" className="btn-ghost h-7 px-2 text-xs text-ink-3" onClick={() => updateStep(i, { filter: null })}>
                      Clear filter
                    </button>
                  ) : (
                    <button type="button" className="btn-ghost h-7 px-2 text-xs" onClick={() => updateStep(i, { filter: { key: '', op: 'eq', value: '' } })}>
                      + Filter
                    </button>
                  )}
                </div>
                {step.filter ? (
                  <FilterEditor filter={step.filter} keys={[...(propKeysByEvent.get(step.event) ?? [])].sort()} onChange={(filter) => updateStep(i, { filter })} listId={`keys-${draft.id}-${i}`} />
                ) : null}
              </li>
            ))}
          </ol>

          <div className="mt-3 flex items-center justify-between gap-2">
            <button
              type="button"
              className="btn-secondary h-8 text-xs"
              disabled={draft.steps.length >= MAX_STEPS}
              onClick={() => update({ steps: [...draft.steps, { event: names[0] ?? '$click' }] })}
            >
              <IconPlus size={13} />
              Add step
            </button>
            <span className="text-xs text-ink-3">
              {draft.steps.length} of {MAX_STEPS} steps
            </span>
          </div>

          <label className="mt-4 block text-xs font-medium text-ink-2">
            Conversion window
            <select className="field mt-1 h-8 w-full text-[13px]" value={draft.windowMs} onChange={(e) => update({ windowMs: Number(e.target.value) })}>
              {WINDOWS.map((w) => (
                <option key={w.ms} value={w.ms}>
                  {w.label}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            className="btn-primary mt-4 w-full"
            disabled={!dirty || draft.steps.some((s) => !s.event) || !draft.name.trim()}
            onClick={async () => {
              await saveFunnel(draft)
              toast(`Saved “${draft.name}”`, 'success')
            }}
          >
            {isSaved ? (dirty ? 'Save changes' : 'Saved') : 'Save funnel'}
          </button>
        </Card>

        {/* Results */}
        <div className="flex min-w-0 flex-col gap-4">
          {result ? (
            <>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <StatTile label="Entered" value={formatNumber(result.totalUsers)} hint="users who did step 1" />
                <StatTile label="Converted" value={formatNumber(result.converted)} hint="completed every step in order" accent="accent" />
                <StatTile label="Conversion" value={percent(result.conversionRate, 1)} hint="of users who entered" accent="good" />
                <StatTile label="Median time" value={formatDuration(result.medianTimeToConvert)} hint="first step to last" />
              </div>

              <Card>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold text-ink">{draft.name}</h2>
                  <span className="text-xs text-ink-3">
                    window {WINDOWS.find((w) => w.ms === draft.windowMs)?.label ?? formatDuration(draft.windowMs)} · {formatNumber(events.length)} events
                  </span>
                </div>
                <FunnelChart result={result} selectedDrop={selectedDrop} onSelectDrop={setSelectedDrop} />
              </Card>

              {dropStep ? (
                <Card padded={false} className="hs-fade-up">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
                    <div>
                      <h2 className="text-sm font-semibold text-ink">
                        {formatNumber(dropped.length)} users dropped after “{dropStep.step.label ?? dropStep.step.event}”
                      </h2>
                      <p className="text-xs text-ink-3">
                        They completed step {dropStep.index + 1} but never reached “{nextStep?.step.label ?? nextStep?.step.event}” within the window. Recorded sessions link straight to the moment they stalled.
                      </p>
                    </div>
                    <button type="button" className="btn-ghost h-8 px-2 text-xs" onClick={() => setSelectedDrop(null)}>
                      <IconClose size={14} /> Close
                    </button>
                  </div>
                  <div className="scroll-thin max-h-[420px] overflow-y-auto">
                    <table className="w-full border-collapse text-sm">
                      <thead className="sticky top-0 bg-card-2">
                        <tr className="border-b border-line">
                          <th className="table-head px-4 py-2">Visitor</th>
                          <th className="table-head px-3 py-2">Session</th>
                          <th className="table-head hidden px-3 py-2 sm:table-cell">When</th>
                          <th className="table-head px-3 py-2">Last step at</th>
                          <th className="table-head px-3 py-2" />
                        </tr>
                      </thead>
                      <tbody>
                        {dropped.slice(0, 200).map((d) => {
                          const s = sessionById.get(d.sessionId)
                          const href = `/replays/${d.sessionId}?t=${Math.max(0, Math.round(d.t - 2000))}`
                          return (
                            <tr key={d.sessionId + d.userId} className="row-hover border-b border-line-2 last:border-b-0">
                              <td className="px-4 py-2 font-mono text-[12px] text-ink">{d.userId}</td>
                              <td className="px-3 py-2">
                                <span className="inline-flex items-center gap-2 font-mono text-[12px] text-ink-2">
                                  {shortId(d.sessionId, 8)}
                                  {s?.hasRecording ? <Chip tone="accent">Recorded</Chip> : <Chip tone="neutral">Events only</Chip>}
                                </span>
                              </td>
                              <td className="hidden px-3 py-2 text-xs text-ink-2 sm:table-cell">{relativeTime(d.ts)}</td>
                              <td className="px-3 py-2 font-mono text-[12px] text-ink-2 tabular-nums">{formatClock(d.t)}</td>
                              <td className="px-3 py-2 text-right">
                                <Link to={href} className="btn-secondary h-7 px-2 text-xs" onClick={() => undefined}>
                                  <IconPlay size={12} />
                                  {s?.hasRecording ? 'Replay' : 'Timeline'}
                                </Link>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </Card>
              ) : (
                <p className="text-center text-xs text-ink-3">
                  Tip: click a hatched region in the chart to list the sessions that dropped off there.
                </p>
              )}
            </>
          ) : (
            <EmptyState icon={<IconFunnel size={20} />} title="Pick at least two steps" description="Choose the events that make up your funnel to compute conversion." />
          )}
        </div>
      </div>
    </>
  )
}

function FilterEditor({ filter, keys, onChange, listId }: { filter: PropertyFilter; keys: string[]; onChange: (f: PropertyFilter) => void; listId: string }) {
  const needsValue = filter.op !== 'set' && filter.op !== 'not_set'
  return (
    <div className="mt-2 grid grid-cols-[1fr_auto] gap-1.5 pl-8 sm:grid-cols-[1fr_auto_1fr]">
      <input className="field h-7 min-w-0 font-mono text-xs" placeholder="property" value={filter.key} onChange={(e) => onChange({ ...filter, key: e.target.value })} list={listId} aria-label="Filter property" />
      <datalist id={listId}>
        {keys.map((k) => (
          <option key={k} value={k} />
        ))}
      </datalist>
      <select className="field h-7 text-xs" value={filter.op} onChange={(e) => onChange({ ...filter, op: e.target.value as FilterOp })} aria-label="Filter operator">
        {OPS.map((o) => (
          <option key={o.op} value={o.op}>
            {o.label}
          </option>
        ))}
      </select>
      {needsValue ? (
        <input className="field col-span-2 h-7 min-w-0 font-mono text-xs sm:col-span-1" placeholder="value" value={filter.value} onChange={(e) => onChange({ ...filter, value: e.target.value })} aria-label="Filter value" />
      ) : null}
    </div>
  )
}

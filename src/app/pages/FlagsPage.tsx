import { useMemo, useState, type FormEvent } from 'react'
import { isFlagActive, normalizeFlagKey, rolloutBucket } from '../../analytics/flags'
import type { FeatureFlag } from '../../analytics/flags'
import { useDashboard } from '../store'
import { Card, Chip, EmptyState, PageHeader, StatTile, Toggle } from '../components/ui'
import { IconFlag, IconPlus, IconTrash } from '../components/icons'
import { formatNumber, percent } from '../format'

export function FlagsPage() {
  const flags = useDashboard((s) => s.flags)
  const sessions = useDashboard((s) => s.sessions)
  const events = useDashboard((s) => s.events)
  const userId = useDashboard((s) => s.userId)
  const saveFlag = useDashboard((s) => s.saveFlag)
  const removeFlag = useDashboard((s) => s.removeFlag)
  const toast = useDashboard((s) => s.toast)

  const knownUsers = useMemo(() => [...new Set(sessions.map((s) => s.userId))], [sessions])
  const eventsWithFlag = useMemo(() => {
    const counts = new Map<string, number>()
    for (const e of events) {
      const f = e.props.$flags
      if (f && typeof f === 'object' && !Array.isArray(f)) {
        for (const [k, v] of Object.entries(f)) if (v === true) counts.set(k, (counts.get(k) ?? 0) + 1)
      }
    }
    return counts
  }, [events])

  const [key, setKey] = useState('')
  const [description, setDescription] = useState('')
  const [rollout, setRollout] = useState(50)
  const [probe, setProbe] = useState('')

  const normalized = normalizeFlagKey(key)
  const exists = flags.some((f) => f.key === normalized)

  const create = async (e: FormEvent) => {
    e.preventDefault()
    if (!normalized || exists) return
    await saveFlag({ key: normalized, description: description.trim(), enabled: true, rollout, createdAt: Date.now() })
    toast(`Created flag “${normalized}” at ${rollout}% rollout`, 'success')
    setKey('')
    setDescription('')
    setRollout(50)
  }

  const activeForMe = flags.filter((f) => isFlagActive(f, userId)).length

  return (
    <>
      <PageHeader
        title="Feature flags"
        description={
          <>
            Boolean flags with a percentage rollout. A visitor's bucket is <code className="rounded bg-card-2 px-1 font-mono text-[12px]">FNV-1a(key::userId) mod 10000</code>,
            so the same person always gets the same answer and raising the rollout never removes anyone. The demo store reads <em>new-checkout</em> to pick its checkout variant.
          </>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Flags" value={formatNumber(flags.length)} hint={`${flags.filter((f) => f.enabled).length} enabled`} />
        <StatTile label="Known visitors" value={formatNumber(knownUsers.length)} hint="from sessions" />
        <StatTile label="Active for you" value={formatNumber(activeForMe)} hint={<span className="font-mono">{userId}</span>} accent="good" />
        <StatTile label="Events with flags" value={formatNumber(events.filter((e) => e.props.$flags !== undefined).length)} hint="carry $flags property" accent="accent" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          <Card className="h-fit">
            <h2 className="text-sm font-semibold text-ink">New flag</h2>
            <form onSubmit={create} className="mt-3 flex flex-col gap-3">
              <label className="text-xs font-medium text-ink-2">
                Key
                <input className="field mt-1 w-full font-mono text-[13px]" value={key} onChange={(e) => setKey(e.target.value)} placeholder="e.g. sticky-cart" required aria-invalid={exists} />
                {key && normalized !== key.trim() ? <span className="mt-1 block text-[11px] text-ink-3">Will be saved as <span className="font-mono">{normalized || '—'}</span></span> : null}
                {exists ? <span className="mt-1 block text-[11px] text-bad">A flag with this key already exists.</span> : null}
              </label>
              <label className="text-xs font-medium text-ink-2">
                Description
                <input className="field mt-1 w-full" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What does it turn on?" />
              </label>
              <label className="text-xs font-medium text-ink-2">
                <span className="flex items-center justify-between">
                  Rollout <span className="font-mono text-ink">{rollout}%</span>
                </span>
                <input type="range" min={0} max={100} step={1} value={rollout} onChange={(e) => setRollout(Number(e.target.value))} className="mt-2 w-full accent-primary" aria-label="Rollout percentage" />
                <span className="mt-1 block text-[11px] text-ink-3">
                  ≈ {formatNumber(knownUsers.filter((u) => isFlagActive({ key: normalized || 'preview', enabled: true, rollout }, u)).length)} of {formatNumber(knownUsers.length)} known visitors
                </span>
              </label>
              <button type="submit" className="btn-primary" disabled={!normalized || exists}>
                <IconPlus size={15} />
                Create flag
              </button>
            </form>
          </Card>

          <Card className="h-fit">
            <h2 className="text-sm font-semibold text-ink">Bucket explorer</h2>
            <p className="mt-1 text-xs text-ink-3">Type any visitor id to see which bucket each flag puts it in.</p>
            <input className="field mt-3 w-full font-mono text-[13px]" value={probe} onChange={(e) => setProbe(e.target.value)} placeholder={userId} aria-label="Visitor id to probe" />
            <ul className="mt-3 space-y-1.5 text-xs">
              {flags.map((f) => {
                const uid = probe.trim() || userId
                const bucket = rolloutBucket(f.key, uid)
                const on = isFlagActive(f, uid)
                return (
                  <li key={f.key} className="flex items-center justify-between gap-3">
                    <span className="truncate font-mono text-ink-2">{f.key}</span>
                    <span className="flex items-center gap-2">
                      <span className="font-mono text-ink-3 tabular-nums">bucket {bucket.toFixed(2)}</span>
                      <Chip tone={on ? 'good' : 'neutral'}>{on ? 'on' : 'off'}</Chip>
                    </span>
                  </li>
                )
              })}
            </ul>
          </Card>
        </div>

        <div className="flex flex-col gap-3">
          {flags.length === 0 ? (
            <EmptyState icon={<IconFlag size={20} />} title="No flags yet" description="Create one on the left. The demo store will pick it up immediately." />
          ) : (
            flags.map((f) => (
              <FlagRow
                key={f.key}
                flag={f}
                userId={userId}
                knownUsers={knownUsers}
                eventCount={eventsWithFlag.get(f.key) ?? 0}
                onChange={(next) => void saveFlag(next)}
                onDelete={async () => {
                  await removeFlag(f.key)
                  toast(`Deleted “${f.key}”`, 'info')
                }}
              />
            ))
          )}
        </div>
      </div>
    </>
  )
}

function FlagRow({
  flag,
  userId,
  knownUsers,
  eventCount,
  onChange,
  onDelete,
}: {
  flag: FeatureFlag
  userId: string
  knownUsers: string[]
  eventCount: number
  onChange: (next: FeatureFlag) => void
  onDelete: () => void
}) {
  const [rollout, setRollout] = useState(flag.rollout)
  const [confirm, setConfirm] = useState(false)
  const active = isFlagActive(flag, userId)
  const share = knownUsers.length ? knownUsers.filter((u) => isFlagActive({ key: flag.key, enabled: true, rollout }, u)).length / knownUsers.length : rollout / 100
  const usedByStore = flag.key === 'new-checkout' || flag.key === 'free-shipping-banner'

  return (
    <Card className={`transition-opacity ${flag.enabled ? '' : 'opacity-75'}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-mono text-[14px] font-semibold text-ink">{flag.key}</h3>
            <Chip tone={active ? 'good' : 'neutral'} title="Whether the flag is on for your visitor id">
              you: {active ? 'on' : 'off'}
            </Chip>
            {usedByStore ? <Chip tone="primary">read by demo store</Chip> : null}
          </div>
          <p className="mt-1 text-sm text-ink-2">{flag.description || <span className="text-ink-3">No description</span>}</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-xs text-ink-2 select-none">
            <Toggle checked={flag.enabled} onChange={(enabled) => onChange({ ...flag, enabled })} label={`Enable ${flag.key}`} />
            {flag.enabled ? 'Enabled' : 'Disabled'}
          </label>
          {confirm ? (
            <span className="flex items-center gap-1">
              <button type="button" className="btn-danger h-8 px-2.5 text-xs" onClick={onDelete}>
                Delete
              </button>
              <button type="button" className="btn-ghost h-8 px-2 text-xs" onClick={() => setConfirm(false)}>
                Cancel
              </button>
            </span>
          ) : (
            <button type="button" className="btn-ghost h-8 w-8 px-0 text-ink-3 hover:text-bad" aria-label={`Delete ${flag.key}`} onClick={() => setConfirm(true)}>
              <IconTrash size={15} />
            </button>
          )}
        </div>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_auto]">
        <label className="text-xs font-medium text-ink-2">
          <span className="flex items-center justify-between">
            Rollout
            <span className="font-mono text-ink tabular-nums">{rollout}%</span>
          </span>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={rollout}
            onChange={(e) => setRollout(Number(e.target.value))}
            onPointerUp={() => rollout !== flag.rollout && onChange({ ...flag, rollout })}
            onKeyUp={() => rollout !== flag.rollout && onChange({ ...flag, rollout })}
            onBlur={() => rollout !== flag.rollout && onChange({ ...flag, rollout })}
            className="mt-2 w-full accent-primary"
            aria-label={`Rollout for ${flag.key}`}
            disabled={!flag.enabled}
          />
          {/* meter: fill is the primary, the track a lighter step of the same hue */}
          <span className="mt-2 block h-1.5 w-full overflow-hidden rounded-full bg-primary-soft" aria-hidden="true">
            <span className="block h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${share * 100}%` }} />
          </span>
          <span className="mt-1 block text-[11px] text-ink-3">
            {percent(share, 1)} of {formatNumber(knownUsers.length)} known visitors land in the rollout
          </span>
        </label>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs sm:min-w-[180px]">
          <dt className="text-ink-3">Events tagged</dt>
          <dd className="font-mono text-ink tabular-nums">{formatNumber(eventCount)}</dd>
          <dt className="text-ink-3">Your bucket</dt>
          <dd className="font-mono text-ink tabular-nums">{rolloutBucket(flag.key, userId).toFixed(2)}</dd>
          <dt className="text-ink-3">Created</dt>
          <dd className="text-ink">{new Date(flag.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</dd>
        </dl>
      </div>
    </Card>
  )
}

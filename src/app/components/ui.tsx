import type { ReactNode } from 'react'
import { IconCheck } from './icons'

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string
  description?: ReactNode
  actions?: ReactNode
}) {
  return (
    <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-[22px] font-semibold tracking-[-0.01em] text-ink">{title}</h1>
        {description ? <p className="mt-1 max-w-2xl text-sm text-ink-2">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  )
}

export function Card({ children, className = '', padded = true }: { children: ReactNode; className?: string; padded?: boolean }) {
  return <section className={`card ${padded ? 'p-5' : ''} ${className}`}>{children}</section>
}

export function StatTile({
  label,
  value,
  hint,
  accent,
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  accent?: 'primary' | 'accent' | 'good' | 'bad'
}) {
  const bar =
    accent === 'accent' ? 'bg-accent' : accent === 'good' ? 'bg-good' : accent === 'bad' ? 'bg-bad' : 'bg-primary'
  return (
    <div className="card relative overflow-hidden p-4">
      <span className={`absolute inset-y-4 left-0 w-0.5 rounded-r ${bar}`} aria-hidden="true" />
      <div className="pl-3">
        <div className="text-xs font-medium text-ink-3">{label}</div>
        <div className="mt-1 text-2xl font-semibold tracking-[-0.02em] text-ink">{value}</div>
        {hint ? <div className="mt-1 text-xs text-ink-2">{hint}</div> : null}
      </div>
    </div>
  )
}

export type ChipTone = 'neutral' | 'primary' | 'accent' | 'good' | 'bad' | 'series-1' | 'series-2' | 'series-3' | 'series-4' | 'series-5'

const CHIP_TONES: Record<ChipTone, string> = {
  neutral: 'bg-line-2 text-ink-2',
  primary: 'bg-primary-soft text-primary dark:text-primary-strong',
  accent: 'bg-accent-soft text-accent',
  good: 'bg-[color-mix(in_oklab,var(--good)_15%,transparent)] text-good',
  bad: 'bg-bad-soft text-bad',
  'series-1': 'bg-[color-mix(in_oklab,var(--series-1)_14%,transparent)] text-ink',
  'series-2': 'bg-[color-mix(in_oklab,var(--series-2)_14%,transparent)] text-ink',
  'series-3': 'bg-[color-mix(in_oklab,var(--series-3)_14%,transparent)] text-ink',
  'series-4': 'bg-[color-mix(in_oklab,var(--series-4)_14%,transparent)] text-ink',
  'series-5': 'bg-[color-mix(in_oklab,var(--series-5)_14%,transparent)] text-ink',
}

export function Chip({ children, tone = 'neutral', dot, className = '', title }: { children: ReactNode; tone?: ChipTone; dot?: string; className?: string; title?: string }) {
  return (
    <span className={`chip ${CHIP_TONES[tone]} ${className}`} title={title}>
      {dot ? <span className="size-1.5 rounded-full" style={{ background: dot }} aria-hidden="true" /> : null}
      {children}
    </span>
  )
}

export function Toggle({
  checked,
  onChange,
  label,
  size = 'md',
}: {
  checked: boolean
  onChange: (next: boolean) => void
  label: string
  size?: 'sm' | 'md'
}) {
  const w = size === 'sm' ? 'h-5 w-9' : 'h-6 w-11'
  const knob = size === 'sm' ? 'size-3.5' : 'size-4.5'
  const shift = size === 'sm' ? 'translate-x-4' : 'translate-x-5'
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex ${w} shrink-0 items-center rounded-full border border-transparent transition-colors ${
        checked ? 'bg-primary' : 'bg-line'
      }`}
    >
      <span
        className={`${knob} inline-block translate-x-0.75 rounded-full bg-white shadow-sm transition-transform ${checked ? shift : ''}`}
      />
    </button>
  )
}

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string
  description?: ReactNode
  action?: ReactNode
  icon?: ReactNode
}) {
  return (
    <div className="card flex flex-col items-center justify-center px-6 py-14 text-center">
      {icon ? <div className="mb-3 flex size-11 items-center justify-center rounded-full bg-primary-soft text-primary">{icon}</div> : null}
      <h2 className="text-base font-semibold text-ink">{title}</h2>
      {description ? <p className="mt-1 max-w-md text-sm text-ink-2">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  )
}

export function Spinner({ className = '' }: { className?: string }) {
  return (
    <svg className={`hs-spin ${className}`} width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  label,
  size = 'md',
}: {
  value: T
  options: Array<{ value: T; label: ReactNode }>
  onChange: (v: T) => void
  label: string
  size?: 'sm' | 'md'
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg border border-line bg-card-2 p-0.5">
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={`${size === 'sm' ? 'h-6 px-2 text-xs' : 'h-7 px-3 text-sm'} rounded-md font-medium transition-colors ${
              active ? 'bg-card text-ink shadow-sm' : 'text-ink-2 hover:text-ink'
            }`}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

export function Checkbox({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-ink-2 select-none">
      <span
        className={`flex size-4 items-center justify-center rounded border transition-colors ${
          checked ? 'border-primary bg-primary text-white' : 'border-line bg-card'
        }`}
      >
        {checked ? <IconCheck size={12} strokeWidth={3} /> : null}
      </span>
      <input type="checkbox" className="sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  )
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="kbd">{children}</kbd>
}

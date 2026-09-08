import { useId, useState } from 'react'
import type { FunnelResult } from '../../analytics/funnel'
import { formatDuration } from '../../analytics/funnel'
import { useElementSize } from '../hooks'
import { formatNumber, percent } from '../format'

export interface FunnelChartProps {
  result: FunnelResult
  /** index of the step whose drop-off is selected (users who did step i but not i+1) */
  selectedDrop: number | null
  onSelectDrop: (index: number | null) => void
}

const H = 330
const TOP = 52
const BOTTOM = 56
const SIDE = 12

/**
 * Stepped funnel: one column per step in the warm accent, the users lost since
 * the previous step drawn as a hatched wash above it. The wash is the
 * drop-off callout and is clickable; it lists the sessions that stalled there.
 * Single series, so the title carries identity and there is no legend box.
 * Values live in a fixed band above the plot so labels never collide with marks.
 * Columns grow from the baseline via a CSS scaleY animation (see .funnel-bar).
 */
export function FunnelChart({ result, selectedDrop, onSelectDrop }: FunnelChartProps) {
  const [ref, size] = useElementSize<HTMLDivElement>()
  const id = useId()
  const [hover, setHover] = useState<number | null>(null)

  const W = Math.max(0, size.width)
  const steps = result.steps
  const n = steps.length
  const max = Math.max(1, steps[0]?.count ?? 1)
  const plotH = H - TOP - BOTTOM
  const slot = n ? (W - SIDE * 2) / n : 0
  const barW = Math.max(28, Math.min(150, slot * 0.6))
  const showConnectors = slot - barW >= 54
  const baseline = TOP + plotH
  const hOf = (count: number) => (count / max) * plotH
  const xOf = (i: number) => SIDE + slot * i + (slot - barW) / 2

  return (
    <div ref={ref} className="w-full">
      {W > 0 ? (
        <svg width={W} height={H} role="img" aria-label={`Funnel: ${steps.map((s) => `${s.step.label ?? s.step.event} ${s.count}`).join(', ')}`} className="block select-none">
          <defs>
            <pattern id={`${id}-drop`} width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="7" height="7" fill="var(--accent-soft)" />
              <line x1="0" y1="0" x2="0" y2="7" stroke="var(--accent)" strokeOpacity="0.4" strokeWidth="1.5" />
            </pattern>
            <pattern id={`${id}-drop-hot`} width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="7" height="7" fill="var(--accent-soft)" />
              <line x1="0" y1="0" x2="0" y2="7" stroke="var(--accent)" strokeOpacity="0.85" strokeWidth="1.5" />
            </pattern>
          </defs>

          <line x1={SIDE} x2={W - SIDE} y1={baseline + 0.5} y2={baseline + 0.5} stroke="var(--line)" />

          {steps.map((s, i) => {
            const h = hOf(s.count)
            const x = xOf(i)
            const cx = x + barW / 2
            const prev = i > 0 ? steps[i - 1] : null
            const lost = prev ? prev.count - s.count : 0
            const lostH = prev ? hOf(prev.count) - h : 0
            const dropIndex = i - 1
            const dropSelected = selectedDrop === dropIndex
            const dropHover = hover === dropIndex
            return (
              <g key={i}>
                {prev && lost > 0 ? (
                  <g
                    className="cursor-pointer outline-none"
                    role="button"
                    tabIndex={0}
                    aria-pressed={dropSelected}
                    aria-label={`${formatNumber(lost)} users dropped after ${prev.step.label ?? prev.step.event}. ${dropSelected ? 'Selected.' : 'Select to list their sessions.'}`}
                    onClick={() => onSelectDrop(dropSelected ? null : dropIndex)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        onSelectDrop(dropSelected ? null : dropIndex)
                      }
                    }}
                    onFocus={() => setHover(dropIndex)}
                    onBlur={() => setHover(null)}
                    onMouseEnter={() => setHover(dropIndex)}
                    onMouseLeave={() => setHover(null)}
                  >
                    <rect
                      className="funnel-bar"
                      x={x}
                      y={baseline - h - lostH}
                      width={barW}
                      height={Math.max(0, lostH - 2)}
                      rx={4}
                      fill={`url(#${id}-drop${dropSelected || dropHover ? '-hot' : ''})`}
                      stroke={dropSelected ? 'var(--accent)' : 'transparent'}
                      strokeWidth={1.5}
                    />
                    <title>{`${formatNumber(lost)} dropped (${percent(1 - s.conversionFromPrevious)}) — click to list sessions`}</title>
                  </g>
                ) : null}

                <g onMouseEnter={() => setHover(null)}>
                  <rect className="funnel-bar" x={x} y={baseline - h} width={barW} height={h} fill="var(--accent)" />
                  <rect className="funnel-bar" x={x} y={baseline - h} width={barW} height={Math.min(8, h)} rx={4} fill="var(--accent)" />
                  <title>{`${s.step.label ?? s.step.event}: ${formatNumber(s.count)} users (${percent(s.conversionFromStart)} of first step)`}</title>
                </g>

                {/* value band */}
                <text x={cx} y={20} textAnchor="middle" fontSize={14} fontWeight={600} fill="var(--ink)">
                  {formatNumber(s.count)}
                </text>
                <text x={cx} y={36} textAnchor="middle" fontSize={11} fill="var(--ink-2)">
                  {i === 0 ? '100%' : percent(s.conversionFromStart)}
                </text>

                {/* step label */}
                <text x={cx} y={baseline + 20} textAnchor="middle" fontSize={12} fontWeight={500} fill="var(--ink)">
                  {truncateLabel(s.step.label ?? s.step.event, Math.max(6, Math.floor(slot / 7.5)))}
                </text>
                <text x={cx} y={baseline + 36} textAnchor="middle" fontSize={11} fill="var(--ink-3)">
                  {i === 0 ? 'entered' : `${percent(s.conversionFromPrevious)} of previous`}
                </text>

                {/* connector callout between columns */}
                {i > 0 && showConnectors ? (
                  <g transform={`translate(${x - (slot - barW) / 2} 0)`}>
                    <text x={0} y={20} textAnchor="middle" fontSize={11} fontWeight={600} fill={lost > 0 ? 'var(--bad)' : 'var(--ink-3)'}>
                      {lost > 0 ? `−${percent(1 - s.conversionFromPrevious)}` : '±0'}
                    </text>
                    <text x={0} y={36} textAnchor="middle" fontSize={10} fill="var(--ink-3)">
                      {s.medianTimeFromPrevious !== null ? `~${formatDuration(s.medianTimeFromPrevious)}` : ''}
                    </text>
                  </g>
                ) : null}
              </g>
            )
          })}
        </svg>
      ) : (
        <div style={{ height: H }} />
      )}
    </div>
  )
}

function truncateLabel(label: string, max: number): string {
  return label.length > max ? label.slice(0, Math.max(1, max - 1)) + '…' : label
}

import { useId } from 'react'
import type { ClickPoint } from '../../analytics/session'

/**
 * A tiny click heatmap: each click becomes a soft radial blob in the session's
 * viewport aspect ratio. Sequential intensity = one hue, light->dark.
 */
export function HeatmapThumb({
  points,
  viewport,
  width = 72,
  maxHeight = 44,
  className = '',
  title,
}: {
  points: ClickPoint[]
  viewport: { w: number; h: number }
  width?: number
  /** portrait viewports are shrunk to fit this height so table rows stay even */
  maxHeight?: number
  className?: string
  title?: string
}) {
  const id = useId()
  const aspect = viewport.w > 0 && viewport.h > 0 ? Math.min(2.2, Math.max(0.45, viewport.w / viewport.h)) : 1.6
  const w = 100
  const h = Math.round(100 / aspect)
  const r = Math.max(9, Math.min(w, h) * 0.16)
  const renderH = Math.min(maxHeight, Math.round(width / aspect))
  const renderW = Math.round(renderH * aspect)
  return (
    <svg
      width={renderW}
      height={renderH}
      viewBox={`0 0 ${w} ${h}`}
      className={`rounded-[4px] border border-line bg-card-2 ${className}`}
      role="img"
      aria-label={title ?? `${points.length} clicks`}
    >
      <defs>
        <radialGradient id={`${id}-g`}>
          <stop offset="0%" stopColor="var(--series-2)" stopOpacity="0.85" />
          <stop offset="60%" stopColor="var(--series-2)" stopOpacity="0.28" />
          <stop offset="100%" stopColor="var(--series-2)" stopOpacity="0" />
        </radialGradient>
      </defs>
      {/* faint "page" hint so an empty thumbnail still reads as a viewport */}
      <rect x="8" y="7" width={w - 16} height="5" rx="1.5" fill="var(--line)" />
      <rect x="8" y="16" width={w - 16} height={h - 24} rx="2" fill="var(--line-2)" />
      {points.slice(0, 120).map((p, i) => (
        <circle key={i} cx={p.x * w} cy={p.y * h} r={r} fill={`url(#${id}-g)`} />
      ))}
    </svg>
  )
}

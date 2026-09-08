import { useCallback, useId, useRef, type KeyboardEvent, type PointerEvent } from 'react'
import { useElementSize } from '../hooks'
import type { InactivitySegment, Marker } from '../../replayer/timeline'
import { formatClock } from '../../replayer/timeline'
import { eventColor, EVENT_LEGEND } from '../eventStyle'

export interface TimelineProps {
  duration: number
  time: number
  markers: Marker[]
  inactivity: InactivitySegment[]
  onSeek: (t: number) => void
  onScrubStart?: () => void
  onScrubEnd?: () => void
}

const H = 44
const TRACK_Y = 26
const TRACK_H = 6

/**
 * The scrubber. Inactivity is hatched gray, event markers are coloured ticks
 * above the track, and the whole thing is a keyboard-operable slider.
 */
export function Timeline({ duration, time, markers, inactivity, onSeek, onScrubStart, onScrubEnd }: TimelineProps) {
  const [ref, size] = useElementSize<HTMLDivElement>()
  const dragging = useRef(false)
  const id = useId()
  const width = Math.max(0, size.width)
  const x = useCallback((t: number) => (duration > 0 ? (t / duration) * width : 0), [duration, width])

  const seekFromEvent = (e: PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
    onSeek(ratio * duration)
  }

  const onPointerDown = (e: PointerEvent<SVGSVGElement>) => {
    dragging.current = true
    e.currentTarget.setPointerCapture(e.pointerId)
    onScrubStart?.()
    seekFromEvent(e)
  }
  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    if (dragging.current) seekFromEvent(e)
  }
  const onPointerUp = (e: PointerEvent<SVGSVGElement>) => {
    if (!dragging.current) return
    dragging.current = false
    e.currentTarget.releasePointerCapture(e.pointerId)
    onScrubEnd?.()
  }
  const onKeyDown = (e: KeyboardEvent<SVGSVGElement>) => {
    const step = e.shiftKey ? 30_000 : 5_000
    if (e.key === 'ArrowRight') {
      e.preventDefault()
      onSeek(Math.min(duration, time + step))
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      onSeek(Math.max(0, time - step))
    } else if (e.key === 'Home') {
      e.preventDefault()
      onSeek(0)
    } else if (e.key === 'End') {
      e.preventDefault()
      onSeek(duration)
    }
  }

  const px = x(time)

  return (
    <div ref={ref} className="w-full select-none">
      <svg
        width={width}
        height={H}
        className="block cursor-pointer touch-none"
        role="slider"
        aria-label="Replay timeline"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(time)}
        aria-valuetext={`${formatClock(time)} of ${formatClock(duration)}`}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
      >
        <defs>
          <pattern id={`${id}-hatch`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="6" height="6" fill="var(--line)" />
            <line x1="0" y1="0" x2="0" y2="6" stroke="var(--ink-3)" strokeOpacity="0.55" strokeWidth="2" />
          </pattern>
        </defs>
        {/* track */}
        <rect x={0} y={TRACK_Y} width={width} height={TRACK_H} rx={3} fill="var(--line)" />
        {/* inactivity */}
        {inactivity.map((s, i) => (
          <rect key={i} x={x(s.start)} y={TRACK_Y} width={Math.max(2, x(s.end) - x(s.start))} height={TRACK_H} fill={`url(#${id}-hatch)`}>
            <title>{`Inactive for ${formatClock(s.end - s.start)}`}</title>
          </rect>
        ))}
        {/* progress */}
        <rect x={0} y={TRACK_Y} width={Math.max(0, px)} height={TRACK_H} rx={3} fill="var(--primary)" />
        {/* markers */}
        {markers.map((m, i) => (
          <g key={i} transform={`translate(${x(m.t)} 0)`}>
            <rect x={-1} y={8} width={2} height={14} rx={1} fill={eventColor(m.name)} />
            <rect x={-5} y={4} width={10} height={20} fill="transparent">
              <title>{`${m.name} at ${formatClock(m.t)}`}</title>
            </rect>
          </g>
        ))}
        {/* playhead */}
        <circle cx={px} cy={TRACK_Y + TRACK_H / 2} r={7} fill="var(--card)" stroke="var(--primary)" strokeWidth={2.5} />
      </svg>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-ink-3">
        {EVENT_LEGEND.map((l) => (
          <span key={l.kind} className="inline-flex items-center gap-1.5">
            <span className="inline-block h-3 w-0.5 rounded" style={{ background: l.color }} />
            {l.label}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <svg width="16" height="8" aria-hidden="true">
            <rect width="16" height="8" rx="2" fill={`url(#${id}-hatch)`} />
          </svg>
          Inactivity
        </span>
      </div>
    </div>
  )
}

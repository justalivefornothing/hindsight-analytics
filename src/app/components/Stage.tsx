import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { CursorState } from '../../replayer/player'
import { useElementSize } from '../hooks'

export interface Ripple {
  id: number
  x: number
  y: number
}

export interface StageProps {
  viewport: { w: number; h: number }
  cursor: CursorState
  ripples: Ripple[]
  /** Receives the iframe once its document is ready to be drawn into. */
  onFrameReady: (iframe: HTMLIFrameElement) => void
  overlay?: ReactNode
}

/**
 * The cinema: a sandboxed iframe rendered at the recorded viewport size and
 * scaled to fit the dark stage, with the synthetic cursor and click ripples
 * drawn in the same scaled coordinate space so they land exactly where the
 * user's pointer was.
 *
 * `sandbox="allow-same-origin"` (and deliberately NOT allow-scripts) is what
 * makes reconstruction safe: the parent can write into the document, but
 * nothing inside it can ever execute, even if a <script> slipped through the
 * serializer (it does not; see replayer/rebuild.ts).
 */
export function Stage({ viewport, cursor, ripples, onFrameReady, overlay }: StageProps) {
  const [ref, size] = useElementSize<HTMLDivElement>()
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const iframe = iframeRef.current
    if (!iframe) return
    let cancelled = false
    const announce = () => {
      if (cancelled) return
      setReady(true)
      onFrameReady(iframe)
    }
    const doc = iframe.contentDocument
    if (doc && doc.readyState === 'complete') announce()
    iframe.addEventListener('load', announce)
    return () => {
      cancelled = true
      iframe.removeEventListener('load', announce)
    }
  }, [onFrameReady])

  const pad = 16
  const availW = Math.max(0, size.width - pad * 2)
  const availH = Math.max(0, size.height - pad * 2)
  const vw = Math.max(320, viewport.w)
  const vh = Math.max(240, viewport.h)
  const scale = availW > 0 && availH > 0 ? Math.min(1, availW / vw, availH / vh) : 1
  const left = (size.width - vw * scale) / 2
  const top = (size.height - vh * scale) / 2

  return (
    <div ref={ref} className="relative h-[clamp(360px,62dvh,860px)] w-full overflow-hidden rounded-t-lg bg-stage">
      <div
        className="absolute origin-top-left overflow-hidden rounded-[3px] bg-white shadow-[0_30px_80px_-30px_rgb(0_0_0/0.8)]"
        style={{ width: vw, height: vh, transform: `translate(${left}px, ${top}px) scale(${scale})`, opacity: ready ? 1 : 0, transition: 'opacity 200ms ease' }}
      >
        <iframe
          ref={iframeRef}
          title="Session replay"
          sandbox="allow-same-origin"
          className="block border-0"
          style={{ width: vw, height: vh }}
          aria-label="Reconstructed page from the recorded session"
        />
        {/* Cursor + ripple layer shares the iframe's coordinate space. */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
          {ripples.map((r) => (
            <span key={r.id} className="hs-ripple" style={{ left: r.x, top: r.y }} />
          ))}
          <Cursor cursor={cursor} scale={scale} />
        </div>
      </div>
      {overlay ? <div className="pointer-events-none absolute inset-0">{overlay}</div> : null}
    </div>
  )
}

function Cursor({ cursor, scale }: { cursor: CursorState; scale: number }) {
  // Keep the arrow the same on-screen size regardless of how far the stage is scaled down.
  const s = Math.min(2.2, 1 / Math.max(0.35, scale))
  return (
    <svg
      width={22 * s}
      height={28 * s}
      viewBox="0 0 22 28"
      className="absolute"
      style={{
        left: cursor.x,
        top: cursor.y,
        opacity: cursor.visible ? 1 : 0,
        transform: 'translate(-2px, -2px)',
        transition: 'opacity 200ms ease',
        filter: 'drop-shadow(0 2px 4px rgb(0 0 0 / 0.35)) drop-shadow(0 6px 14px rgb(0 0 0 / 0.25))',
      }}
    >
      <path d="M2.5 2.5v20.4l5.4-4.6 3.6 7.6 3.9-1.8-3.5-7.5 7.1-.9z" fill="#fff" stroke="#10141f" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  )
}

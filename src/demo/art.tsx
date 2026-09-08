import type { Product } from './catalog'

/** Line-art glyphs drawn on the generated product tiles. */
function GlyphPath({ glyph }: { glyph: Product['glyph'] }) {
  switch (glyph) {
    case 'lamp':
      return (
        <>
          <path d="M22 12h20l8 18H14z" />
          <path d="M32 30v20M20 54h24" />
        </>
      )
    case 'notebook':
      return (
        <>
          <rect x="16" y="10" width="32" height="44" rx="3" />
          <path d="M22 10v44M30 22h12M30 30h12M30 38h8" />
        </>
      )
    case 'headphones':
      return (
        <>
          <path d="M14 38v-6a18 18 0 0 1 36 0v6" />
          <rect x="10" y="36" width="10" height="16" rx="3" />
          <rect x="44" y="36" width="10" height="16" rx="3" />
        </>
      )
    case 'bag':
      return (
        <>
          <path d="M14 24h36l-3 30H17z" />
          <path d="M24 24v-4a8 8 0 0 1 16 0v4" />
        </>
      )
    case 'pen':
      return (
        <>
          <path d="M18 46 42 12l10 6-24 34-12 4z" />
          <path d="M18 46l4 6" />
        </>
      )
    case 'speaker':
      return (
        <>
          <rect x="18" y="10" width="28" height="44" rx="6" />
          <circle cx="32" cy="36" r="8" />
          <circle cx="32" cy="20" r="3" />
        </>
      )
    case 'mug':
      return (
        <>
          <path d="M16 20h28v22a8 8 0 0 1-8 8H24a8 8 0 0 1-8-8z" />
          <path d="M44 26h4a6 6 0 0 1 0 12h-4" />
        </>
      )
    case 'clock':
      return (
        <>
          <circle cx="32" cy="32" r="20" />
          <path d="M32 20v12l8 5" />
        </>
      )
  }
}

export function ProductArt({ product, className = '' }: { product: Product; className?: string }) {
  return (
    <div
      className={`relative flex items-center justify-center overflow-hidden ${className}`}
      style={{ background: `linear-gradient(135deg, ${product.art[0]}, ${product.art[1]})` }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 64 64" className="h-[56%] w-[56%]" fill="none" stroke="rgba(255,255,255,0.92)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <GlyphPath glyph={product.glyph} />
      </svg>
      <span className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/10 to-transparent" />
    </div>
  )
}

export function Stars({ rating }: { rating: number }) {
  const full = Math.round(rating)
  return (
    <span className="inline-flex items-center gap-0.5 text-[var(--nl-accent-2)]" aria-label={`${rating} out of 5 stars`}>
      {Array.from({ length: 5 }, (_, i) => (
        <svg key={i} width="12" height="12" viewBox="0 0 24 24" aria-hidden="true" fill={i < full ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
          <path d="m12 2 3 6.5 7 .8-5.2 4.8 1.5 7L12 17.6 5.7 21l1.5-7L2 9.3l7-.8z" />
        </svg>
      ))}
    </span>
  )
}

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, matchPath, navigate, useLocation } from '../app/router'
import { PRODUCTS, findProduct, formatPrice } from './catalog'
import type { Product } from './catalog'
import { ProductArt, Stars } from './art'
import { cartTotals, useCart } from './cart'
import { capture, useFlag, useTracking } from './tracking'
import { Checkout, OrderDone } from './Checkout'

export const STORE_BASE = '/demo/store'

const CATEGORIES: Array<{ key: 'all' | Product['category']; label: string }> = [
  { key: 'all', label: 'Everything' },
  { key: 'desk', label: 'Desk' },
  { key: 'light', label: 'Light' },
  { key: 'audio', label: 'Audio' },
  { key: 'bag', label: 'Bags' },
]

/**
 * Northlight Supply: the storefront the recorder is pointed at. It is a
 * normal little React SPA; the only analytics-specific code is `capture()`
 * on business events and `useFlag()` for the checkout experiment.
 */
export function StoreApp() {
  const loc = useLocation()
  const rel = loc.pathname.startsWith(STORE_BASE) ? loc.pathname.slice(STORE_BASE.length) || '/' : '/'

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [rel])

  let page: ReactNode
  let params: Record<string, string> | null
  if (rel === '/') page = <Home />
  else if ((params = matchPath('/p/:id', rel))) page = <ProductPage id={params.id} />
  else if (rel === '/cart') page = <CartPage />
  else if (rel === '/checkout') page = <Checkout />
  else if (rel === '/done') page = <OrderDone />
  else page = <NotFound />

  return (
    <div className="nl-store flex min-h-dvh flex-col">
      <Header />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-16 sm:px-6">{page}</main>
      <Footer />
    </div>
  )
}

function Header() {
  const lines = useCart((s) => s.lines)
  const count = lines.reduce((a, l) => a + l.qty, 0)
  const loc = useLocation()
  const banner = useFlag('free-shipping-banner')
  return (
    <header className="sticky top-0 z-20 border-b border-[var(--nl-line)] bg-[var(--nl-bg)]/90 backdrop-blur">
      {banner ? (
        <div className="bg-[var(--nl-accent)] px-4 py-1.5 text-center text-xs font-medium text-white" data-track="promo-bar">
          Free shipping on orders over $75 · Ships in 2 days
        </div>
      ) : null}
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link to={STORE_BASE} className="flex items-center gap-2.5" aria-label="Northlight Supply home">
          <span className="flex size-8 items-center justify-center rounded-lg bg-[var(--nl-accent)] text-white">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 3 4 9v12h16V9z" />
              <path d="M9 21v-7h6v7" />
            </svg>
          </span>
          <span className="text-[15px] font-semibold tracking-tight">Northlight Supply</span>
        </Link>
        <nav aria-label="Categories" className="hidden items-center gap-6 text-sm font-medium md:flex">
          {CATEGORIES.slice(1).map((c) => (
            <Link key={c.key} to={`${STORE_BASE}?c=${c.key}`} className="nl-link" aria-current={loc.query.get('c') === c.key ? 'page' : undefined}>
              {c.label}
            </Link>
          ))}
        </nav>
        <Link to={`${STORE_BASE}/cart`} className="nl-btn nl-btn-secondary h-10 px-3.5" data-track="cart" aria-label={`Cart, ${count} items`}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M6 6h15l-1.5 9H7.5z" />
            <path d="M6 6 5 3H2" />
            <circle cx="9" cy="20" r="1.3" />
            <circle cx="18" cy="20" r="1.3" />
          </svg>
          <span>Cart</span>
          {count > 0 ? (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--nl-accent)] px-1.5 text-[11px] font-semibold text-white">{count}</span>
          ) : null}
        </Link>
      </div>
    </header>
  )
}

function Footer() {
  const tracking = useTracking()
  const express = useFlag('new-checkout')
  return (
    <footer className="border-t border-[var(--nl-line)] bg-[var(--nl-card)]">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-5 text-xs text-[var(--nl-ink-3)] sm:px-6">
        <span>© 2026 Northlight Supply · A demo shop that sells nothing.</span>
        <span className="inline-flex items-center gap-2 rounded-full border border-[var(--nl-line)] px-2.5 py-1 font-mono" title="This page is being recorded by Hindsight (locally, in your browser)">
          <span className={`size-1.5 rounded-full ${tracking.ready ? 'hs-rec-dot bg-[var(--nl-danger)]' : 'bg-[var(--nl-ink-3)]'}`} />
          {tracking.ready ? 'recording' : 'starting'} · {tracking.userId} · checkout={express ? 'express' : 'legacy'}
        </span>
      </div>
    </footer>
  )
}

/* ---------------------------------- pages ---------------------------------- */

function Home() {
  const loc = useLocation()
  const cat = (loc.query.get('c') as 'all' | Product['category'] | null) ?? 'all'
  const products = useMemo(() => (cat === 'all' ? PRODUCTS : PRODUCTS.filter((p) => p.category === cat)), [cat])
  return (
    <>
      <section className="grid items-center gap-8 py-10 md:grid-cols-[1.2fr_1fr] md:py-14">
        <div>
          <p className="mb-3 text-xs font-semibold tracking-[0.14em] text-[var(--nl-accent)] uppercase">New for autumn</p>
          <h1 className="text-[34px] leading-[1.05] font-semibold tracking-[-0.02em] sm:text-[44px]">Quiet objects for a well-lit desk.</h1>
          <p className="mt-4 max-w-md text-[15px] leading-relaxed text-[var(--nl-ink-2)]">
            Lamps, notebooks and small audio we would actually keep. Everything ships from one warehouse, in one box, with no plastic.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              className="nl-btn nl-btn-primary"
              data-track="hero-shop"
              onClick={() => document.getElementById('catalog')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            >
              Shop the collection
            </button>
            <Link to={`${STORE_BASE}/p/aurora-lamp`} className="nl-btn nl-btn-secondary" data-track="hero-featured">
              See the Aurora Lamp
            </Link>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {PRODUCTS.slice(0, 4).map((p, i) => (
            <Link key={p.id} to={`${STORE_BASE}/p/${p.id}`} className={`nl-tile block overflow-hidden rounded-2xl ${i % 3 === 0 ? 'translate-y-4' : ''}`} aria-label={p.name}>
              <ProductArt product={p} className="aspect-square" />
            </Link>
          ))}
        </div>
      </section>

      <section id="catalog" className="pt-6">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-xl font-semibold tracking-tight">{CATEGORIES.find((c) => c.key === cat)?.label ?? 'Everything'}</h2>
          <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Filter by category">
            {CATEGORIES.map((c) => (
              <Link
                key={c.key}
                to={c.key === 'all' ? STORE_BASE : `${STORE_BASE}?c=${c.key}`}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                  cat === c.key ? 'bg-[var(--nl-ink)] text-white' : 'bg-[var(--nl-card)] text-[var(--nl-ink-2)] hover:text-[var(--nl-ink)] border border-[var(--nl-line)]'
                }`}
                aria-current={cat === c.key ? 'page' : undefined}
              >
                {c.label}
              </Link>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {products.map((p) => (
            <article key={p.id} className="nl-card nl-tile overflow-hidden">
              <Link to={`${STORE_BASE}/p/${p.id}`} className="block" data-track="product-card">
                <ProductArt product={p} className="aspect-[4/3]" />
                <div className="p-3.5">
                  <h3 className="text-sm font-semibold">{p.name}</h3>
                  <p className="mt-0.5 line-clamp-2 text-xs text-[var(--nl-ink-2)]">{p.tagline}</p>
                  <div className="mt-2.5 flex items-center justify-between">
                    <span className="text-sm font-semibold">{formatPrice(p.price)}</span>
                    <Stars rating={p.rating} />
                  </div>
                </div>
              </Link>
            </article>
          ))}
        </div>
      </section>
    </>
  )
}

function ProductPage({ id }: { id: string }) {
  const product = findProduct(id)
  const add = useCart((s) => s.add)
  const [qty, setQty] = useState(1)
  const [added, setAdded] = useState(false)

  useEffect(() => {
    if (product) capture('product_viewed', { product_id: product.id, product_name: product.name, price: product.price, category: product.category })
  }, [product])

  if (!product) return <NotFound />
  const related = PRODUCTS.filter((p) => p.id !== product.id && p.category === product.category).concat(PRODUCTS.filter((p) => p.id !== product.id && p.category !== product.category)).slice(0, 3)

  const onAdd = () => {
    add(product.id, qty)
    capture('add_to_cart', { product_id: product.id, product_name: product.name, price: product.price, quantity: qty })
    setAdded(true)
    setTimeout(() => setAdded(false), 1600)
  }

  return (
    <>
      <nav className="py-5 text-xs text-[var(--nl-ink-3)]" aria-label="Breadcrumb">
        <Link to={STORE_BASE} className="nl-link">
          Shop
        </Link>
        <span className="mx-2">/</span>
        <Link to={`${STORE_BASE}?c=${product.category}`} className="nl-link capitalize">
          {product.category}
        </Link>
        <span className="mx-2">/</span>
        <span className="text-[var(--nl-ink-2)]">{product.name}</span>
      </nav>
      <div className="grid gap-8 md:grid-cols-2">
        <ProductArt product={product} className="aspect-square rounded-2xl" />
        <section className="flex flex-col">
          <p className="text-xs font-semibold tracking-[0.14em] text-[var(--nl-accent)] uppercase">{product.category}</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.02em]">{product.name}</h1>
          <div className="mt-2 flex items-center gap-2 text-xs text-[var(--nl-ink-2)]">
            <Stars rating={product.rating} />
            <span>
              {product.rating.toFixed(1)} · {product.reviews.toLocaleString()} reviews
            </span>
          </div>
          <p className="mt-4 text-[15px] leading-relaxed text-[var(--nl-ink-2)]">{product.tagline}</p>
          <p className="mt-6 text-2xl font-semibold">{formatPrice(product.price)}</p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <div className="inline-flex h-11 items-center rounded-[10px] border border-[var(--nl-line)] bg-[var(--nl-card)]">
              <button type="button" className="nl-btn nl-btn-ghost h-full w-10 px-0" onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="Decrease quantity">
                −
              </button>
              <span className="w-8 text-center text-sm font-semibold tabular-nums" aria-live="polite">
                {qty}
              </span>
              <button type="button" className="nl-btn nl-btn-ghost h-full w-10 px-0" onClick={() => setQty((q) => Math.min(9, q + 1))} aria-label="Increase quantity">
                +
              </button>
            </div>
            <button type="button" className="nl-btn nl-btn-primary flex-1 sm:flex-none sm:min-w-44" onClick={onAdd} data-track="add-to-cart">
              {added ? 'Added ✓' : 'Add to cart'}
            </button>
          </div>
          <ul className="mt-8 grid gap-2 text-sm text-[var(--nl-ink-2)]">
            <li className="flex gap-2">
              <Check /> Free returns within 60 days
            </li>
            <li className="flex gap-2">
              <Check /> 2-year warranty, no registration
            </li>
            <li className="flex gap-2">
              <Check /> Ships tomorrow from Portland, OR
            </li>
          </ul>
        </section>
      </div>
      <section className="mt-14">
        <h2 className="mb-4 text-lg font-semibold tracking-tight">You might also like</h2>
        <div className="grid grid-cols-3 gap-4">
          {related.map((p) => (
            <Link key={p.id} to={`${STORE_BASE}/p/${p.id}`} className="nl-card nl-tile block overflow-hidden" data-track="related">
              <ProductArt product={p} className="aspect-[4/3]" />
              <div className="p-3">
                <div className="truncate text-sm font-semibold">{p.name}</div>
                <div className="text-xs text-[var(--nl-ink-2)]">{formatPrice(p.price)}</div>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </>
  )
}

function CartPage() {
  const lines = useCart((s) => s.lines)
  const setQty = useCart((s) => s.setQty)
  const remove = useCart((s) => s.remove)
  const totals = cartTotals(lines)

  if (!lines.length) {
    return (
      <div className="py-24 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Your cart is empty</h1>
        <p className="mt-2 text-sm text-[var(--nl-ink-2)]">Nothing here yet. The lamp is very good.</p>
        <Link to={STORE_BASE} className="nl-btn nl-btn-primary mt-6" data-track="empty-cart-shop">
          Back to the shop
        </Link>
      </div>
    )
  }

  return (
    <>
      <h1 className="pt-8 pb-6 text-2xl font-semibold tracking-tight">Cart</h1>
      <div className="grid gap-6 md:grid-cols-[1fr_320px]">
        <ul className="nl-card divide-y divide-[var(--nl-line)]">
          {lines.map((l) => {
            const p = findProduct(l.productId)
            if (!p) return null
            return (
              <li key={l.productId} className="flex items-center gap-4 p-4">
                <Link to={`${STORE_BASE}/p/${p.id}`} className="shrink-0">
                  <ProductArt product={p} className="size-16 rounded-xl" />
                </Link>
                <div className="min-w-0 flex-1">
                  <Link to={`${STORE_BASE}/p/${p.id}`} className="block truncate text-sm font-semibold">
                    {p.name}
                  </Link>
                  <div className="text-xs text-[var(--nl-ink-2)]">{formatPrice(p.price)} each</div>
                  <div className="mt-2 inline-flex h-8 items-center rounded-lg border border-[var(--nl-line)]">
                    <button type="button" className="nl-btn nl-btn-ghost h-full w-8 px-0 text-base" onClick={() => setQty(p.id, l.qty - 1)} aria-label={`Decrease ${p.name} quantity`}>
                      −
                    </button>
                    <span className="w-7 text-center text-sm font-semibold tabular-nums">{l.qty}</span>
                    <button type="button" className="nl-btn nl-btn-ghost h-full w-8 px-0 text-base" onClick={() => setQty(p.id, l.qty + 1)} aria-label={`Increase ${p.name} quantity`}>
                      +
                    </button>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold tabular-nums">{formatPrice(p.price * l.qty)}</div>
                  <button type="button" className="mt-1 text-xs text-[var(--nl-ink-3)] underline-offset-2 hover:text-[var(--nl-danger)] hover:underline" onClick={() => remove(p.id)} data-track="remove-line">
                    Remove
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
        <aside className="nl-card h-fit p-5">
          <h2 className="text-sm font-semibold">Summary</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between text-[var(--nl-ink-2)]">
              <dt>Subtotal ({totals.items} items)</dt>
              <dd className="tabular-nums">{formatPrice(totals.subtotal)}</dd>
            </div>
            <div className="flex justify-between text-[var(--nl-ink-2)]">
              <dt>Shipping</dt>
              <dd className="tabular-nums">{totals.shipping === 0 ? 'Free' : formatPrice(totals.shipping)}</dd>
            </div>
            <div className="flex justify-between border-t border-[var(--nl-line)] pt-2 font-semibold">
              <dt>Total</dt>
              <dd className="tabular-nums">{formatPrice(totals.total)}</dd>
            </div>
          </dl>
          <button
            type="button"
            className="nl-btn nl-btn-primary mt-5 w-full"
            data-track="checkout"
            onClick={() => {
              capture('checkout_started', { cart_value: totals.total, items: totals.items })
              navigate(`${STORE_BASE}/checkout`)
            }}
          >
            Checkout
          </button>
          <Link to={STORE_BASE} className="nl-btn nl-btn-ghost mt-2 w-full">
            Continue shopping
          </Link>
        </aside>
      </div>
    </>
  )
}

function NotFound() {
  return (
    <div className="py-24 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">That page does not exist</h1>
      <Link to={STORE_BASE} className="nl-btn nl-btn-primary mt-6">
        Back to the shop
      </Link>
    </div>
  )
}

function Check() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--nl-accent)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="mt-0.5 shrink-0">
      <path d="m5 12 4.5 4.5L19 7" />
    </svg>
  )
}

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link, navigate } from '../app/router'
import { findProduct, formatPrice } from './catalog'
import { ProductArt } from './art'
import { cartTotals, useCart } from './cart'
import { capture, useFlag } from './tracking'

const STORE_BASE = '/demo/store'

/** The payment step is deliberately slow: ~3.2s with a spinner and no feedback that a click landed. */
const PAYMENT_DELAY_MS = 3200

interface FormState {
  email: string
  name: string
  address: string
  city: string
  zip: string
  card: string
  expiry: string
  cvc: string
}

const EMPTY: FormState = { email: '', name: '', address: '', city: '', zip: '', card: '', expiry: '', cvc: '' }

function usePayment(variant: 'express' | 'legacy') {
  const lines = useCart((s) => s.lines)
  const clear = useCart((s) => s.clear)
  const [processing, setProcessing] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const totals = cartTotals(lines)

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )

  const pay = () => {
    if (processing) {
      // Extra clicks are silently ignored: exactly the frustration the
      // $rageclick autocapture is designed to surface.
      return
    }
    setProcessing(true)
    capture('payment_submitted', { order_value: totals.total, items: totals.items, checkout_variant: variant })
    timer.current = setTimeout(() => {
      const orderId = `NL-${Math.floor(1000 + Math.random() * 9000)}`
      capture('purchase_completed', {
        order_id: orderId,
        order_value: totals.total,
        items: totals.items,
        product_id: lines[0]?.productId ?? null,
        checkout_variant: variant,
      })
      try {
        sessionStorage.setItem('northlight:last-order', JSON.stringify({ orderId, total: totals.total, items: totals.items }))
      } catch {
        /* ignore */
      }
      clear()
      navigate(`${STORE_BASE}/done`)
    }, PAYMENT_DELAY_MS)
  }

  return { lines, totals, processing, pay }
}

export function Checkout() {
  const express = useFlag('new-checkout')
  const lines = useCart((s) => s.lines)
  if (!lines.length) {
    return (
      <div className="py-24 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Nothing to check out</h1>
        <Link to={STORE_BASE} className="nl-btn nl-btn-primary mt-6">
          Back to the shop
        </Link>
      </div>
    )
  }
  return express ? <ExpressCheckout /> : <LegacyCheckout />
}

/* ------------------------------ express (flag on) ------------------------------ */

function ExpressCheckout() {
  const { totals, processing, pay } = usePayment('express')
  const [form, setForm] = useState<FormState>(EMPTY)
  const update = (key: keyof FormState) => (v: string) => setForm((f) => ({ ...f, [key]: v }))

  const submit = (e: FormEvent) => {
    e.preventDefault()
    pay()
  }

  return (
    <CheckoutFrame title="Express checkout" subtitle="One page, one button. This is the new-checkout variant." totals={totals}>
      <form onSubmit={submit} className="grid gap-5" data-variant="express" noValidate>
        <Section title="Contact">
          <Field label="Email" value={form.email} onChange={update('email')} type="email" placeholder="you@example.com" autoComplete="email" />
        </Section>
        <Section title="Shipping">
          <Field label="Full name" value={form.name} onChange={update('name')} placeholder="Ada Lovelace" autoComplete="name" />
          <Field label="Address" value={form.address} onChange={update('address')} placeholder="12 Analytical Engine Way" autoComplete="street-address" />
          <div className="grid grid-cols-[1fr_120px] gap-3">
            <Field label="City" value={form.city} onChange={update('city')} placeholder="Portland" autoComplete="address-level2" />
            <Field label="ZIP" value={form.zip} onChange={update('zip')} placeholder="97201" inputMode="numeric" autoComplete="postal-code" />
          </div>
        </Section>
        <Section title="Payment" masked>
          <CardFields form={form} update={update} />
        </Section>
        <PayButton processing={processing} label={`Pay ${formatPrice(totals.total)}`} />
      </form>
    </CheckoutFrame>
  )
}

/* ------------------------------ legacy (flag off) ------------------------------ */

const LEGACY_STEPS = ['Shipping', 'Payment', 'Review'] as const

function LegacyCheckout() {
  const { lines, totals, processing, pay } = usePayment('legacy')
  const [step, setStep] = useState(0)
  const [form, setForm] = useState<FormState>(EMPTY)
  const update = (key: keyof FormState) => (v: string) => setForm((f) => ({ ...f, [key]: v }))

  const next = (e: FormEvent) => {
    e.preventDefault()
    capture('checkout_step_completed', { step: LEGACY_STEPS[step], step_index: step, checkout_variant: 'legacy' })
    setStep((s) => Math.min(LEGACY_STEPS.length - 1, s + 1))
  }

  return (
    <CheckoutFrame title="Checkout" subtitle="Three steps, the old way. This is the control variant." totals={totals}>
      <ol className="mb-6 flex items-center gap-2 text-xs font-medium" aria-label="Checkout progress">
        {LEGACY_STEPS.map((label, i) => (
          <li key={label} className="flex items-center gap-2">
            <span
              className={`flex size-6 items-center justify-center rounded-full text-[11px] ${
                i < step ? 'bg-[var(--nl-accent)] text-white' : i === step ? 'bg-[var(--nl-ink)] text-white' : 'border border-[var(--nl-line)] text-[var(--nl-ink-3)]'
              }`}
              aria-current={i === step ? 'step' : undefined}
            >
              {i < step ? '✓' : i + 1}
            </span>
            <span className={i === step ? 'text-[var(--nl-ink)]' : 'text-[var(--nl-ink-3)]'}>{label}</span>
            {i < LEGACY_STEPS.length - 1 ? <span className="mx-1 h-px w-6 bg-[var(--nl-line)]" /> : null}
          </li>
        ))}
      </ol>

      {step === 0 ? (
        <form onSubmit={next} className="grid gap-5" data-variant="legacy" data-step="shipping" noValidate>
          <Section title="Contact">
            <Field label="Email" value={form.email} onChange={update('email')} type="email" placeholder="you@example.com" autoComplete="email" />
          </Section>
          <Section title="Shipping address">
            <Field label="Full name" value={form.name} onChange={update('name')} placeholder="Ada Lovelace" autoComplete="name" />
            <Field label="Address" value={form.address} onChange={update('address')} placeholder="12 Analytical Engine Way" autoComplete="street-address" />
            <div className="grid grid-cols-[1fr_120px] gap-3">
              <Field label="City" value={form.city} onChange={update('city')} placeholder="Portland" autoComplete="address-level2" />
              <Field label="ZIP" value={form.zip} onChange={update('zip')} placeholder="97201" inputMode="numeric" autoComplete="postal-code" />
            </div>
          </Section>
          <button type="submit" className="nl-btn nl-btn-primary" data-track="legacy-continue-shipping">
            Continue to payment
          </button>
        </form>
      ) : step === 1 ? (
        <form onSubmit={next} className="grid gap-5" data-variant="legacy" data-step="payment" noValidate>
          <Section title="Payment" masked>
            <CardFields form={form} update={update} />
          </Section>
          <div className="flex gap-2">
            <button type="button" className="nl-btn nl-btn-secondary" onClick={() => setStep(0)}>
              Back
            </button>
            <button type="submit" className="nl-btn nl-btn-primary" data-track="legacy-continue-payment">
              Review order
            </button>
          </div>
        </form>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            pay()
          }}
          className="grid gap-5"
          data-variant="legacy"
          data-step="review"
        >
          <Section title="Review">
            <ul className="divide-y divide-[var(--nl-line)] text-sm">
              {lines.map((l) => {
                const p = findProduct(l.productId)
                if (!p) return null
                return (
                  <li key={l.productId} className="flex items-center justify-between py-2">
                    <span>
                      {l.qty} × {p.name}
                    </span>
                    <span className="tabular-nums">{formatPrice(p.price * l.qty)}</span>
                  </li>
                )
              })}
            </ul>
            <p className="mt-3 text-xs text-[var(--nl-ink-3)]">
              Ships to {form.name || 'you'} · {form.address || 'address on file'} · card ending {form.card.replace(/\s/g, '').slice(-4) || '••••'}
            </p>
          </Section>
          <div className="flex gap-2">
            <button type="button" className="nl-btn nl-btn-secondary" onClick={() => setStep(1)}>
              Back
            </button>
            <PayButton processing={processing} label="Place order" />
          </div>
        </form>
      )}
    </CheckoutFrame>
  )
}

/* --------------------------------- shared bits --------------------------------- */

function CheckoutFrame({ title, subtitle, totals, children }: { title: string; subtitle: string; totals: ReturnType<typeof cartTotals>; children: ReactNode }) {
  const lines = useCart((s) => s.lines)
  return (
    <>
      <div className="pt-8 pb-6">
        <Link to={`${STORE_BASE}/cart`} className="nl-link text-xs">
          ← Back to cart
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-[var(--nl-ink-2)]">{subtitle}</p>
      </div>
      <div className="grid gap-6 md:grid-cols-[1fr_320px]">
        <div className="nl-card p-5 sm:p-6">{children}</div>
        <aside className="nl-card h-fit p-5">
          <h2 className="text-sm font-semibold">Order</h2>
          <ul className="mt-3 space-y-3">
            {lines.map((l) => {
              const p = findProduct(l.productId)
              if (!p) return null
              return (
                <li key={l.productId} className="flex items-center gap-3 text-sm">
                  <ProductArt product={p} className="size-10 shrink-0 rounded-lg" />
                  <span className="min-w-0 flex-1 truncate">
                    {l.qty} × {p.name}
                  </span>
                  <span className="tabular-nums">{formatPrice(p.price * l.qty)}</span>
                </li>
              )
            })}
          </ul>
          <dl className="mt-4 space-y-1.5 border-t border-[var(--nl-line)] pt-3 text-sm">
            <div className="flex justify-between text-[var(--nl-ink-2)]">
              <dt>Shipping</dt>
              <dd>{totals.shipping === 0 ? 'Free' : formatPrice(totals.shipping)}</dd>
            </div>
            <div className="flex justify-between font-semibold">
              <dt>Total</dt>
              <dd className="tabular-nums">{formatPrice(totals.total)}</dd>
            </div>
          </dl>
        </aside>
      </div>
    </>
  )
}

function Section({ title, children, masked }: { title: string; children: ReactNode; masked?: boolean }) {
  return (
    <fieldset className="grid gap-3" {...(masked ? { 'data-mask': '' } : {})}>
      <legend className="mb-2 flex items-center gap-2 text-sm font-semibold">
        {title}
        {masked ? (
          <span className="rounded-full bg-[var(--nl-accent-soft)] px-2 py-0.5 text-[10px] font-medium text-[var(--nl-accent)]" title="Marked data-mask: the recorder stores bullets, never the digits">
            masked in replay
          </span>
        ) : null}
      </legend>
      {children}
    </fieldset>
  )
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  inputMode,
  autoComplete,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  placeholder?: string
  inputMode?: 'numeric' | 'text'
  autoComplete?: string
}) {
  const id = `f-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
  return (
    <div>
      <label htmlFor={id} className="nl-label">
        {label}
      </label>
      <input id={id} name={id} className="nl-field" type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} inputMode={inputMode} autoComplete={autoComplete} />
    </div>
  )
}

function CardFields({ form, update }: { form: FormState; update: (k: keyof FormState) => (v: string) => void }) {
  return (
    <>
      <Field label="Card number" value={form.card} onChange={(v) => update('card')(formatCard(v))} placeholder="4242 4242 4242 4242" inputMode="numeric" autoComplete="cc-number" />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Expiry" value={form.expiry} onChange={update('expiry')} placeholder="MM / YY" inputMode="numeric" autoComplete="cc-exp" />
        <Field label="CVC" value={form.cvc} onChange={(v) => update('cvc')(v.replace(/\D/g, '').slice(0, 4))} placeholder="123" inputMode="numeric" autoComplete="cc-csc" />
      </div>
    </>
  )
}

function formatCard(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 16)
  return digits.replace(/(\d{4})(?=\d)/g, '$1 ')
}

function PayButton({ processing, label }: { processing: boolean; label: string }) {
  return (
    <button type="submit" className="nl-btn nl-btn-primary min-w-44" data-track="pay" aria-busy={processing}>
      {processing ? (
        <>
          <svg className="hs-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.3" strokeWidth="3" />
            <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          </svg>
          Contacting your bank…
        </>
      ) : (
        label
      )}
    </button>
  )
}

export function OrderDone() {
  const [order] = useState(() => {
    try {
      const raw = sessionStorage.getItem('northlight:last-order')
      return raw ? (JSON.parse(raw) as { orderId: string; total: number; items: number }) : null
    } catch {
      return null
    }
  })
  return (
    <div className="mx-auto max-w-md py-20 text-center">
      <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-[var(--nl-accent-soft)] text-[var(--nl-accent)]">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m5 12 4.5 4.5L19 7" />
        </svg>
      </div>
      <h1 className="mt-5 text-2xl font-semibold tracking-tight">Order placed</h1>
      <p className="mt-2 text-sm text-[var(--nl-ink-2)]">
        {order ? (
          <>
            Order <span className="font-mono font-semibold text-[var(--nl-ink)]">{order.orderId}</span> · {order.items} {order.items === 1 ? 'item' : 'items'} · {formatPrice(order.total)}
          </>
        ) : (
          'Thanks for shopping with us.'
        )}
      </p>
      <p className="mt-1 text-xs text-[var(--nl-ink-3)]">Nothing was charged. Nothing will ship. It is a demo.</p>
      <Link to={STORE_BASE} className="nl-btn nl-btn-primary mt-8" data-track="continue-shopping">
        Continue shopping
      </Link>
    </div>
  )
}

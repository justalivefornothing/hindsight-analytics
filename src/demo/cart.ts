import { create } from 'zustand'
import { findProduct } from './catalog'

export interface CartLine {
  productId: string
  qty: number
}

interface CartState {
  lines: CartLine[]
  add(productId: string, qty?: number): void
  setQty(productId: string, qty: number): void
  remove(productId: string): void
  clear(): void
}

const KEY = 'northlight:cart'

function load(): CartLine[] {
  try {
    const raw = sessionStorage.getItem(KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (l): l is CartLine =>
        typeof l === 'object' && l !== null && typeof (l as CartLine).productId === 'string' && typeof (l as CartLine).qty === 'number',
    )
  } catch {
    return []
  }
}

function save(lines: CartLine[]) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(lines))
  } catch {
    /* storage unavailable */
  }
}

export const useCart = create<CartState>((set) => ({
  lines: load(),
  add(productId, qty = 1) {
    set((s) => {
      const existing = s.lines.find((l) => l.productId === productId)
      const lines = existing
        ? s.lines.map((l) => (l.productId === productId ? { ...l, qty: Math.min(9, l.qty + qty) } : l))
        : [...s.lines, { productId, qty }]
      save(lines)
      return { lines }
    })
  },
  setQty(productId, qty) {
    set((s) => {
      const lines = qty <= 0 ? s.lines.filter((l) => l.productId !== productId) : s.lines.map((l) => (l.productId === productId ? { ...l, qty: Math.min(9, qty) } : l))
      save(lines)
      return { lines }
    })
  },
  remove(productId) {
    set((s) => {
      const lines = s.lines.filter((l) => l.productId !== productId)
      save(lines)
      return { lines }
    })
  },
  clear() {
    save([])
    set({ lines: [] })
  },
}))

export function cartTotals(lines: CartLine[]) {
  let items = 0
  let subtotal = 0
  for (const l of lines) {
    const p = findProduct(l.productId)
    if (!p) continue
    items += l.qty
    subtotal += p.price * l.qty
  }
  const shipping = subtotal === 0 || subtotal >= 75 ? 0 : 8
  return { items, subtotal, shipping, total: subtotal + shipping }
}

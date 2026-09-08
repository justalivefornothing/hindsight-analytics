/** Small deterministic PRNG (mulberry32) so seeded data is reproducible. */
export function createRng(seed: number) {
  let a = seed >>> 0
  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return {
    next,
    /** integer in [min, max] inclusive */
    int(min: number, max: number): number {
      return min + Math.floor(next() * (max - min + 1))
    },
    /** float in [min, max) */
    range(min: number, max: number): number {
      return min + next() * (max - min)
    },
    chance(p: number): boolean {
      return next() < p
    },
    pick<T>(items: readonly T[]): T {
      return items[Math.floor(next() * items.length)]
    },
    /** roughly normal around mean via the sum of three uniforms */
    gauss(mean: number, spread: number): number {
      return mean + (next() + next() + next() - 1.5) * spread
    },
    hex(len: number): string {
      let s = ''
      while (s.length < len) s += Math.floor(next() * 16).toString(16)
      return s.slice(0, len)
    },
  }
}

export type Rng = ReturnType<typeof createRng>

/** Deterministic RNG: fnv1a string hash → mulberry32 stream. */

export function fnv1a(str: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

export type Rng = () => number

export function mulberry32(seed: number): Rng {
  let t = seed >>> 0
  return () => {
    t = (t + 0x6d2b79f5) | 0
    let x = Math.imul(t ^ (t >>> 15), 1 | t)
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x
    return ((x ^ (x >>> 14)) >>> 0) / 0x100000000
  }
}

export function rngFromString(s: string): Rng {
  return mulberry32(fnv1a(s))
}

/** Advance a stream n steps (used to resume a persisted round deterministically). */
export function skip(rng: Rng, n: number): void {
  for (let i = 0; i < n; i++) rng()
}

/** Weighted pick over {key: weight}; weights need not sum to anything. */
export function pickWeighted<K extends string>(rng: Rng, weights: Record<K, number>): K {
  const entries = Object.entries(weights) as [K, number][]
  const total = entries.reduce((s, [, w]) => s + Math.max(0, w), 0)
  if (total <= 0) return entries[0][0]
  let roll = rng() * total
  for (const [k, w] of entries) {
    roll -= Math.max(0, w)
    if (roll <= 0) return k
  }
  return entries[entries.length - 1][0]
}

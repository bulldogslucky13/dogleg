/**
 * Fortune: hole-in-one and albatross odds, plus the destiny guarantee.
 *
 * Two independent tracks (ace on par-3 tee shots, albatross on par-5
 * go-for-the-green attempts). Counters ride inside the round seed, so the
 * server referee and replay links resolve the exact same luck the player saw.
 *
 * Destiny — the guarantee that a loyal player eventually gets their moment —
 * is deliberately NOT part of the displayed odds. The odds table stays a true
 * model of the dice; when a counter crosses its threshold, destiny overrides
 * the roll on the round's first qualifying shot. This is the game's one
 * sanctioned exception to "the odds never lie", chosen to keep the moment a
 * total surprise. Everything else here (the small probability boosts) flows
 * through the honest odds like any other number.
 *
 * Par-3 short courses (CourseSpec.par3Course) are OUTSIDE fortune entirely:
 * no destiny, no per-shot boosts, and their rounds don't move the drought
 * counters (see destinyPlan/fortuneOddsFor in replay.ts and
 * updateFortuneAfterRound in the store). With 9-18 ace chances per round,
 * any of those hooks would turn the shorts into an ace farm. Aces there ride
 * the base HOLEOUT.par3Tee odds alone — simulated per-round ace chance lands
 * at ~1-in-70 (aggressive, 18 holes) through ~1-in-380 (safe, 9 holes),
 * rare enough to stay special, common enough to actually happen.
 */
import type { CourseSpec } from './types'

/** Is this course inside fortune at all? Par-3 short courses are excluded
 * entirely (see the module doc above) — single predicate so destinyPlan/
 * fortuneOddsFor (replay.ts) and updateFortuneAfterRound (store.ts) can
 * never independently drift on which courses the exclusion covers. */
export function fortuneEligible(course: Pick<CourseSpec, 'par3Course'>): boolean {
  return !course.par3Course
}

export const FORTUNE_CONFIG = {
  practice: {
    /** expected rounds per event at k = 0, then +step per event, capped */
    baseThreshold: 500,
    step: 50,
    capThreshold: 1000,
  },
  daily: {
    /** expected rounds per event before the loyalty multiplier */
    threshold: 200,
    /** destiny fires once this many dailies pass without the event */
    guaranteeAt: 150,
    /** streak multiplier: 1x at 0 days → maxMult at streakForMax days */
    maxMult: 3,
    streakForMax: 30,
  },
  /** average qualifying shots per round, used to convert round odds → shot odds */
  par3sPerRound: 4,
  goAttemptsPerRound: 2,
} as const

export interface FortuneState {
  /** rounds since last ace / albatross, per mode */
  ace: number
  alb: number
  /** practice threshold indexes (how many of each you've already had) */
  aceK: number
  albK: number
  /** current daily streak (drives the loyalty multiplier; daily mode only) */
  streak: number
}

export const EMPTY_FORTUNE: FortuneState = { ace: 0, alb: 0, aceK: 0, albK: 0, streak: 0 }

export function practiceThreshold(k: number): number {
  const { baseThreshold, step, capThreshold } = FORTUNE_CONFIG.practice
  return Math.min(baseThreshold + step * Math.max(0, k), capThreshold)
}

export function loyaltyMult(streak: number): number {
  const { maxMult, streakForMax } = FORTUNE_CONFIG.daily
  return 1 + (maxMult - 1) * (Math.min(Math.max(streak, 0), streakForMax) / streakForMax)
}

/** Per-shot probabilities the honest odds tables use. */
export function fortuneShotOdds(mode: 'daily' | 'practice', f: FortuneState): { acePerShot: number; albPerShot: number } {
  if (mode === 'daily') {
    const mult = loyaltyMult(f.streak)
    return {
      acePerShot: mult / (FORTUNE_CONFIG.daily.threshold * FORTUNE_CONFIG.par3sPerRound),
      albPerShot: mult / (FORTUNE_CONFIG.daily.threshold * FORTUNE_CONFIG.goAttemptsPerRound),
    }
  }
  return {
    acePerShot: 1 / (practiceThreshold(f.aceK) * FORTUNE_CONFIG.par3sPerRound),
    albPerShot: 1 / (practiceThreshold(f.albK) * FORTUNE_CONFIG.goAttemptsPerRound),
  }
}

/** Destiny: has this track crossed its guarantee threshold? */
export function destinyDue(mode: 'daily' | 'practice', f: FortuneState): { ace: boolean; albatross: boolean } {
  if (mode === 'daily') {
    return {
      ace: f.ace >= FORTUNE_CONFIG.daily.guaranteeAt,
      albatross: f.alb >= FORTUNE_CONFIG.daily.guaranteeAt,
    }
  }
  return {
    ace: f.ace >= practiceThreshold(f.aceK),
    albatross: f.alb >= practiceThreshold(f.albK),
  }
}

// ---------------------------------------------------------------------------
// Seed codec — `f<ace>.<aceK>.<alb>.<albK>.<streak>` as a trailing segment
// ---------------------------------------------------------------------------

const MAX_COUNTER = 100_000
const MAX_K = 50
const MAX_STREAK = 365

const clampInt = (v: number, max: number) => Math.max(0, Math.min(max, Math.floor(Number.isFinite(v) ? v : 0)))

export function clampFortune(f: FortuneState): FortuneState {
  return {
    ace: clampInt(f.ace, MAX_COUNTER),
    alb: clampInt(f.alb, MAX_COUNTER),
    aceK: clampInt(f.aceK, MAX_K),
    albK: clampInt(f.albK, MAX_K),
    streak: clampInt(f.streak, MAX_STREAK),
  }
}

export function encodeFortune(f: FortuneState): string {
  const c = clampFortune(f)
  return `f${c.ace}.${c.aceK}.${c.alb}.${c.albK}.${c.streak}`
}

const FORTUNE_RE = /:f(\d{1,6})\.(\d{1,3})\.(\d{1,6})\.(\d{1,3})\.(\d{1,4})$/

/** Split a seed into its fortune (if any) and the seed without the tail —
 * conditions and dice keys always use the stripped seed for stability. */
export function splitFortune(seed: string): { base: string; fortune: FortuneState | null } {
  const m = FORTUNE_RE.exec(seed)
  if (!m) return { base: seed, fortune: null }
  return {
    base: seed.slice(0, m.index),
    fortune: clampFortune({
      ace: Number(m[1]),
      aceK: Number(m[2]),
      alb: Number(m[3]),
      albK: Number(m[4]),
      streak: Number(m[5]),
    }),
  }
}

/** UI copy for the splash screens, shared so tests can assert on it. */
export const MOMENT_COPY: Record<'ace' | 'albatross', { title: string; sub: string }> = {
  ace: { title: 'HOLE IN ONE', sub: 'One swing. Bottom of the cup.' },
  albatross: { title: 'ALBATROSS', sub: 'Two shots on a par five. Nobody does that.' },
}

export type MomentKind = 'ace' | 'albatross'

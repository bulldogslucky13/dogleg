import { rngFromString } from './rng'
import type { CourseSpec, HoleScore } from './types'

/**
 * Mis-fortune: Fortune's evil twin. A rare random catastrophe that forces one
 * hole to DOUBLE PAR — a day-ruiner built for group-chat outrage, handled with
 * comedy, never punishment energy.
 *
 * The rules, all of them:
 *  - PAR 4s ONLY. A double-par 6 on a par 3 is a bad joke and a 10 on a par 5
 *    is a war crime — an 8 on a par 4 is exactly funny enough.
 *  - At most ONE per round: the roll walks the par 4s in play order and the
 *    first hit is the only hit. The joke needs one villain, not a crime spree.
 *  - The double-par override is the ONLY effect. No streak loss, no record
 *    wipe, no cascading anything. It ruins one card. That's the entire bit.
 *  - FORTUNE OUTRANKS: if the cursed hole somehow resolves eagle-or-better,
 *    the curse is spared (not moved — the round simply escapes). Crushing an
 *    eagle with an 8 is the one version of this that's cruelty, not comedy.
 *
 * Determinism — the part that keeps the referee honest: the roll derives from
 * the round seed (stripped of the client-kept fortune tail, same discipline
 * as the dice) via its own hash stream, so client, referee replay, and watch
 * links all resolve the identical catastrophe, and the roll consumes NOTHING
 * from the shared shot rng — pre-cutover dice are bit-for-bit untouched.
 *
 * Versioning: a cursed score is a change to what a seed + decisions replay
 * into, so it is GATED per the conditions-versioning note in daily.ts —
 * dailies on MISFORTUNE_FROM_DATEKEY, practice on the practice3: seed prefix.
 * Historical seeds replay exactly as dealt, forever. ENGINE_VERSION bumped in
 * the same change.
 */

export const MISFORTUNE_CONFIG = {
  /** One event expected per this many PAR-4 HOLES played, per mode. The
   * per-hole roll IS this number — round-level frequency follows from the
   * course's par-4 count (~10 per round → roughly 1-in-190 rounds at 2000).
   * Retune by changing a number; 0 disables the mode entirely. Splash and
   * share copy read these values, so the punchline can never drift from the
   * real odds. */
  daily: { par4sPerEvent: 2000 },
  practice: { par4sPerEvent: 2000 },
} as const

/** Dailies dealt before this date replay uncursed, exactly as played. */
export const MISFORTUNE_FROM_DATEKEY = '2026-07-29'

/** Is mis-fortune live for this seed at all? Dailies gate on the cutover
 * date; practice gates on the seed prefix (practice3: and later). */
export function misfortuneLive(mode: 'daily' | 'practice', baseSeed: string, dateKey?: string): boolean {
  if (mode === 'daily') return Boolean(dateKey && dateKey >= MISFORTUNE_FROM_DATEKEY)
  const m = /^practice(\d*):/.exec(baseSeed)
  return Boolean(m && Number(m[1] || 1) >= 3)
}

/**
 * The roll: returns the 0-based index of the cursed hole, or null. Pure
 * function of (base seed, mode, course) — no state, no shared rng stream.
 */
export function misfortuneHole(
  mode: 'daily' | 'practice',
  baseSeed: string,
  course: Pick<CourseSpec, 'holes'>,
  dateKey?: string,
): number | null {
  const perHoles = MISFORTUNE_CONFIG[mode].par4sPerEvent
  if (!perHoles || perHoles <= 0) return null
  if (!misfortuneLive(mode, baseSeed, dateKey)) return null
  for (let i = 0; i < course.holes.length; i++) {
    if (course.holes[i].par !== 4) continue
    // one draw per par 4, its own keyed stream — first hit is the only hit
    if (rngFromString(`${baseSeed}:mf:${course.holes[i].number}`)() < 1 / perHoles) return i
  }
  return null
}

/**
 * The override, applied at hole completion by BOTH the client store and the
 * referee's replay: double par, categorised as the worst result bucket. The
 * shot record stays untouched — the replay shows what actually happened,
 * the card shows what the golf gods decided it was worth.
 * Spares eagle-or-better (see module doc).
 */
export function applyMisfortune(score: HoleScore, par: number): HoleScore {
  if (score.strokes <= par - 2) return score // fortune outranks
  return {
    ...score,
    strokes: par * 2,
    result: 'triple',
    note: 'Mis-fortune',
    misfortune: true,
  }
}

// ---------------------------------------------------------------------------
// The comedy — splash + share copy. Punchlines quote the REAL odds from
// config, so a retune rewrites the joke automatically.
// ---------------------------------------------------------------------------

export function misfortuneOddsCopy(mode: 'daily' | 'practice'): string {
  return `This hits one par 4 in ${MISFORTUNE_CONFIG[mode].par4sPerEvent.toLocaleString()}. It chose you.`
}

/** Rotating punchlines. Deterministic pick per seed, so the referee-replayed
 * share and the live splash tell the same joke. Built per mode so the one
 * line that quotes the odds always quotes the CURRENT config. */
export function misfortuneLines(mode: 'daily' | 'practice' = 'daily'): readonly string[] {
  const n = MISFORTUNE_CONFIG[mode].par4sPerEvent.toLocaleString()
  return [
    'An 8 on a par 4. Frame it. Hang it somewhere the kids can’t see.',
    'The golf gods reward the faithful. You, they picked for content.',
    'Statistically, buy a lottery ticket. Emotionally, lie down.',
    'Your ball found water that is not on the map.',
    `One in ${n}. You absolute unicorn.`,
    'This is why scorecards are written in pencil.',
    'Grief has five stages. The group chat is all of them.',
    'Somewhere a butterfly flapped its wings. Anyway, that’s an 8.',
    'Take the 8. Tell no one. (Share button below.)',
    'New personal worst on that hole. Cherish it.',
  ]
}

export function misfortuneLine(baseSeed: string, mode: 'daily' | 'practice' = 'daily'): string {
  const lines = misfortuneLines(mode)
  return lines[Math.floor(rngFromString(`${baseSeed}:mfline`)() * lines.length)]
}

export const MISFORTUNE_COPY = {
  title: 'MIS-FORTUNE',
  /** the splash sub-line is the odds setup; the rotating line is the punch */
  sub: misfortuneOddsCopy,
} as const

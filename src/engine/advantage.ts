import { approachOdds, longOdds, puttOdds, type ApproachMode } from './odds'
import type { BallState, CharacterAdvantage, CharacterId, Choice, Conditions, HoleLayout } from './types'

/**
 * Character-advantage detection. Each helper recomputes the same shot's odds
 * WITHOUT the character and only fires when the character measurably improved
 * the odds of the good outcome that actually happened — so the callout is
 * always earned, never decorative.
 */

const MIN_DELTA = 0.03

const pctUp = (delta: number) => `+${Math.round(delta * 100)}%`

/** Tee shots — the Fairway Finder's length + accuracy (buff is tee-only). */
export function longAdvantage(
  layout: HoleLayout,
  cond: Conditions,
  preBall: BallState,
  choice: Choice,
  character: CharacterId | undefined,
  outcome: string,
): CharacterAdvantage | null {
  if (character !== 'fairway') return null
  if (outcome !== 'dialed' && outcome !== 'fairway') return null
  const withC = longOdds(layout, cond, preBall, choice, 'tee', 'fairway').odds
  const base = longOdds(layout, cond, preBall, choice, 'tee', undefined).odds
  const delta = withC.dialed + withC.fairway - (base.dialed + base.fairway)
  if (delta < MIN_DELTA) return null
  const note =
    base.water >= 0.04
      ? 'You flew water that catches a lot of players — your length carried it clean.'
      : base.sand + base.trees >= 0.12
        ? 'Bombed it past the trouble and into the short grass.'
        : 'Big drive, short grass — your length made a hard tee shot routine.'
  return { id: 'fairway', title: 'Fairway Finder edge', note, stat: `${pctUp(delta)} to find the short grass` }
}

/** Approaches — the Dart Thrower's accuracy into the green. */
export function approachAdvantage(
  layout: HoleLayout,
  cond: Conditions,
  preBall: BallState,
  choice: Choice,
  mode: ApproachMode,
  character: CharacterId | undefined,
  outcome: string,
): CharacterAdvantage | null {
  if (character !== 'dart') return null
  if (outcome !== 'holeout' && outcome !== 'kickin' && outcome !== 'makeable') return null
  const withC = approachOdds(layout, cond, preBall, choice, mode, 'dart').odds
  const base = approachOdds(layout, cond, preBall, choice, mode, undefined).odds
  const good = (o: typeof withC) => o.holeout + o.kickin + o.makeable
  const delta = good(withC) - good(base)
  if (delta < MIN_DELTA) return null
  const note =
    outcome === 'holeout'
      ? 'You threw a dart right at the flag and nearly walked it in.'
      : outcome === 'kickin'
        ? 'Stuffed it to kick-in range — dead on the pin.'
        : 'Stuck it inside birdie range — pin hunting pays off.'
  return { id: 'dart', title: 'Dart Thrower edge', note, stat: `${pctUp(delta)} to a birdie look` }
}

/** Putts — the Greens Keeper's stroke on the dance floor. */
export function puttAdvantage(
  cond: Conditions,
  feet: number,
  choice: Choice,
  character: CharacterId | undefined,
  outcome: string,
): CharacterAdvantage | null {
  if (character !== 'greens') return null
  if (outcome !== 'one') return null
  const withC = puttOdds(cond, feet, choice, 'greens')
  const base = puttOdds(cond, feet, choice, undefined)
  const delta = withC.one - base.one
  if (delta < MIN_DELTA) return null
  const note =
    feet >= 25
      ? `Drained a ${feet}-footer the field routinely three-jacks — ice on the dance floor.`
      : 'Buried the putt — the Greens Keeper touch.'
  return { id: 'greens', title: 'Greens Keeper edge', note, stat: `${pctUp(delta)} to make it` }
}

import { CHARACTERS, playableCharacters } from './characters'
import { splitFortune } from './fortune'
import { buildLayout } from './layout'
import { playShot, startHole, type HoleInPlay } from './resolve'
import { rngFromString } from './rng'
import type { CharacterId, Choice, Conditions, CourseSpec, Stage } from './types'

/**
 * Clubhouse cast — Layer 1 of "Clubhouse decision stats".
 *
 * A deterministic sim of the game's three characters playing today's course,
 * so the post-hole recap can show "what the regulars did" without exposing
 * any dice: this module produces CHOICES ONLY (safe/normal/aggressive per
 * shot), never outcomes, scores, or odds. It must never be wired to reveal
 * anything about the player's own upcoming rolls.
 *
 * Determinism/safety, non-negotiable:
 *  - conditions/course/dice for the cast are derived from the seed's base
 *    (see `splitFortune`) — the fortune tail never affects it.
 *  - each character gets its OWN rng stream, salted with `:cast:<id>`, so the
 *    cast's dice never collide with (and can never be reverse-engineered
 *    into) any player's own unsalted round stream.
 *  - no fortune boosts, no destiny: cast rounds are plain honest-odds sims.
 *  - the whole thing is a pure function of (course, cond, base seed) — same
 *    output for every player, every device, all day.
 */

const AGGRESSIVE_BUDGET = 8

export interface CastSetup {
  course: CourseSpec
  cond: Conditions
  /** round seed; any fortune tail (and, for daily rounds, any per-player salt)
   * must already be stripped by the caller — see cast.ts callers in App.tsx. */
  seed: string
}

export interface CastShot {
  stage: Stage
  choice: Choice
}

export interface CastCharacterResult {
  characterId: CharacterId
  /** 18 holes, each the ordered list of shots that character played */
  holes: CastShot[][]
}

export type CastResult = CastCharacterResult[]

const BUDGETED: ReadonlySet<Stage> = new Set(['tee', 'second', 'approach'])

/** Pure, deterministic policies: given the live hole state and the
 * character's remaining aggressive budget, pick a legal choice. No rng —
 * the cast's "personality" is a fixed decision rule, not a dice roll. */
type CastPolicy = (h: HoleInPlay, budgetLeft: number) => Choice

const CAST_POLICIES: Record<CharacterId, CastPolicy> = {
  // Fairway Finder: conservative — never spends the aggressive budget, and
  // plays safe out of trouble (short-game) to protect the card.
  fairway: (h) => {
    switch (h.stage) {
      case 'tee':
      case 'second':
      case 'shortgame':
        return 'safe'
      default:
        return 'normal'
    }
  },
  // Dart Thrower: pin hunter — fires aggressive on every budgeted stage while
  // the budget lasts, then plays it straight; always attacks on shots that
  // don't touch the budget (putts, short game).
  dart: (h, budgetLeft) => {
    if (BUDGETED.has(h.stage)) return budgetLeft > 0 ? 'aggressive' : 'normal'
    return 'aggressive'
  },
  // Greens Keeper: steady tee-to-green, but always goes for the make.
  greens: (h) => (h.stage === 'putt' ? 'aggressive' : 'normal'),
}

function simulateCharacter(characterId: CharacterId, course: CourseSpec, cond: Conditions, baseSeed: string): CastCharacterResult {
  const rng = rngFromString(`${baseSeed}:cast:${characterId}`)
  const policy = CAST_POLICIES[characterId]
  let budgetLeft = AGGRESSIVE_BUDGET
  const holes: CastShot[][] = []
  for (let i = 0; i < course.holes.length; i++) {
    const spec = course.holes[i]
    const layout = buildLayout(course.slug, spec, cond)
    const h = startHole(layout, cond, characterId) // no fortuneOdds: honest, dice-only sim
    const shots: CastShot[] = []
    while (h.stage !== 'done') {
      const choice = policy(h, budgetLeft)
      if (choice === 'aggressive' && BUDGETED.has(h.stage)) budgetLeft -= 1
      shots.push({ stage: h.stage, choice })
      playShot(h, choice, rng) // no destiny: cast sims never fire ace/albatross
    }
    holes.push(shots)
  }
  return { characterId, holes }
}

/** Simulate the whole cast's rounds for one day's course+conditions.
 * Pure and deterministic: same setup in, same choices out, always. */
export function castRound(setup: CastSetup): CastResult {
  // defensive strip — a daily/practice seed shouldn't carry a fortune tail by
  // the time it gets here, but the cast must never let one leak into the dice
  const base = splitFortune(setup.seed).base
  // Same roster the pick screen offers — playableCharacters is the single
  // source of truth, so the cast can never include a rival the player was
  // never offered to play.
  const roster = playableCharacters(setup.course)
  return roster.map((c) => simulateCharacter(c.id, setup.course, setup.cond, base))
}

const CHOICE_VERB: Record<Choice, string> = {
  safe: 'played it safe',
  normal: 'played it straight',
  aggressive: 'went flag-hunting',
}

function stageSuffix(stage: Stage): string {
  switch (stage) {
    case 'tee':
      return 'off the tee'
    case 'second':
      return 'going for the green'
    case 'approach':
      return 'into the green'
    case 'putt':
      return 'on the green'
    case 'shortgame':
      return 'around the green'
    default:
      return ''
  }
}

/** Copy for the post-hole recap: one line per character, summarizing the
 * headline decision (their first shot on the hole) plus a flavor callout if
 * they went aggressive again later. Choices only — never mentions an
 * outcome, a score, dice, RNG, or luck. */
export function castLinesForHole(cast: CastResult, holeIndex: number): string[] {
  return cast.map((entry) => {
    const spec = CHARACTERS.find((c) => c.id === entry.characterId)!
    const shots = entry.holes[holeIndex]
    const headline = shots[0]
    const verb = CHOICE_VERB[headline.choice]
    const suffix = stageSuffix(headline.stage)
    // Flavor names what actually happened after the opener — a charged putt
    // is not "flag-hunting", and "again" only fits if the opener attacked too.
    const laterAgg = shots.slice(1).filter((s) => s.choice === 'aggressive')
    let flavor = ''
    if (headline.choice !== 'aggressive' && laterAgg.length > 0) {
      flavor = laterAgg.every((s) => s.stage === 'putt')
        ? ' — then charged the putt'
        : ' — then went flag-hunting before the hole was out'
    }
    return `${spec.emoji} ${spec.name} ${verb} ${suffix}${flavor}.`
  })
}

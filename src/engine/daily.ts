import { characterById } from './characters'
import { COURSES, courseBySlug } from './courses'
import { fnv1a, rngFromString, type Rng } from './rng'
import type { CharacterId, Conditions, CourseSpec, Greens, HoleResult } from './types'

/** Daily No. 1 — set this to the real go-live date so launch day is DogLeg No. 1. */
export const EPOCH = { y: 2026, m: 7, d: 19 }

export function localDateKey(now = new Date()): string {
  const y = now.getFullYear()
  const m = `${now.getMonth() + 1}`.padStart(2, '0')
  const d = `${now.getDate()}`.padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function puzzleNumber(now = new Date()): number {
  const start = new Date(EPOCH.y, EPOCH.m - 1, EPOCH.d)
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const days = Math.round((today.getTime() - start.getTime()) / 86_400_000)
  return Math.max(1, days + 1)
}

/** Puzzle number for a YYYY-MM-DD key (server-side validation uses this). */
export function puzzleNumberForDateKey(dateKey: string): number {
  const [y, m, d] = dateKey.split('-').map(Number)
  return puzzleNumber(new Date(y, m - 1, d))
}

/** The rotation is the array order: puzzle n plays COURSES[(n-1) % length]. */
export function courseForPuzzle(n: number): CourseSpec {
  return COURSES[(n - 1) % COURSES.length]
}

export interface DailySetup {
  course: CourseSpec
  cond: Conditions
  seed: string
  puzzleNumber: number
  dateKey: string
}

const GREEN_BUMP: Record<Greens, Greens[]> = {
  Slow: ['Slow', 'Slow', 'Medium'],
  Medium: ['Slow', 'Medium', 'Firm'],
  Firm: ['Medium', 'Firm', 'Fast'],
  Fast: ['Firm', 'Fast', 'Fast'],
}

/**
 * CONDITIONS VERSIONING — the pattern for evolving what a seed reconstructs.
 *
 * Replay links, archived rounds, and course-record ghosts persist ONLY a seed
 * and a decision list; conditions are re-derived from the seed every time.
 * That means any change to condition generation silently rewrites history:
 * a record's stored score and its replayed card stop agreeing. So every
 * addition to the conditions envelope must be GATED so old seeds keep
 * reconstructing exactly what they were dealt:
 *
 *  - Daily seeds carry their dateKey, so daily features gate on a cutover
 *    date (compare dateKeys — ISO strings sort correctly).
 *  - Practice seeds carry no date, so practice features gate on the seed
 *    prefix: bump `practice:` → `practice2:` (→ `practice3:` …) when the
 *    envelope grows. `setupFromSeed` accepts every historical prefix forever.
 *
 * Pin positions (and par-3 gusts) are the first versioned addition: dailies
 * dealt before PINS_FROM_DATEKEY and practice seeds without the `practice2:`
 * prefix predate pins and reconstruct pin-free, exactly as played.
 */
export const PINS_FROM_DATEKEY = '2026-07-24'

/** The seed prefix current practice rounds are dealt under (see versioning
 * note above). Old `practice:` seeds stay parseable — and pin-free — forever. */
export const PRACTICE_SEED_PREFIX = 'practice2'

/**
 * Draws today's pin on every par-3 hole, plus a per-hole gust on par-3 short
 * courses — from whatever rng stream the caller hands in. Split out from
 * `jitteredConditions` so a caller that wants the classic wind/greens/
 * difficulty held at a FIXED base value (e.g. the Play Rating generator,
 * which deliberately excludes daily jitter from its difficulty measure — see
 * scripts/gen-play-ratings.ts) can still draw realistic pin/gust variance per
 * simulated round, instead of silently simulating every round with a
 * middle-tier pin and zero gust.
 */
export function pinsAndGusts(rng: Rng, course: CourseSpec): Pick<Conditions, 'pins' | 'gusts'> {
  const pins: Conditions['pins'] = {}
  for (const h of course.holes) {
    if (h.par !== 3) continue
    const tierRoll = rng()
    const sideRoll = rng()
    pins[h.number] = {
      tier: tierRoll < 0.3 ? 'open' : tierRoll < 0.7 ? 'middle' : 'tucked',
      side: sideRoll < 0.4 ? 'left' : sideRoll < 0.6 ? 'center' : 'right',
    }
  }
  if (!course.par3Course) return { pins }
  // The shorts lean into the weather: a per-hole gust rides on the base
  // wind, mostly a puff, occasionally a real blast, sometimes a lull.
  const gusts: Conditions['gusts'] = {}
  for (const h of course.holes) gusts[h.number] = Math.round((rng() - 0.3) * 10)
  return { pins, gusts }
}

/** Conditions jitter shared by daily and practice — and by the server-side
 * validator, which must reconstruct the exact conditions from the seed alone.
 * `withPins` is the conditions-version gate (see the versioning note above):
 * pre-pin seeds must reconstruct pin-free, exactly as they were dealt. */
function jitteredConditions(rngKey: string, course: CourseSpec, windSpan: number, diffSpan: number, withPins: boolean): Conditions {
  const rng = rngFromString(rngKey)
  const wind = Math.max(3, Math.round(course.wind + (rng() - 0.5) * windSpan))
  const greens = GREEN_BUMP[course.greens][Math.floor(rng() * 3)]
  const difficulty = Math.max(1, Math.min(10, Math.round(course.difficulty + (rng() - 0.5) * diffSpan)))
  if (!withPins) return { wind, greens, difficulty }
  // Pin/gust draws come AFTER the classic three, so a versioned seed keeps
  // the exact wind/greens/difficulty an unversioned one would have had.
  return { wind, greens, difficulty, ...pinsAndGusts(rng, course) }
}

export function dailyConditions(dateKey: string, course: CourseSpec): Conditions {
  return jitteredConditions(`daily:${dateKey}:${course.slug}`, course, 10, 2, dateKey >= PINS_FROM_DATEKEY)
}

/** For practice the round seed itself is the conditions key. Par-3 shorts
 * draw from a gustier band — wind is half their personality. */
export function practiceConditions(seed: string, course: CourseSpec): Conditions {
  return jitteredConditions(seed, course, course.par3Course ? 18 : 12, 3, seed.startsWith(`${PRACTICE_SEED_PREFIX}:`))
}

/**
 * The per-player dice salt for a daily. Derived, never chosen: the salt
 * changes every roll in the round, so a client free to pick one could replay
 * the same decisions under thousands of salts offline and submit the luckiest
 * card. Pinning it to the player's id means there is exactly one salt the
 * referee will accept from you, which is the whole point.
 *
 * Keyed on the player *id*, not their secret. Round seeds travel in replay
 * share links, so a salt derived from the secret would publish a function of
 * an auth credential. The id is already public and works just as well — the
 * unforgeability comes from the id being server-minted, not from hiding it.
 */
export function dailySalt(playerId: string, dateKey: string): string {
  const a = fnv1a(`salt:${playerId}:${dateKey}`)
  const b = fnv1a(`pepper:${dateKey}:${playerId}`)
  return (a.toString(36) + b.toString(36)).slice(0, 12)
}

export function dailySetup(now = new Date()): DailySetup {
  const n = puzzleNumber(now)
  const dateKey = localDateKey(now)
  const course = courseForPuzzle(n)
  return {
    course,
    cond: dailyConditions(dateKey, course),
    seed: `round:${dateKey}:${course.slug}`,
    puzzleNumber: n,
    dateKey,
  }
}

/**
 * Tomorrow's daily, for the "tomorrow's forecast" retention hook on the
 * home screen. Must return exactly what `dailySetup` will return once
 * tomorrow arrives — so tomorrow is computed by calendar arithmetic
 * (copy the date, bump the day-of-month) rather than adding 24h of
 * milliseconds, which would skip or double a day across a DST transition.
 */
export function forecastSetup(now = new Date()): DailySetup {
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  tomorrow.setDate(tomorrow.getDate() + 1)
  return dailySetup(tomorrow)
}

export function practiceSetup(slug: string, seedExtra: string): DailySetup {
  // courseBySlug spans the par-3 shorts too — anything playable can be practiced
  const course = courseBySlug(slug) ?? COURSES[0]
  const seed = `${PRACTICE_SEED_PREFIX}:${slug}:${seedExtra}`
  return {
    course,
    cond: practiceConditions(seed, course),
    seed,
    puzzleNumber: 0,
    dateKey: localDateKey(),
  }
}

export const RESULT_LABEL: Record<HoleResult, string> = {
  albatross: 'Albatross',
  eagle: 'Eagle',
  birdie: 'Birdie',
  par: 'Par',
  bogey: 'Bogey',
  double: 'Double Bogey',
  triple: 'Triple+',
}

export const RESULT_SQUARE: Record<HoleResult, string> = {
  albatross: '🟪',
  eagle: '🟦',
  birdie: '🟩',
  par: '⬜',
  bogey: '🟨',
  double: '🟧',
  triple: '🟥',
}

export function toParLabel(toPar: number): string {
  return toPar === 0 ? 'E' : toPar > 0 ? `+${toPar}` : `${toPar}`
}

/** Shown in share text — update when the final domain is decided. */
export const SITE_URL = 'dogleg.cameronbristol.xyz'

/** Share card in the classic Break Par format, with the character in the rank line's slot. */
/** "12-day streak", or nothing at all: a 0 or 1 day streak isn't a brag. */
export function streakTag(streak?: number): string {
  return streak && streak >= 2 ? ` · ${streak}-day streak` : ''
}

export function shareText(
  setup: DailySetup,
  results: HoleResult[],
  toPar: number,
  character?: CharacterId,
  streak?: number,
): string {
  const rows: string[] = []
  for (let i = 0; i < results.length; i += 9) {
    rows.push(results.slice(i, i + 9).map((r) => RESULT_SQUARE[r]).join(''))
  }
  const par = setup.course.holes.reduce((s, h) => s + h.par, 0)
  const char = characterById(character)
  const birdies = results.filter((r) => r === 'albatross' || r === 'eagle' || r === 'birdie').length
  const pars = results.filter((r) => r === 'par').length
  const overs = results.length - birdies - pars
  return [
    `DOGLEG #${setup.puzzleNumber} ⛳`,
    `${setup.course.name} (Par ${par})`,
    `${par + toPar} (${toParLabel(toPar)})${streakTag(streak)}`,
    '',
    ...rows,
    ...(char ? [`${char.emoji} ${char.name}`] : []),
    '',
    `🐦 ${birdies}  ·  ⛳ ${pars}  ·  😬 ${overs}`,
    SITE_URL,
  ].join('\n')
}

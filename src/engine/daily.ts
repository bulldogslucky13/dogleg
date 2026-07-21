import { characterById } from './characters'
import { COURSES } from './courses'
import { fnv1a, rngFromString } from './rng'
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

/** Conditions jitter shared by daily and practice — and by the server-side
 * validator, which must reconstruct the exact conditions from the seed alone. */
function jitteredConditions(rngKey: string, course: CourseSpec, windSpan: number, diffSpan: number): Conditions {
  const rng = rngFromString(rngKey)
  const wind = Math.max(3, Math.round(course.wind + (rng() - 0.5) * windSpan))
  const greens = GREEN_BUMP[course.greens][Math.floor(rng() * 3)]
  const difficulty = Math.max(1, Math.min(10, Math.round(course.difficulty + (rng() - 0.5) * diffSpan)))
  return { wind, greens, difficulty }
}

export function dailyConditions(dateKey: string, course: CourseSpec): Conditions {
  return jitteredConditions(`daily:${dateKey}:${course.slug}`, course, 10, 2)
}

/** For practice the round seed itself is the conditions key. */
export function practiceConditions(seed: string, course: CourseSpec): Conditions {
  return jitteredConditions(seed, course, 12, 3)
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
 * result screen. Must return exactly what `dailySetup` will return once
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
  const course = COURSES.find((c) => c.slug === slug) ?? COURSES[0]
  const seed = `practice:${slug}:${seedExtra}`
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
  for (let i = 0; i < 18; i += 9) {
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
    rows[0],
    rows[1],
    ...(char ? [`${char.emoji} ${char.name}`] : []),
    '',
    `🐦 ${birdies}  ·  ⛳ ${pars}  ·  😬 ${overs}`,
    SITE_URL,
  ].join('\n')
}

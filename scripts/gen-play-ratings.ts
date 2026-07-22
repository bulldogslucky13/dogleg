/**
 * Play Rating generator (build-time tool — never runs in the app).
 *
 * Computes each course's *Play Rating*: an absolute 1–10 measure of how hard
 * the course actually plays, derived by simulating many rounds through the real
 * engine with a fixed "smart" reference policy and bucketing the average score
 * to par by the thresholds in RATING_CUTOFFS.
 *
 * This is deliberately decoupled from the internal `difficulty` field in
 * courses.ts. `difficulty` is a gameplay input (30% of the pressure term, plus
 * a hidden daily ±1 jitter) that the leaderboard referee replays; changing it
 * would force a submit-round redeploy. The Play Rating is display-only, so it
 * can tell the honest truth about a course without touching odds or the referee.
 *
 * Run:  pnpm gen:ratings          # regenerate src/engine/playRatings.ts
 *       pnpm gen:ratings --print  # print the ranked table, write nothing
 *
 * Regenerate whenever the engine odds/resolution OR the course library change.
 * Output is static data, reviewed and committed — nothing here hits the network.
 */
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

// The engine's internal modules import each other extensionlessly (./rng etc.);
// vite resolves those, bare Node ESM doesn't, so add the .ts on retry. Same
// trick scripts/import-osm.ts uses to run the real engine outside a bundler.
import { registerHooks } from 'node:module'
registerHooks({
  resolve(spec, ctx, next) {
    try {
      return next(spec, ctx)
    } catch (e) {
      if (spec.startsWith('.') && !/\.[cm]?[jt]s$/.test(spec)) return next(spec + '.ts', ctx)
      throw e
    }
  },
})

// Dynamic imports: static imports are resolved before the body runs (i.e.
// before the hook above is registered), so the engine's extensionless internal
// imports must be reached via `await import` from inside the running body.
import type { Choice, Conditions } from '../src/engine/types.ts'
import type { HoleInPlay } from '../src/engine/resolve.ts'
const { COURSES, PAR3_COURSES } = await import('../src/engine/courses.ts')
// rate everything playable — the par-3 shorts get a display rating too
const RATED = [...COURSES, ...PAR3_COURSES]
const { buildLayout } = await import('../src/engine/layout.ts')
const { oddsFor, playShot, startHole } = await import('../src/engine/resolve.ts')
const { rngFromString } = await import('../src/engine/rng.ts')

const N = 4000 // rounds per course; deterministic seeds make this reproducible

/**
 * avg score-to-par (the "play index") → Play Rating. Highest cutoff first;
 * a course gets the rating of the first cutoff its index meets. These are the
 * numbers shown to players in the methodology disclaimer, so keep them round.
 */
const RATING_CUTOFFS: [number, number][] = [
  [3.0, 10],
  [2.2, 9],
  [1.7, 8],
  [1.4, 7],
  [1.0, 6],
  [0.6, 5],
  [0.2, 4],
  [-0.2, 3],
  [-0.6, 2],
]

function ratingFromIndex(index: number): number {
  for (const [min, rating] of RATING_CUTOFFS) if (index >= min) return rating
  return 1
}

// The reference golfer — identical to the calibration suite's "smart" policy.
type Policy = (h: HoleInPlay, aggressiveLeft: number) => Choice
const smart: Policy = (h, aggLeft) => {
  const si = h.layout.spec.strokeIndex
  const par = h.layout.spec.par
  if (h.stage === 'putt') {
    const feet = h.ball.puttFeet ?? 20
    return feet <= 12 ? 'aggressive' : feet <= 20 ? 'normal' : 'safe'
  }
  if (h.stage === 'shortgame') return 'normal'
  if ((h.stage === 'tee' || h.stage === 'second' || h.stage === 'approach') && aggLeft > 0 && (si >= 13 || par === 5)) {
    const anyOdds = oddsFor(h, 'aggressive')
    if (anyOdds.kind === 'long' || anyOdds.kind === 'approach') {
      if (anyOdds.water < 0.06) return 'aggressive'
    }
  }
  if (si <= 4) return 'safe'
  return 'normal'
}

function simRound(courseIdx: number, cond: Conditions, seed: string): number {
  const course = RATED[courseIdx]
  const rng = rngFromString(seed)
  let toPar = 0
  let aggLeft = 8
  for (const spec of course.holes) {
    const layout = buildLayout(course.slug, spec, cond)
    const h = startHole(layout, cond)
    let guard = 0
    while (h.stage !== 'done' && guard++ < 20) {
      const usesBudget = h.stage === 'tee' || h.stage === 'second' || h.stage === 'approach'
      let ch = smart(h, aggLeft)
      if (ch === 'aggressive' && usesBudget && aggLeft <= 0) ch = 'normal'
      if (ch === 'aggressive' && usesBudget) aggLeft--
      playShot(h, ch, rng)
    }
    toPar += h.score!.strokes - spec.par
  }
  return toPar
}

/**
 * The play index uses each course's *base* difficulty with NO daily jitter —
 * a stable measure of the course itself. (Wind/greens likewise come from the
 * course's typical values.) Averaging over jitter would only add noise around
 * the same mean.
 */
function playIndex(courseIdx: number): number {
  const course = RATED[courseIdx]
  const cond: Conditions = { wind: course.wind, greens: course.greens, difficulty: course.difficulty }
  let total = 0
  for (let i = 0; i < N; i++) total += simRound(courseIdx, cond, `playrating:${course.slug}:${i}`)
  return total / N
}

interface Row {
  slug: string
  name: string
  difficulty: number
  index: number
  rating: number
}

const rows: Row[] = RATED.map((c, i) => {
  const index = playIndex(i)
  return { slug: c.slug, name: c.name, difficulty: c.difficulty, index, rating: ratingFromIndex(index) }
})

// Print the ranked table (hardest first) so a human can sanity-check.
const ranked = [...rows].sort((a, b) => b.index - a.index)
// eslint-disable-next-line no-console
console.log(`\nPlay Rating — ${RATED.length} courses, N=${N}/course, smart policy\n`)
ranked.forEach((r, i) => {
  const delta = r.rating - r.difficulty
  const flag = Math.abs(delta) >= 2 ? `  <-- was difficulty ${r.difficulty} (${delta > 0 ? '+' : ''}${delta})` : ''
  // eslint-disable-next-line no-console
  console.log(
    `${String(i + 1).padStart(2)}. rating ${String(r.rating).padStart(2)}  index ${r.index
      .toFixed(2)
      .padStart(6)}  (d${r.difficulty})  ${r.name}${flag}`,
  )
})

if (process.argv.includes('--print')) {
  // eslint-disable-next-line no-console
  console.log('\n--print: no files written.')
  process.exit(0)
}

// Emit the generated module (slugs in COURSES order for a stable diff).
const ratingsEntries = RATED.map((c) => {
  const r = rows.find((x) => x.slug === c.slug)!
  return `  '${c.slug}': ${r.rating},`
}).join('\n')
const indexEntries = RATED.map((c) => {
  const r = rows.find((x) => x.slug === c.slug)!
  return `  '${c.slug}': ${r.index.toFixed(3)},`
}).join('\n')
const cutoffsLiteral = RATING_CUTOFFS.map(([m, r]) => `[${m}, ${r}]`).join(', ')

const out = `/**
 * GENERATED by scripts/gen-play-ratings.ts — do not edit by hand.
 * Regenerate with \`pnpm gen:ratings\` whenever the engine odds/resolution or
 * the course library change (the numbers are simulation-derived).
 *
 * A course's Play Rating is an ABSOLUTE 1–10 measure of how hard the course
 * actually plays — a competent ("smart" policy) golfer's average score to par
 * over ${N} simulated rounds, bucketed by fixed thresholds. It is display-only
 * and completely separate from the internal \`difficulty\` knob that feeds the
 * odds engine (that one still carries a hidden daily ±1 jitter).
 */
export interface PlayRatingMeta {
  /** simulated rounds per course */
  rounds: number
  /** decision policy used as the reference golfer */
  policy: string
  /** avg-to-par → rating cutoffs, highest first: [minIndex, rating] */
  cutoffs: [number, number][]
}

export const PLAY_RATING_META: PlayRatingMeta = {
  rounds: ${N},
  policy: 'smart',
  cutoffs: [${cutoffsLiteral}],
}

/** slug → Play Rating (1–10). */
export const PLAY_RATINGS: Record<string, number> = {
${ratingsEntries}
}

/** avg score-to-par measured per course, kept for the methodology disclaimer. */
export const PLAY_INDEX: Record<string, number> = {
${indexEntries}
}
`

const here = dirname(fileURLToPath(import.meta.url))
const target = resolve(here, '../src/engine/playRatings.ts')
writeFileSync(target, out)
// eslint-disable-next-line no-console
console.log(`\nWrote ${target}`)

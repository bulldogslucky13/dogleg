import type { Choice, Stage } from '../engine/types'
import { SUPABASE_ANON_KEY, SUPABASE_URL, backendEnabled } from './backend'

/**
 * Clubhouse decision stats (Layer 2) — real per-hole, per-stage tallies of
 * what the field actually chose, read from `daily_hole_choices`. This is the
 * "real tally" companion to the cast sim in `src/engine/cast.ts`: the cast
 * always renders (it's a pure client-side sim), this degrades to nothing
 * whenever the network/backend isn't available. Never wired anywhere but the
 * post-hole recap — this must not influence a live decision.
 */

export interface DecisionRow {
  hole: number
  stage: Stage
  choice: Choice
  player_name: string
}

// new-style publishable keys are sent as `apikey` alone (they aren't JWTs) —
// same pattern as src/lib/leaderboard.ts
const REST_HEADERS = {
  apikey: SUPABASE_ANON_KEY,
}

const cache = new Map<string, DecisionRow[]>()
const inFlight = new Map<string, Promise<DecisionRow[] | null>>()

/** Today's (or any date's) posted hole-choice rows, cached per date key with
 * in-flight de-duplication so multiple callers on the same round share one
 * request. Null on any failure or when the backend is disabled (tests) —
 * callers must degrade to cast-only, never block or crash. */
export function fetchDailyChoices(dateKey: string): Promise<DecisionRow[] | null> {
  if (!backendEnabled) return Promise.resolve(null)
  const cached = cache.get(dateKey)
  if (cached) return Promise.resolve(cached)
  const existing = inFlight.get(dateKey)
  if (existing) return existing

  const promise = (async (): Promise<DecisionRow[] | null> => {
    try {
      const url =
        `${SUPABASE_URL}/rest/v1/daily_hole_choices` +
        `?date_key=eq.${encodeURIComponent(dateKey)}` +
        `&select=hole,stage,choice,player_name&order=hole.asc&limit=5000`
      const res = await fetch(url, { headers: REST_HEADERS })
      if (!res.ok) return null
      const rows = (await res.json()) as DecisionRow[]
      cache.set(dateKey, rows)
      return rows
    } catch {
      return null // network hiccup — let a later call retry, don't cache the failure
    } finally {
      inFlight.delete(dateKey)
    }
  })()
  inFlight.set(dateKey, promise)
  return promise
}

// ---------------------------------------------------------------------------
// Pure display logic — no network, unit-testable
// ---------------------------------------------------------------------------

export interface GroupedChoice {
  count: number
  /** player_name values, in the order rows were returned */
  names: string[]
}

export interface GroupedChoices {
  /** total players who recorded THIS hole+stage — the threshold input */
  total: number
  byChoice: Record<Choice, GroupedChoice>
}

/** Tally the rows for one (hole, stage). `hole` is 1-based, matching the
 * schema and `choiceRowsFromReplay`. */
export function groupChoices(rows: DecisionRow[], hole: number, stage: Stage): GroupedChoices {
  const byChoice: Record<Choice, GroupedChoice> = {
    safe: { count: 0, names: [] },
    normal: { count: 0, names: [] },
    aggressive: { count: 0, names: [] },
  }
  let total = 0
  for (const row of rows) {
    if (row.hole !== hole || row.stage !== stage) continue
    total++
    byChoice[row.choice].count++
    byChoice[row.choice].names.push(row.player_name)
  }
  return { total, byChoice }
}

// majority tie-break order: stable and arbitrary, just needs to be deterministic
const CHOICE_ORDER: Choice[] = ['safe', 'normal', 'aggressive']

function majorityChoice(byChoice: Record<Choice, GroupedChoice>): Choice {
  let best: Choice = CHOICE_ORDER[0]
  for (const c of CHOICE_ORDER) {
    if (byChoice[c].count > byChoice[best].count) best = c
  }
  return best
}

/** Playful, golf-jargon verb for a choice at a stage — never mentions dice,
 * RNG, or odds. Putts get their own phrasing (charged/lagged); everything
 * else (tee/second/approach/shortgame) shares the fairway-and-green idiom. */
function verbFor(stage: Stage, choice: Choice): string {
  if (stage === 'putt') {
    switch (choice) {
      case 'aggressive':
        return 'charged it'
      case 'safe':
        return 'lagged it'
      case 'normal':
        return 'rolled it up close'
    }
  }
  if (stage === 'shortgame') {
    switch (choice) {
      case 'aggressive':
        return 'went for the tight one'
      case 'safe':
        return 'played it safe'
      case 'normal':
        return 'took the simple chip'
    }
  }
  switch (choice) {
    case 'aggressive':
      return 'went for it'
    case 'safe':
      return 'laid up'
    case 'normal':
      return 'took the fairway line'
  }
}

/** Display line for the clubhouse block, per the exact thresholds on `n`
 * (total players recorded at this hole+stage):
 *  - n === 0        → null (nothing to show)
 *  - n < 5          → named: "Name and 2 others laid up." / single: "Name went for it."
 *  - 5 <= n < 30     → plain counts: "9 of 12 laid up."
 *  - n >= 30        → percentages: "72% laid up."
 * Always leads with the majority choice; framing is "the clubhouse" — the
 * caller supplies that header, this only returns the sentence. */
export function clubhouseLine(grouped: GroupedChoices, stage: Stage): string | null {
  const { total, byChoice } = grouped
  if (total === 0) return null
  const majority = majorityChoice(byChoice)
  const verb = verbFor(stage, majority)
  const count = byChoice[majority].count

  if (total < 5) {
    const lead = byChoice[majority].names[0] ?? 'Someone'
    if (count <= 1) return `${lead} ${verb}.`
    const others = count - 1
    return `${lead} and ${others} other${others === 1 ? '' : 's'} ${verb}.`
  }
  if (total < 30) return `${count} of ${total} ${verb}.`
  const pct = Math.round((count / total) * 100)
  return `${pct}% ${verb}.`
}

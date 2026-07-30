import { CHARACTERS } from '../engine/characters'
import type { HoleResult } from '../engine/types'
import { loadLedger } from '../lib/records'
import { computeStreaks, loadHistory } from './store'
import { currentHandicap, lifetimeStats, loadRoundLog, type LoggedRound } from './stats'

/**
 * Achievements — Game-Center-style ranks over stats the game already keeps.
 *
 * Read-only by design: everything here derives from the round log, the daily
 * history, and the records ledger. Nothing writes back to scoring, records,
 * seasons or RNG — achievements are recognition, never advantage.
 *
 * Two shapes:
 *   LADDERS  — one pursuit, escalating named tiers ("The Flock": First
 *              Feather → Rare Air). Progress is a single number measured
 *              against tier thresholds.
 *   ONE-OFFS — event badges. Most are repeatable and carry a count
 *              ("Spotless ×12"); a few are once-by-definition (your FIRST
 *              record). Hidden ones show only a hint until earned.
 *
 * Forward-compatibility (deliberate): tiers and one-offs are plain data
 *  objects, so a future rewards system can attach a `reward` field per tier
 *  without touching this engine. Do NOT add currency or payouts here.
 * Portability (deliberate): earned state lives in one versioned document
 *  (`dogleg:achievements:v1`), same pattern as the round log — it can ship
 *  wholesale to a server account when achievements join account sync.
 *
 * Backfill: `reconcileAchievements('quiet')` runs at app start. The first run
 * computes progress from existing stats and grants everything already earned
 * WITHOUT celebration, recording a one-line summary the Clubhouse surfaces
 * once. Reconcile is idempotent — the earned map only ever gains keys, so
 * re-running never double-counts or re-fires a toast.
 */

// ---------------------------------------------------------------------------
// Definitions
// ---------------------------------------------------------------------------

export interface Tier {
  /** 1-based rung on the ladder */
  tier: number
  name: string
  threshold: number
  /** future rewards system attaches here — no economy exists today */
  reward?: undefined
}

export interface Ladder {
  id: string
  /** the pursuit's marquee name, e.g. "The Flock" */
  title: string
  /** what the number counts, for progress copy: "740 / 2000 birdies" */
  unit: string
  tiers: Tier[]
}

export interface OneOff {
  id: string
  name: string
  /** what it takes — shown for visible ones, revealed on earn for hidden */
  requirement: string
  /** wry nudge shown while a hidden one is still locked */
  hint?: string
  hidden: boolean
  /** counts repeat completions ("Spotless ×12"); false = once by definition */
  repeatable: boolean
  reward?: undefined
}

export const LADDERS: Ladder[] = [
  {
    id: 'birdies',
    title: 'The Flock',
    unit: 'birdies',
    tiers: [
      { tier: 1, name: 'First Feather', threshold: 1 },
      { tier: 2, name: 'Songbird', threshold: 25 },
      { tier: 3, name: 'Falcon', threshold: 100 },
      { tier: 4, name: 'Bird of Prey', threshold: 500 },
      { tier: 5, name: 'Rare Air', threshold: 2000 },
    ],
  },
  {
    id: 'pars',
    title: 'The Standard',
    unit: 'pars',
    tiers: [
      { tier: 1, name: 'Steady Hand', threshold: 1 },
      { tier: 2, name: 'Metronome', threshold: 50 },
      { tier: 3, name: 'Iron Standard', threshold: 250 },
      { tier: 4, name: 'The Machine', threshold: 1000 },
      { tier: 5, name: 'Set Your Watch', threshold: 5000 },
    ],
  },
  {
    id: 'eagles',
    title: 'The Eyrie',
    unit: 'eagles',
    tiers: [
      { tier: 1, name: 'Talon', threshold: 1 },
      { tier: 2, name: 'Eagle Eye', threshold: 10 },
      { tier: 3, name: 'Golden Eagle', threshold: 50 },
      { tier: 4, name: 'Apex', threshold: 200 },
    ],
  },
  {
    id: 'bogeys',
    title: 'Scar Tissue',
    unit: 'bogeys or worse',
    tiers: [
      { tier: 1, name: 'Growing Pains', threshold: 25 },
      { tier: 2, name: 'Battle Scars', threshold: 250 },
      { tier: 3, name: 'Glutton for Punishment', threshold: 1000 },
    ],
  },
  {
    id: 'rounds',
    title: 'The Grind',
    unit: 'rounds',
    tiers: [
      { tier: 1, name: 'Card Carrier', threshold: 1 },
      { tier: 2, name: 'Regular', threshold: 10 },
      { tier: 3, name: 'Range Rat', threshold: 50 },
      { tier: 4, name: 'Grinder', threshold: 250 },
      { tier: 5, name: 'Lifer', threshold: 1000 },
    ],
  },
  {
    id: 'redRounds',
    title: 'Red Numbers',
    unit: 'rounds under par',
    tiers: [
      { tier: 1, name: 'Broke Through', threshold: 1 },
      { tier: 2, name: 'In the Red', threshold: 10 },
      { tier: 3, name: 'Deep Red', threshold: 50 },
      { tier: 4, name: 'Permanent Ink', threshold: 250 },
    ],
  },
  {
    id: 'streak',
    title: 'The Calendar',
    unit: 'day streak (best)',
    tiers: [
      { tier: 1, name: 'Three-Peat', threshold: 3 },
      { tier: 2, name: 'The Full Week', threshold: 7 },
      { tier: 3, name: 'Fortnight', threshold: 14 },
      { tier: 4, name: 'Calendar Month', threshold: 30 },
      { tier: 5, name: 'Fifty Straight', threshold: 50 },
      { tier: 6, name: 'Iron Calendar', threshold: 100 },
      { tier: 7, name: 'Double Century', threshold: 200 },
      { tier: 8, name: 'Year of the Dog', threshold: 365 },
    ],
  },
  {
    id: 'aces',
    title: 'Struck by Lightning',
    unit: 'holes-in-one',
    tiers: [
      { tier: 1, name: 'Kissed by the Gods', threshold: 1 },
      { tier: 2, name: 'Storm Chaser', threshold: 5 },
      { tier: 3, name: 'Lightning Rod', threshold: 25 },
    ],
  },
  {
    id: 'albatrosses',
    title: 'The White Whale',
    unit: 'albatrosses',
    tiers: [
      { tier: 1, name: 'The White Whale', threshold: 1 },
      { tier: 2, name: 'Ahab', threshold: 3 },
    ],
  },
  {
    id: 'recordsNow',
    title: 'The Wall',
    unit: 'records held right now',
    tiers: [
      { tier: 1, name: 'Landlord', threshold: 3 },
      { tier: 2, name: 'The Baron', threshold: 10 },
      { tier: 3, name: 'Own the Map', threshold: 20 },
    ],
  },
  {
    id: 'recordsEver',
    title: 'The Deed Office',
    unit: 'courses ever held',
    tiers: [
      { tier: 1, name: 'Empire Builder', threshold: 5 },
      { tier: 2, name: 'Land Grab', threshold: 15 },
      { tier: 3, name: 'Monopoly', threshold: 30 },
      { tier: 4, name: 'Deed to Everything', threshold: 49 },
    ],
  },
  {
    id: 'courses',
    title: 'The Passport',
    unit: 'courses played',
    tiers: [
      { tier: 1, name: 'Day Tripper', threshold: 5 },
      { tier: 2, name: 'Frequent Flyer', threshold: 15 },
      { tier: 3, name: 'Globetrotter', threshold: 30 },
      { tier: 4, name: 'World Tour', threshold: 49 },
    ],
  },
  {
    id: 'homeCourse',
    title: 'Home Course',
    unit: 'rounds on your most-played course',
    tiers: [
      { tier: 1, name: 'Member', threshold: 25 },
      { tier: 2, name: 'Club Legend', threshold: 100 },
    ],
  },
]

export const ONE_OFFS: OneOff[] = [
  {
    id: 'firstRecord',
    name: 'Name on the Wall',
    requirement: 'Hold a course record',
    hidden: false,
    repeatable: false, // there is only one FIRST record
  },
  {
    id: 'reclaim',
    name: 'Repo Man',
    requirement: 'Win back a course record that was taken from you',
    hidden: false,
    repeatable: true, // counts every record taken back, same course or not
  },
  {
    id: 'spotless',
    name: 'Spotless',
    requirement: 'Play a full round with no bogeys',
    hidden: false,
    repeatable: true,
  },
  {
    id: 'scratch',
    name: 'Scratch',
    requirement: 'Establish a handicap of 0.0 or better',
    hidden: false,
    repeatable: false, // a state you reach, not an event that fires
  },
  {
    id: 'fullBag',
    name: 'Full Bag',
    requirement: 'Finish a round with every player',
    hidden: false,
    repeatable: false, // the roster completes once
  },
  {
    id: 'comeback',
    name: 'The Comeback',
    requirement: 'Break par after standing +3 or worse through six',
    hint: 'It ain’t over.',
    hidden: true,
    repeatable: true,
  },
  {
    id: 'bookends',
    name: 'Bookends',
    requirement: 'Birdie the 1st and the 18th in one round',
    hint: 'Start strong, finish stronger.',
    hidden: true,
    repeatable: true,
  },
  {
    id: 'heater',
    name: 'The Heater',
    requirement: 'Three straight birdies or better in one round',
    hint: 'Someone get a bucket.',
    hidden: true,
    repeatable: true,
  },
  {
    id: 'shortMemory',
    name: 'Short Memory',
    requirement: 'Follow a bogey or worse with a birdie or better',
    hint: 'Forget fast.',
    hidden: true,
    repeatable: true,
  },
  {
    id: 'shakeItOff',
    name: 'Shake It Off',
    requirement: 'Birdie the hole right after a triple or worse',
    hint: 'That never happened.',
    hidden: true,
    repeatable: true,
  },
  {
    id: 'evenSteven',
    name: 'Even Steven',
    requirement: 'Par all eighteen holes. Exactly.',
    hint: 'Perfectly balanced.',
    hidden: true,
    repeatable: true,
  },
  {
    id: 'dawnPatrol',
    name: 'Dawn Patrol',
    requirement: 'Finish a round before 7am',
    hint: 'The early tee time.',
    hidden: true,
    repeatable: true,
  },
  {
    id: 'midnightOil',
    name: 'Midnight Oil',
    requirement: 'Finish a round between midnight and 1am',
    hint: 'One more. It’s technically tomorrow.',
    hidden: true,
    repeatable: true,
  },
  {
    id: 'hooky',
    name: 'Get Back to Work',
    requirement: 'Finish a round between 3 and 4pm on a weekday',
    hint: 'Shouldn’t you be somewhere?',
    hidden: true,
    repeatable: true,
  },
  {
    id: 'anniversary',
    name: 'The Anniversary',
    requirement: 'Play on the calendar day you first teed off, a year or more later',
    hint: 'Where were you a year ago?',
    hidden: true,
    repeatable: true, // counts anniversaries kept
  },
]

// ---------------------------------------------------------------------------
// Progress — every number below derives from stats the game already keeps
// ---------------------------------------------------------------------------

const UNDER: HoleResult[] = ['albatross', 'eagle', 'birdie']
const OVER: HoleResult[] = ['bogey', 'double', 'triple']
const isUnder = (r: HoleResult) => UNDER.includes(r)
const isOver = (r: HoleResult) => OVER.includes(r)

/** Rounds recovered from pre-log daily history carry a synthetic noon
 * timestamp — time-of-day badges must not read those as real clock times. */
const hasRealClock = (r: LoggedRound) => !r.seed.startsWith('hist:')

export interface ProgressSnapshot {
  /** ladder id → current value */
  ladders: Record<string, number>
  /** one-off id → times achieved (0 = not yet) */
  oneOffs: Record<string, number>
}

export function computeProgress(
  log = loadRoundLog(),
  history = loadHistory(),
  records = loadLedger(),
): ProgressSnapshot {
  const stats = lifetimeStats(log)
  const streaks = computeStreaks(history)
  const handicap = currentHandicap(log)

  const perCourse = new Map<string, number>()
  for (const r of log) perCourse.set(r.courseSlug, (perCourse.get(r.courseSlug) ?? 0) + 1)

  const heldNow = Object.keys(records.held)
  const everHeld = new Set([...heldNow, ...Object.keys(records.stolen), ...Object.keys(records.reclaimed)])
  // Reclaims are NOT derivable from held ∩ stolen: the records ledger keeps
  // those two maps mutually exclusive (winning a record back deletes its steal
  // entry), so that intersection is always empty. records.ts tallies each
  // take-back at the moment it happens; this just reads the tally. Every
  // repossession counts, including a second one on the same course.
  const reclaims = Object.values(records.reclaimed).reduce((s, n) => s + n, 0)

  const ladders: Record<string, number> = {
    birdies: stats.distribution.birdie,
    pars: stats.distribution.par,
    eagles: stats.distribution.eagle,
    bogeys: stats.distribution.bogey + stats.distribution.double + stats.distribution.triple,
    rounds: stats.rounds,
    redRounds: log.filter((r) => r.toPar < 0).length,
    streak: streaks.bestStreak,
    aces: stats.aces,
    albatrosses: stats.albatrosses,
    recordsNow: heldNow.length,
    recordsEver: everHeld.size,
    courses: perCourse.size,
    homeCourse: Math.max(0, ...perCourse.values()),
  }

  // per-round event badges
  let spotless = 0
  let comeback = 0
  let bookends = 0
  let heater = 0
  let shortMemory = 0
  let shakeItOff = 0
  let evenSteven = 0
  let dawnPatrol = 0
  let midnightOil = 0
  let hooky = 0
  const charactersUsed = new Set<string>()
  for (const r of log) {
    if (r.character) charactersUsed.add(r.character)
    const res = r.results
    if (res.length >= 18) {
      if (!res.some(isOver)) spotless++
      if (res.every((x) => x === 'par')) evenSteven++
      if (isUnder(res[0]) && isUnder(res[17])) bookends++
    }
    const throughSix = res
      .slice(0, 6)
      .reduce((s, x) => s + ({ albatross: -3, eagle: -2, birdie: -1, par: 0, bogey: 1, double: 2, triple: 3 })[x], 0)
    if (res.length >= 18 && throughSix >= 3 && r.toPar < 0) comeback++
    let run = 0
    let sawHeater = false
    for (let i = 0; i < res.length; i++) {
      run = isUnder(res[i]) ? run + 1 : 0
      if (run >= 3) sawHeater = true
      if (i > 0 && isOver(res[i - 1]) && isUnder(res[i])) shortMemory++
      if (i > 0 && res[i - 1] === 'triple' && isUnder(res[i])) shakeItOff++
    }
    if (sawHeater) heater++
    if (hasRealClock(r)) {
      const d = new Date(r.playedAt)
      if (d.getHours() < 7) dawnPatrol++
      if (d.getHours() === 0) midnightOil++
      const day = d.getDay()
      if (day >= 1 && day <= 5 && d.getHours() === 15) hooky++
    }
  }

  // anniversaries kept: rounds on the first round's month+day, a year+ later
  let anniversary = 0
  if (log.length) {
    const first = new Date(log[0].playedAt)
    const years = new Set<number>()
    for (const r of log) {
      const d = new Date(r.playedAt)
      if (d.getFullYear() > first.getFullYear() && d.getMonth() === first.getMonth() && d.getDate() === first.getDate())
        years.add(d.getFullYear())
    }
    anniversary = years.size
  }

  const oneOffs: Record<string, number> = {
    firstRecord: everHeld.size > 0 ? 1 : 0,
    reclaim: reclaims,
    spotless,
    scratch: handicap.established && handicap.value <= 0 ? 1 : 0,
    fullBag: CHARACTERS.every((c) => charactersUsed.has(c.id)) ? 1 : 0,
    comeback,
    bookends,
    heater,
    shortMemory,
    shakeItOff,
    evenSteven,
    dawnPatrol,
    midnightOil,
    hooky,
    anniversary,
  }

  return { ladders, oneOffs }
}

// ---------------------------------------------------------------------------
// Earned ledger — versioned, append-only, idempotent to reconcile
// ---------------------------------------------------------------------------

const KEY = 'dogleg:achievements:v1'

export interface EarnedEntry {
  /** epoch ms when first granted (backfilled entries share the backfill time) */
  at: number
  /** granted by the quiet backfill rather than live play */
  backfilled?: boolean
}

export interface AchievementLedger {
  v: 1
  /** `${ladderId}:${tier}` or one-off id → grant record */
  earned: Record<string, EarnedEntry>
  /** repeatable one-off id → lifetime completion count */
  counts: Record<string, number>
  /** the first quiet grant: how many, surfaced once in the Clubhouse */
  backfill?: { at: number; granted: number; seen: boolean }
}

export function loadAchievements(): AchievementLedger {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const j = JSON.parse(raw) as AchievementLedger
      if (j?.v === 1 && j.earned) return j
    }
  } catch {
    /* fall through */
  }
  return { v: 1, earned: {}, counts: {} }
}

function saveAchievements(ledger: AchievementLedger): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(ledger))
  } catch {
    /* private mode / quota — achievements just recompute next time */
  }
}

export interface Unlock {
  id: string
  name: string
  /** ladder title or one-off requirement — the toast's second line */
  detail: string
  /** for repeatable one-offs earned before: the new count */
  count?: number
}

/**
 * Compare computed progress against the earned ledger; grant anything new.
 *
 * 'quiet' (app start / backfill): grants carry `backfilled`, no unlocks are
 * returned, and the first-ever run records the summary line. 'live' (after a
 * round): returns newly earned unlocks for the wrap-screen toasts, plus
 * repeat completions of repeatable one-offs (as count bumps, not re-unlocks).
 * Both paths only ever ADD ledger keys — re-running is a no-op.
 */
export function reconcileAchievements(mode: 'quiet' | 'live', snapshot = computeProgress()): Unlock[] {
  const ledger = loadAchievements()
  const firstRun = mode === 'quiet' && !ledger.backfill
  const unlocks: Unlock[] = []
  let granted = 0
  let changed = false

  const grant = (key: string, unlock: Unlock) => {
    if (ledger.earned[key]) return
    ledger.earned[key] = mode === 'quiet' ? { at: Date.now(), backfilled: true } : { at: Date.now() }
    granted++
    changed = true
    if (mode === 'live') unlocks.push(unlock)
  }

  for (const ladder of LADDERS) {
    const value = snapshot.ladders[ladder.id] ?? 0
    for (const tier of ladder.tiers) {
      if (value >= tier.threshold)
        grant(`${ladder.id}:${tier.tier}`, { id: `${ladder.id}:${tier.tier}`, name: tier.name, detail: ladder.title })
    }
  }

  for (const oneOff of ONE_OFFS) {
    const count = snapshot.oneOffs[oneOff.id] ?? 0
    if (count > 0) grant(oneOff.id, { id: oneOff.id, name: oneOff.name, detail: oneOff.requirement })
    if (oneOff.repeatable && count !== (ledger.counts[oneOff.id] ?? 0)) {
      const prev = ledger.counts[oneOff.id] ?? 0
      ledger.counts[oneOff.id] = count
      changed = true
      // a REPEAT (not the first, which just toasted as an unlock) gets a
      // gentler count-bump toast in live mode
      if (mode === 'live' && prev > 0 && count > prev)
        unlocks.push({ id: oneOff.id, name: oneOff.name, detail: oneOff.requirement, count })
    }
  }

  if (firstRun) {
    ledger.backfill = { at: Date.now(), granted, seen: granted === 0 }
    changed = true
  }
  if (changed) saveAchievements(ledger)
  return unlocks
}

/** The Clubhouse surfaces the backfill summary once; this marks it read. */
export function markBackfillSeen(): void {
  const ledger = loadAchievements()
  if (ledger.backfill && !ledger.backfill.seen) {
    ledger.backfill.seen = true
    saveAchievements(ledger)
  }
}

import { courseBySlug } from '../engine/courses'
import { localDateKey, practiceConditions, practiceSetup, SITE_URL, toParLabel, type DailySetup } from '../engine/daily'
import { splitFortune } from '../engine/fortune'
import { decodeReplay, encodeReplay, replayRound, type ReplayPayload } from '../engine/replay'
import { fnv1a } from '../engine/rng'
import type { CharacterId, Choice, HoleResult } from '../engine/types'
import type { RoundState } from '../state/store'

/**
 * Challenge links — "beat this round."
 *
 * A challenge is a replay link with stakes: the sender's finished round rides
 * the URL (seed + decisions, the same payload a #watch link carries), and the
 * receiver plays the SAME COURSE with their OWN luck — a fresh practice seed,
 * own conditions, own dice. Never the sender's seed: handing over the dice
 * would let the receiver scout every bounce in the replay viewer first, and
 * DogLeg's whole competitive grammar (the ghost, the daily salt) is that you
 * race a score, not a script. You're both trying to beat the odds; the better
 * card wins.
 *
 * One attempt, run like the daily: accepting pins ONE attempt seed in the
 * ledger below, and that seed is the only one this challenge will ever play
 * under on this device. Backing out mid-round resumes where you stood (the
 * round snapshot rides the ledger, so even a practice round taking the live
 * slot can't erase the attempt) — and a finished attempt is finished. This is
 * a friends-and-rivals contract, not a refereed one: nothing here submits
 * anything new to the server, and the round itself is an ordinary practice
 * round the boards treat like any other.
 *
 * Ties don't take it — same rule as the record boards and the ghost. Beat the
 * score or the challenge stands, and the sender gets their revenge link.
 */

export interface Challenge {
  /** stable fingerprint of the round-to-beat (seed + decisions + character) */
  id: string
  /** the encoded payload, verbatim — what the URL carried */
  code: string
  courseSlug: string
  /** 0 = the opening challenge; 1+ = how deep the revenge rally runs */
  rally: number
  /** the round to beat, validated by a full engine replay */
  from: {
    seed: string
    character?: CharacterId
    decisions: Choice[][]
    /** challenger's clubhouse name; null = an unnamed rival */
    name: string | null
    toPar: number
    results: HoleResult[]
  }
}

/** One device's history with a challenge — the ledger entry. */
export interface ChallengeAttempt {
  id: string
  code: string
  courseSlug: string
  receivedAt: number
  /** pinned at accept: the ONE base seed this attempt plays under. Restarting
   * an abandoned attempt re-deals these exact dice, like the daily. */
  attemptSeed?: string
  /** the in-progress attempt, mirrored from the live round on every save —
   * survives the live round slot being taken by another round */
  snapshot?: RoundState
  /** the finished attempt: the card is signed, the challenge is over */
  done?: {
    toPar: number
    results: HoleResult[]
    decisions: Choice[][]
    seed: string
    character?: CharacterId
  }
}

const LEDGER_KEY = 'dogleg:challenges:v1'
/** done attempts beyond this age out — pending ones are never pruned */
const MAX_ENTRIES = 30

interface Ledger {
  v: 1
  attempts: ChallengeAttempt[]
}

function loadLedger(): Ledger {
  try {
    const raw = localStorage.getItem(LEDGER_KEY)
    if (raw) {
      const j = JSON.parse(raw) as Ledger
      if (j?.v === 1 && Array.isArray(j.attempts)) return j
    }
  } catch {
    /* fall through */
  }
  return { v: 1, attempts: [] }
}

function saveLedger(l: Ledger): void {
  try {
    if (l.attempts.length > MAX_ENTRIES) {
      const keep = new Set(l.attempts.filter((a) => !a.done).map((a) => a.id))
      const pruned = l.attempts.filter((a, i) => i < MAX_ENTRIES || keep.has(a.id))
      l = { v: 1, attempts: pruned }
    }
    localStorage.setItem(LEDGER_KEY, JSON.stringify(l))
  } catch {
    /* private mode / quota — the challenge still plays, it just won't resume */
  }
}

/** Stable across devices and re-opens: the round IS the challenge. */
export function challengeIdFor(p: Pick<ReplayPayload, 'seed' | 'character' | 'decisions'>): string {
  const d = p.decisions.map((h) => h.join(',')).join('|')
  const a = fnv1a(`${p.seed}::${p.character ?? ''}::${d}`)
  const b = fnv1a(`${d}::${p.seed}`)
  return a.toString(36) + b.toString(36)
}

/** The URL a "beat this round" share carries. */
export function challengeUrl(p: ReplayPayload): string {
  return `https://${SITE_URL}/#challenge=${encodeReplay(p)}`
}

/** Decode + fully validate a challenge code: the round must actually replay.
 * Null covers truncated links AND rounds this bundle can't reconstruct. */
export function parseChallenge(code: string): Challenge | null {
  const p = decodeReplay(code)
  if (!p) return null
  const outcome = replayRound(p.seed, p.character, p.decisions)
  if (!outcome.ok) return null
  return {
    id: challengeIdFor(p),
    code,
    courseSlug: outcome.info.course.slug,
    rally: p.rally ?? 0,
    from: {
      seed: p.seed,
      character: p.character,
      decisions: p.decisions,
      name: p.name ?? null,
      toPar: outcome.toPar,
      results: outcome.results,
    },
  }
}

export function attemptFor(id: string): ChallengeAttempt | null {
  return loadLedger().attempts.find((a) => a.id === id) ?? null
}

/**
 * Accept a challenge: pin the attempt seed. Idempotent — a second tap (or a
 * re-opened link) returns the setup for the SAME pinned seed, never a fresh
 * deal. The seed is minted client-side like any practice seed; the one-attempt
 * contract is this ledger, honor-system by design (see the header note).
 */
export function acceptChallenge(ch: Challenge): DailySetup {
  const ledger = loadLedger()
  let att = ledger.attempts.find((a) => a.id === ch.id)
  if (!att) {
    att = { id: ch.id, code: ch.code, courseSlug: ch.courseSlug, receivedAt: Date.now() }
    ledger.attempts.unshift(att)
  }
  if (!att.attemptSeed) {
    att.attemptSeed = practiceSetup(ch.courseSlug, `c${Date.now().toString(36)}`).seed
    saveLedger(ledger)
  }
  return attemptSetup(att.attemptSeed, ch.courseSlug)
}

/** Rebuild the DailySetup for a pinned attempt seed — same dice every time. */
export function attemptSetup(seed: string, courseSlug: string): DailySetup {
  const course = courseBySlug(courseSlug)!
  return { course, cond: practiceConditions(seed, course), seed, puzzleNumber: 0, dateKey: localDateKey() }
}

/** The pending attempt a live round belongs to, matched on the pinned seed
 * (the round's own seed grew a fortune tail at the first tee). */
export function challengeAttemptForRound(round: Pick<RoundState, 'seed' | 'mode'>): ChallengeAttempt | null {
  if (round.mode !== 'practice') return null
  const base = splitFortune(round.seed).base
  return loadLedger().attempts.find((a) => a.attemptSeed === base && !a.done) ?? null
}

/** Same match, finished attempts included — the wrap screen looks its round
 * up AFTER syncChallengeRound signed the card. */
export function attemptForSeed(roundSeed: string): ChallengeAttempt | null {
  const base = splitFortune(roundSeed).base
  return loadLedger().attempts.find((a) => a.attemptSeed === base) ?? null
}

/**
 * Mirror the live round into the ledger — called on every round save. An
 * in-progress attempt snapshots (daily-style resume, wherever you stood); a
 * finished one signs the card and the snapshot retires. Cheap no-op for
 * every round that isn't a pending challenge attempt.
 */
export function syncChallengeRound(round: RoundState): void {
  const att = challengeAttemptForRound(round)
  if (!att) return
  const ledger = loadLedger()
  const entry = ledger.attempts.find((a) => a.id === att.id)
  if (!entry) return
  if (round.complete) {
    const course = courseBySlug(round.courseSlug)
    if (!course) return
    const decisions = round.scores.map((s) => s?.shots.map((sh) => sh.choice) ?? [])
    entry.done = {
      toPar: round.scores.reduce((sum, s, i) => (s ? sum + s.strokes - course.holes[i].par : sum), 0),
      results: round.scores.map((s) => s?.result ?? 'triple'),
      decisions,
      seed: round.seed,
      character: round.character,
    }
    delete entry.snapshot
  } else {
    entry.snapshot = round
  }
  saveLedger(ledger)
}

export type ChallengeVerdict = 'won' | 'lost' | 'tied'

/** Ties don't take it — the challenger's card stands until beaten outright. */
export function challengeVerdict(myToPar: number, theirToPar: number): ChallengeVerdict {
  if (myToPar < theirToPar) return 'won'
  return myToPar === theirToPar ? 'tied' : 'lost'
}

/** The wrap line under the head-to-head card. */
export function verdictCopy(v: ChallengeVerdict, from: string): string {
  if (v === 'won') return `Challenge beaten. ${from} owes you a rematch.`
  if (v === 'tied') return `Matched to the stroke — ties don't take it. ${from}'s card stands.`
  return `${from}'s card stands. The odds sided with them today.`
}

/** Share text for throwing a challenge (fresh or revenge). Short on purpose:
 * the link unfurls with the brand, the taunt does the talking. */
export function challengeShareText(opts: {
  courseName: string
  toPar: number
  url: string
  rally: number
}): string {
  const head =
    opts.rally > 0
      ? `⚔️ REVENGE. ${toParLabel(opts.toPar)} at ${opts.courseName}. Your move — one attempt:`
      : `⚔️ ${toParLabel(opts.toPar)} at ${opts.courseName}. Beat it — one attempt, your own luck:`
  return `${head}\n${opts.url}`
}

import { courseBySlug } from '../engine/courses'
import { replayFrames, replayRound, type ReplayFrame } from '../engine/replay'
import { seasonForDate } from '../engine/season'
import type { BallState, CharacterId, Choice, HoleResult } from '../engine/types'
import { fetchRecordReplay, fetchSeasonRecordReplay, loadPlayer, type RecordReplay } from '../lib/leaderboard'
import { chasing } from '../lib/records'
import { loadArchive, type ArchivedRound } from './store'

/**
 * The ghost — the course-record round played back alongside a live unlimited
 * round.
 *
 * This is a PACE race, not a shot-for-shot overlay. Rounds are deliberately
 * not deterministic across players or attempts: the ghost faced its own
 * bounces and the live round faces its own. So the ghost's scoreline
 * (cumulative score through each hole) is the truth the player races, and
 * the ghost ball on the map is atmosphere. Nothing here touches the live
 * round's rng, odds, or scoring.
 *
 * Where the ghost comes from, in order:
 *  1. The TRUE record round — the referee keeps the seed + decisions of every
 *     record it confirms (course_records.seed/decisions), so challengers race
 *     the actual holder. Loaded on demand at attempt start, never preloaded.
 *  2. Records set before the round was kept (or offline): the player's own
 *     best replayable round on the course — clearly labeled as such.
 */

/** which board's record a ghost was loaded from */
export type GhostBoard = 'alltime' | 'season'

export interface Ghost {
  /** 'record' = a standing record round; 'personal' = your own best here */
  kind: 'record' | 'personal'
  /** the board the round came off — copy reads it so a season-record race
   * can never masquerade as the all-time one */
  board: GhostBoard
  /** the record holder's clubhouse name; null when the ghost is your own round */
  holder: string | null
  seed: string
  character?: CharacterId
  toPar: number
  /** the ghost round's per-hole results — the stakes card's color blocks */
  results: HoleResult[]
  /** cumulative to-par through hole 1..18 — paceToPar[i] is after hole i+1 */
  paceToPar: number[]
  frames: ReplayFrame[]
}

/** build the record ghost from a fetched record row, null when it has no
 * stored round (or the round doesn't replay) */
function recordGhost(rec: RecordReplay | null, excludeSeed: string | undefined, board: GhostBoard): Ghost | null {
  if (!rec?.seed || !rec.decisions || rec.seed === excludeSeed) return null
  const myName = loadPlayer()?.name ?? null
  const mine = !!myName && rec.player_name.toLowerCase() === myName.toLowerCase()
  return buildGhost(rec.seed, rec.character ?? undefined, rec.decisions, {
    kind: 'record',
    board,
    holder: mine ? null : rec.player_name,
  })
}

/**
 * Load the ghost for an unlimited round on this course: the true record
 * round when the server has it, the player's own best otherwise, null when
 * there's nothing to race — normal round, no ghost.
 *
 * `board` picks WHICH record to race. A season request that can't be met
 * (no season record, or its round doesn't replay) falls back to your own
 * best labeled as such — never silently to the all-time record, which would
 * mislabel the race the player chose.
 */
export async function loadGhost(
  courseSlug: string,
  excludeSeed?: string,
  board: GhostBoard = 'alltime',
): Promise<Ghost | null> {
  const rec =
    board === 'season'
      ? await fetchSeasonRecordReplay(courseSlug, seasonForDate().key)
      : await fetchRecordReplay(courseSlug)
  const ghost = recordGhost(rec, excludeSeed, board)
  if (ghost) return ghost
  // a stored round that doesn't replay (never expected — the referee
  // verified it) falls through to the local ghost rather than no ghost
  const best = bestReplayable(courseSlug, excludeSeed)
  if (!best) return null
  return buildGhost(best.seed, best.character, best.decisions, {
    // your own archived round can itself be the standing ALL-TIME record
    // (set before the server kept rounds); the steal ledger knows if it has
    // since fallen. A season fallback never claims record status — the
    // archive's flag speaks only for the all-time board.
    kind: board === 'alltime' && best.courseRecord && !chasing(courseSlug) ? 'record' : 'personal',
    board,
    holder: null,
  })
}

/**
 * Both boards' record ghosts for one course, for the pre-round picker. A
 * board with no stored record round is null; when both exist AND are
 * different rounds, the player has a real choice. (No own-best fallback
 * here — the picker offers records, loadGhost handles the rest.)
 */
export async function loadGhostChoices(
  courseSlug: string,
  excludeSeed?: string,
): Promise<{ alltime: Ghost | null; season: Ghost | null }> {
  const [alltimeRec, seasonRec] = await Promise.all([
    fetchRecordReplay(courseSlug),
    fetchSeasonRecordReplay(courseSlug, seasonForDate().key),
  ])
  return {
    alltime: recordGhost(alltimeRec, excludeSeed, 'alltime'),
    season: recordGhost(seasonRec, excludeSeed, 'season'),
  }
}

// The chosen board rides OUTSIDE round state (adding it there would touch
// the persisted-round schema for a UI concern): one tiny sidecar keyed by
// the round's seed, so a mid-round refresh reloads the same race instead of
// silently swapping the target back to all-time.
const BOARD_KEY = 'dogleg:ghost-board:v1'

export function rememberGhostBoard(seed: string, board: GhostBoard): void {
  try {
    if (board === 'season') localStorage.setItem(BOARD_KEY, JSON.stringify({ seed, board }))
    else localStorage.removeItem(BOARD_KEY)
  } catch {
    /* private mode */
  }
}

export function ghostBoardFor(seed: string): GhostBoard {
  try {
    const raw = localStorage.getItem(BOARD_KEY)
    if (raw) {
      const j = JSON.parse(raw) as { seed?: string; board?: GhostBoard }
      if (j?.seed === seed && j.board === 'season') return 'season'
    }
  } catch {
    /* fall through */
  }
  return 'alltime'
}

function buildGhost(
  seed: string,
  character: CharacterId | undefined,
  decisions: Choice[][],
  identity: Pick<Ghost, 'kind' | 'board' | 'holder'>,
): Ghost | null {
  const outcome = replayRound(seed, character, decisions)
  if (!outcome.ok) return null
  const frames = replayFrames(seed, character, decisions)
  if (!frames) return null
  const pars = courseBySlug(outcome.info.course.slug)?.holes.map((h) => h.par) ?? Array(18).fill(4)
  const paceToPar: number[] = []
  let run = 0
  outcome.scores.forEach((s, i) => {
    run += s.strokes - pars[i]
    paceToPar.push(run)
  })
  return {
    ...identity,
    seed,
    character,
    toPar: outcome.toPar,
    results: outcome.results,
    paceToPar,
    frames,
  }
}

function bestReplayable(courseSlug: string, excludeSeed?: string): ArchivedRound | null {
  const candidates = loadArchive().filter((r) => r.courseSlug === courseSlug && r.seed !== excludeSeed)
  if (!candidates.length) return null
  return candidates.reduce((best, r) => (r.toPar < best.toPar ? r : best))
}

/**
 * Where the ghost's ball sat on this hole after `shots` shots (clamped to
 * however many it actually took). The live player's shot count drives it, so
 * the two balls move roughly in step; where they diverge, that's the game.
 */
export function ghostBallAt(ghost: Ghost, holeIndex: number, shots: number): BallState | null {
  const holeFrames = ghost.frames.filter((f) => f.holeIndex === holeIndex)
  if (!holeFrames.length) return null
  const idx = Math.min(shots, holeFrames.length - 1)
  return holeFrames[idx].hole.ball
}

/** Has the ghost already holed out on this hole at the player's shot count? */
export function ghostDone(ghost: Ghost, holeIndex: number, shots: number): boolean {
  const holeFrames = ghost.frames.filter((f) => f.holeIndex === holeIndex)
  if (!holeFrames.length) return true
  return shots >= holeFrames.length - 1
}

export interface Pace {
  /** player minus ghost through the same holes: negative = ahead of pace */
  diff: number
  holesCompared: number
  state: 'ahead' | 'behind' | 'even'
}

/**
 * The core comparison: score-state vs score-state through equal holes
 * completed. Never by shot situation — the two rounds legitimately played
 * different bounces.
 */
export function paceVs(ghost: Ghost, playerScores: Array<{ strokes: number } | null>, courseSlug: string): Pace {
  const pars = courseBySlug(courseSlug)?.holes.map((h) => h.par) ?? Array(18).fill(4)
  let done = 0
  let playerRun = 0
  playerScores.forEach((s, i) => {
    if (s) {
      done += 1
      playerRun += s.strokes - pars[i]
    }
  })
  if (done === 0) return { diff: 0, holesCompared: 0, state: 'even' }
  const diff = playerRun - ghost.paceToPar[done - 1]
  return { diff, holesCompared: done, state: diff < 0 ? 'ahead' : diff > 0 ? 'behind' : 'even' }
}

/** what the chip calls the thing being raced — short, honest, and never
 * letting a season race read as the all-time one */
export function ghostNoun(ghost: Ghost): string {
  if (ghost.kind !== 'record') return 'your best'
  return ghost.board === 'season' ? 'the season record' : 'the record'
}

/** "−1 vs the record" / "+2 vs your best" / "even with the record" */
export function paceLabel(pace: Pace, ghost: Ghost): string {
  if (pace.state === 'even') return `even with ${ghostNoun(ghost)}`
  return `${pace.diff > 0 ? '+' : '−'}${Math.abs(pace.diff)} vs ${ghostNoun(ghost)}`
}

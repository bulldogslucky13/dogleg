import { courseBySlug } from '../engine/courses'
import { replayFrames, replayRound, type ReplayFrame } from '../engine/replay'
import type { BallState, CharacterId, Choice, HoleResult } from '../engine/types'
import { fetchRecordReplay, loadPlayer } from '../lib/leaderboard'
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

export interface Ghost {
  /** 'record' = the standing course record; 'personal' = your own best here */
  kind: 'record' | 'personal'
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

/**
 * Load the ghost for an unlimited round on this course: the true record
 * round when the server has it, the player's own best otherwise, null when
 * there's nothing to race — normal round, no ghost.
 */
export async function loadGhost(courseSlug: string, excludeSeed?: string): Promise<Ghost | null> {
  const rec = await fetchRecordReplay(courseSlug)
  if (rec?.seed && rec.decisions && rec.seed !== excludeSeed) {
    const myName = loadPlayer()?.name ?? null
    const mine = !!myName && rec.player_name.toLowerCase() === myName.toLowerCase()
    const ghost = buildGhost(rec.seed, rec.character ?? undefined, rec.decisions, {
      kind: 'record',
      holder: mine ? null : rec.player_name,
    })
    if (ghost) return ghost
    // a stored round that doesn't replay (never expected — the referee
    // verified it) falls through to the local ghost rather than no ghost
  }
  const best = bestReplayable(courseSlug, excludeSeed)
  if (!best) return null
  return buildGhost(best.seed, best.character, best.decisions, {
    // your own archived round can itself be the standing record (set before
    // the server kept rounds); the steal ledger knows if it has since fallen
    kind: best.courseRecord && !chasing(courseSlug) ? 'record' : 'personal',
    holder: null,
  })
}

function buildGhost(
  seed: string,
  character: CharacterId | undefined,
  decisions: Choice[][],
  identity: Pick<Ghost, 'kind' | 'holder'>,
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

/** what the chip calls the thing being raced — short, honest */
export function ghostNoun(ghost: Ghost): string {
  return ghost.kind === 'record' ? 'the record' : 'your best'
}

/** "−1 vs the record" / "+2 vs your best" / "even with the record" */
export function paceLabel(pace: Pace, ghost: Ghost): string {
  if (pace.state === 'even') return `even with ${ghostNoun(ghost)}`
  return `${pace.diff > 0 ? '+' : '−'}${Math.abs(pace.diff)} vs ${ghostNoun(ghost)}`
}

import { courseBySlug } from '../engine/courses'
import { replayFrames, replayRound, type ReplayFrame } from '../engine/replay'
import type { BallState, CharacterId } from '../engine/types'
import { chasing } from '../lib/records'
import { loadArchive, type ArchivedRound } from './store'

/**
 * The ghost — a record round played back alongside a live unlimited round.
 *
 * This is a PACE race, not a shot-for-shot overlay. Rounds are deliberately
 * not deterministic across players or attempts: the ghost faced its own
 * bounces and the live round faces its own. So the ghost's scoreline
 * (cumulative score through each hole) is the truth the player races, and
 * the ghost ball on the map is atmosphere. Nothing here touches the live
 * round's rng, odds, or scoring.
 *
 * Replay availability is local-only (course_records stores holder + score,
 * never the round), so the ghost is the best round THIS device can replay:
 * the true course-record round when this player set it, otherwise their own
 * best on the course. A true-record ghost of another player's round needs
 * server-side replay storage — separate track.
 */

export interface GhostTarget {
  /** the round being chased */
  seed: string
  character?: CharacterId
  toPar: number
  /** true when this replay IS the standing course record (set here, not since stolen) */
  isCourseRecord: boolean
}

export interface Ghost extends GhostTarget {
  /** cumulative to-par through hole 1..18 — paceToPar[i] is after hole i+1 */
  paceToPar: number[]
  frames: ReplayFrame[]
}

/** The cheap preview for the pre-round stakes strip — no replay computed. */
export function ghostTarget(courseSlug: string, excludeSeed?: string): GhostTarget | null {
  const best = bestReplayable(courseSlug, excludeSeed)
  if (!best) return null
  return {
    seed: best.seed,
    character: best.character,
    toPar: best.toPar,
    // courseRecord marks the round that TOOK the record; if that record has
    // since been stolen (the ledger knows), this replay is no longer the wall
    isCourseRecord: !!best.courseRecord && !chasing(courseSlug),
  }
}

/**
 * The full ghost, loaded on demand when an attempt starts: one replay pass
 * for the exact per-hole scoreline, one for the frame-by-frame ball states.
 * Null when the course has nothing replayable — normal round, no ghost.
 */
export function loadGhost(courseSlug: string, excludeSeed?: string): Ghost | null {
  const target = ghostTarget(courseSlug, excludeSeed)
  if (!target) return null
  const best = loadArchive().find((r) => r.seed === target.seed)
  if (!best) return null
  const outcome = replayRound(best.seed, best.character, best.decisions)
  if (!outcome.ok) return null
  const frames = replayFrames(best.seed, best.character, best.decisions)
  if (!frames) return null
  const pars = courseBySlug(courseSlug)?.holes.map((h) => h.par) ?? Array(18).fill(4)
  const paceToPar: number[] = []
  let run = 0
  outcome.scores.forEach((s, i) => {
    run += s.strokes - pars[i]
    paceToPar.push(run)
  })
  return { ...target, paceToPar, frames }
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

/** "−1 vs pace" / "+2 vs pace" / "even with the record" */
export function paceLabel(pace: Pace): string {
  if (pace.state === 'even') return 'even vs pace'
  return `${pace.diff > 0 ? '+' : '−'}${Math.abs(pace.diff)} vs pace`
}

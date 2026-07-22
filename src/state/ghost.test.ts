// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { courseBySlug } from '../engine/courses'
import { practiceSetup } from '../engine/daily'
import type { Choice } from '../engine/types'
import { ghostBallAt, ghostTarget, loadGhost, paceLabel, paceVs } from './ghost'
import { advanceHole, applyChoice, archiveRound, newRound, roundToPar, type RoundState } from './store'

const SLUG = 'pebble-beach'

function playThrough(seedExtra: string, character: 'dart' | 'greens' = 'dart'): RoundState {
  let s = newRound(practiceSetup(SLUG, seedExtra), 'practice', character)
  let guard = 0
  while (!s.complete && guard++ < 500) {
    if (s.hole?.stage === 'done') {
      s = advanceHole(s)
      continue
    }
    const choice: Choice = guard % 3 === 0 ? 'safe' : 'normal'
    const next = applyChoice(s, choice)
    s = next === s ? applyChoice(s, 'normal') : next
  }
  return s
}

beforeEach(() => {
  localStorage.clear()
})

describe('the ghost is the best replayable round on the course', () => {
  it('returns null with an empty archive, and ignores the live seed', () => {
    expect(ghostTarget(SLUG)).toBeNull()
    const round = playThrough('ghost-a')
    archiveRound(round)
    // the round being played right now can't be its own ghost
    expect(ghostTarget(SLUG, round.seed)).toBeNull()
    expect(ghostTarget(SLUG)!.seed).toBe(round.seed)
  })

  it('picks the lowest round and replays its exact scoreline as the pace', () => {
    const a = playThrough('ghost-a')
    const b = playThrough('ghost-b', 'greens')
    archiveRound(a)
    archiveRound(b)
    const best = roundToPar(a) <= roundToPar(b) ? a : b
    const ghost = loadGhost(SLUG)!
    expect(ghost.seed).toBe(best.seed)
    // pace through 18 IS the round's final score — the replay is exact
    expect(ghost.paceToPar[17]).toBe(roundToPar(best))
    expect(ghost.paceToPar).toHaveLength(18)
    // cumulative: every step moves by that hole's score vs par
    const pars = courseBySlug(SLUG)!.holes.map((h) => h.par)
    const holeOne = best.scores[0]!.strokes - pars[0]
    expect(ghost.paceToPar[0]).toBe(holeOne)
    // frames exist for the ambient ball, one tee frame per hole at minimum
    expect(ghost.frames.filter((f) => f.shotIndex === 0)).toHaveLength(18)
    expect(ghostBallAt(ghost, 0, 0)).not.toBeNull()
  })
})

describe('pace compares score-state through equal holes completed', () => {
  it('tracks ahead/behind/even and never reads beyond completed holes', () => {
    const done = playThrough('ghost-pace')
    archiveRound(done)
    const ghost = loadGhost(SLUG)!
    const pars = courseBySlug(SLUG)!.holes.map((h) => h.par)

    // nothing completed → even, zero holes compared
    expect(paceVs(ghost, Array(18).fill(null), SLUG)).toEqual({ diff: 0, holesCompared: 0, state: 'even' })

    // one hole completed, one stroke better than the ghost's hole 1
    const ghostHole1 = ghost.paceToPar[0]
    const scores = Array(18).fill(null)
    scores[0] = { strokes: pars[0] + ghostHole1 - 1 }
    const pace = paceVs(ghost, scores, SLUG)
    expect(pace).toEqual({ diff: -1, holesCompared: 1, state: 'ahead' })
    expect(paceLabel(pace)).toBe('−1 vs pace')

    // matching the ghost exactly reads even
    scores[0] = { strokes: pars[0] + ghostHole1 }
    expect(paceVs(ghost, scores, SLUG).state).toBe('even')

    // a triple against a ghost par reads behind, positive sign
    scores[0] = { strokes: pars[0] + ghostHole1 + 3 }
    const behind = paceVs(ghost, scores, SLUG)
    expect(behind.state).toBe('behind')
    expect(paceLabel(behind)).toBe('+3 vs pace')
  })
})

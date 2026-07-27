import { describe, expect, it } from 'vitest'
import { courseBySlug } from './courses'
import { practiceSeedVersion, practiceConditions } from './daily'
import {
  applyMisfortune,
  MISFORTUNE_CONFIG,
  MISFORTUNE_FROM_DATEKEY,
  MISFORTUNE_LINES,
  misfortuneHole,
  misfortuneLine,
  misfortuneLive,
} from './misfortune'
import { decisionsFromScores, replayRound } from './replay'
import type { HoleScore } from './types'

const pebble = courseBySlug('pebble-beach')!
const par4Count = pebble.holes.filter((h) => h.par === 4).length

const score = (strokes: number, par: number): HoleScore => ({
  strokes,
  penalties: 0,
  result: strokes - par <= -3 ? 'albatross' : strokes - par === -2 ? 'eagle' : strokes - par === -1 ? 'birdie' : strokes - par === 0 ? 'par' : strokes - par === 1 ? 'bogey' : strokes - par === 2 ? 'double' : 'triple',
  note: '',
  shots: [],
})

describe('the gate — history replays exactly as dealt', () => {
  it('pre-cutover dailies and pre-v3 practice seeds can never be cursed', () => {
    expect(misfortuneLive('daily', 'round:2026-07-20:pebble-beach', '2026-07-20')).toBe(false)
    expect(misfortuneLive('daily', `round:${MISFORTUNE_FROM_DATEKEY}:x`, MISFORTUNE_FROM_DATEKEY)).toBe(true)
    expect(misfortuneLive('practice', 'practice:pebble-beach:x', undefined)).toBe(false)
    expect(misfortuneLive('practice', 'practice2:pebble-beach:x', undefined)).toBe(false)
    expect(misfortuneLive('practice', 'practice3:pebble-beach:x', undefined)).toBe(true)
    // and the roll respects it: sweep old-prefix seeds, none may hit
    for (let i = 0; i < 3000; i++) {
      expect(misfortuneHole('practice', `practice2:pebble-beach:mf${i}`, pebble)).toBeNull()
    }
  })

  it('the practice3 prefix bump did not un-pin practice2 history', () => {
    // the near-miss this suite exists for: pins gate on envelope VERSION >= 2,
    // not on the current prefix — practice2 seeds keep their pins forever
    expect(practiceSeedVersion('practice:x:1')).toBe(1)
    expect(practiceSeedVersion('practice2:x:1')).toBe(2)
    expect(practiceSeedVersion('practice3:x:1')).toBe(3)
    expect(practiceConditions('practice2:pebble-beach:t', pebble).pins).toBeDefined()
    expect(practiceConditions('practice3:pebble-beach:t', pebble).pins).toBeDefined()
    expect(practiceConditions('practice:pebble-beach:t', pebble).pins).toBeUndefined()
  })
})

describe('the roll', () => {
  it('is deterministic, par-4 only, one per round by construction', () => {
    let hits = 0
    for (let i = 0; i < 5000 && hits < 8; i++) {
      const seed = `practice3:pebble-beach:mf${i}`
      const hole = misfortuneHole('practice', seed, pebble)
      if (hole === null) continue
      hits++
      expect(pebble.holes[hole].par).toBe(4)
      expect(misfortuneHole('practice', seed, pebble)).toBe(hole) // same seed, same curse
    }
    expect(hits).toBeGreaterThan(0)
  })

  it('fires at the configured rate: ~1 per 1,500 par-4 holes', () => {
    const N = 30000
    let hits = 0
    for (let i = 0; i < N; i++) {
      if (misfortuneHole('practice', `practice3:pebble-beach:rate${i}`, pebble) !== null) hits++
    }
    const expected = (N * par4Count) / MISFORTUNE_CONFIG.practice.par4sPerEvent
    // generous band — this is a rate sanity check, not a distribution test
    expect(hits).toBeGreaterThan(expected * 0.6)
    expect(hits).toBeLessThan(expected * 1.4)
  })
})

describe('the override', () => {
  it('forces double par, flags the score, and touches nothing else', () => {
    const out = applyMisfortune(score(5, 4), 4)
    expect(out).toMatchObject({ strokes: 8, result: 'triple', misfortune: true, note: 'Mis-fortune' })
    expect(applyMisfortune(score(3, 4), 4).strokes).toBe(8) // even a birdie is not spared
  })

  it('fortune outranks: eagle-or-better on the cursed hole escapes', () => {
    const eagle = score(2, 4)
    expect(applyMisfortune(eagle, 4)).toBe(eagle)
    expect(applyMisfortune(eagle, 4).misfortune).toBeUndefined()
  })
})

describe('client and referee agree — the property that keeps boards honest', () => {
  it('a cursed round replays to the identical cursed card', async () => {
    const { newRound, applyChoice, advanceHole } = await import('../state/store')
    const { practiceSetup } = await import('./daily')
    // find a cursed seed the way a player would meet one: by playing
    let seedExtra = ''
    for (let i = 0; i < 5000; i++) {
      if (misfortuneHole('practice', `practice3:pebble-beach:mf${i}`, pebble) !== null) {
        seedExtra = `mf${i}`
        break
      }
    }
    expect(seedExtra).not.toBe('')
    const setup = practiceSetup('pebble-beach', seedExtra)
    let s = newRound(setup, 'practice', 'dart')
    let guard = 0
    while (!s.complete && guard++ < 500) {
      if (s.hole?.stage === 'done') {
        s = advanceHole(s)
        continue
      }
      const next = applyChoice(s, 'normal')
      s = next === s ? applyChoice(s, 'safe') : next
    }
    expect(s.complete).toBe(true)
    const cursedIdx = misfortuneHole('practice', `practice3:pebble-beach:${seedExtra}`, pebble)!
    const clientScore = s.scores[cursedIdx]!
    // the client applied the curse (unless the round escaped via eagle)
    if (clientScore.misfortune) {
      expect(clientScore.strokes).toBe(pebble.holes[cursedIdx].par * 2)
    }
    // and the referee's replay produces the exact same card
    const replay = replayRound(s.seed, 'dart', decisionsFromScores(s.scores)!)
    expect(replay.ok).toBe(true)
    if (replay.ok) {
      expect(replay.scores.map((x) => x.strokes)).toEqual(s.scores.map((x) => x!.strokes))
      expect(replay.scores[cursedIdx].misfortune).toBe(clientScore.misfortune)
      expect(replay.toPar).toBe(s.scores.reduce((t, sc, i) => t + sc!.strokes - pebble.holes[i].par, 0))
    }
  })
})

describe('the comedy stays wired to the config', () => {
  it('punchline pick is deterministic per seed and every line exists', () => {
    expect(MISFORTUNE_LINES.length).toBeGreaterThanOrEqual(8)
    const seed = 'practice3:pebble-beach:zzz'
    expect(misfortuneLine(seed)).toBe(misfortuneLine(seed))
    expect(MISFORTUNE_LINES).toContain(misfortuneLine(seed))
  })
})

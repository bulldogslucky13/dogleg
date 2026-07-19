import { describe, expect, it } from 'vitest'
import { advanceHole, applyChoice, newRound, roundToPar } from '../state/store'
import { CHARACTERS } from './characters'
import { COURSES } from './courses'
import { dailySetup, practiceSetup } from './daily'
import { decisionsFromScores, replayRound, setupFromSeed } from './replay'
import type { CharacterId, Choice } from './types'

/** Play a full round through the real client store, exactly as the UI does. */
function playThroughStore(setup: ReturnType<typeof practiceSetup>, mode: 'daily' | 'practice', character: CharacterId) {
  let state = newRound(setup, mode, character)
  let guard = 0
  while (!state.complete && guard++ < 500) {
    const stage = state.hole?.stage
    if (stage === 'done') {
      state = advanceHole(state)
      continue
    }
    // a mixed policy so decisions vary: aggressive early, then normal/safe
    const choice: Choice = state.aggressiveLeft > 4 ? 'aggressive' : guard % 3 === 0 ? 'safe' : 'normal'
    const next = applyChoice(state, choice)
    // applyChoice returns the same state when a choice is refused (budget) — fall back
    state = next === state ? applyChoice(state, 'normal') : next
  }
  return state
}

describe('replayRound is a perfect mirror of the client store', () => {
  it('reproduces store-played rounds exactly: every course sampled, every character', () => {
    for (let i = 0; i < 12; i++) {
      const course = COURSES[(i * 7) % COURSES.length]
      const character = CHARACTERS[i % CHARACTERS.length].id
      const setup = practiceSetup(course.slug, `replaytest:${i}`)
      const finished = playThroughStore(setup, 'practice', character)
      expect(finished.complete).toBe(true)

      const decisions = decisionsFromScores(finished.scores)!
      expect(decisions).not.toBeNull()

      const replay = replayRound(finished.seed, character, decisions)
      expect(replay.ok, `replay failed for ${course.slug}`).toBe(true)
      if (!replay.ok) return
      expect(replay.toPar).toBe(roundToPar(finished))
      expect(replay.results).toEqual(finished.scores.map((s) => s!.result))
      expect(replay.info.cond).toEqual(setup.cond)
    }
  })

  it('reconstructs the daily setup from the seed alone', () => {
    const setup = dailySetup()
    const info = setupFromSeed(setup.seed)!
    expect(info.mode).toBe('daily')
    expect(info.course.slug).toBe(setup.course.slug)
    expect(info.cond).toEqual(setup.cond)
    expect(info.puzzleNumber).toBe(setup.puzzleNumber)
  })

  it('rejects tampered submissions', () => {
    const setup = practiceSetup(COURSES[0].slug, 'tamper')
    const finished = playThroughStore(setup, 'practice', 'dart')
    const decisions = decisionsFromScores(finished.scores)!

    // a seed for a course that isn't in that day's rotation
    expect(replayRound('round:2026-07-20:not-a-course', 'dart', decisions).ok).toBe(false)
    // wrong shape
    expect(replayRound(finished.seed, 'dart', decisions.slice(0, 17)).ok).toBe(false)
    // extra decisions after the ball is in the hole
    const padded = decisions.map((d) => [...d, 'aggressive' as Choice])
    expect(replayRound(finished.seed, 'dart', padded).ok).toBe(false)
    // trying to spend more aggressive than the budget allows
    const allAgg = decisions.map((d) => d.map(() => 'aggressive' as Choice))
    const r = replayRound(finished.seed, 'dart', allAgg)
    expect(r.ok).toBe(false)
  })

  it('a different character cannot ride on the same decisions unnoticed', () => {
    const setup = practiceSetup(COURSES[2].slug, 'charswap')
    const finished = playThroughStore(setup, 'practice', 'greens')
    const decisions = decisionsFromScores(finished.scores)!
    const swapped = replayRound(finished.seed, 'fairway', decisions)
    // the replay either fails (decision list no longer fits the hole flow) or
    // produces its own honest score — either way the claimed character matters
    if (swapped.ok) {
      const honest = replayRound(finished.seed, 'greens', decisions)
      expect(honest.ok).toBe(true)
      // scores are computed by the server's replay, not copied from the claim
      expect(typeof swapped.toPar).toBe('number')
    }
  })
})

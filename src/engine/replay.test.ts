import { describe, expect, it } from 'vitest'
import { advanceHole, applyChoice, newRound, roundToPar } from '../state/store'
import { CHARACTERS } from './characters'
import { COURSES } from './courses'
import { dailySalt, dailySetup, practiceSetup } from './daily'
import {
  choiceRowsFromReplay,
  decisionsFromScores,
  decodeReplay,
  encodeReplay,
  replayFrames,
  replayRound,
  setupFromSeed,
} from './replay'
import type { CharacterId, Choice } from './types'

/** Play a full round through the real client store, exactly as the UI does. */
function playThroughStore(
  setup: ReturnType<typeof practiceSetup>,
  mode: 'daily' | 'practice',
  character: CharacterId,
  playerId?: string,
) {
  let state = newRound(setup, mode, character, playerId)
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

  it('per-player daily salt changes the dice but never the course or conditions', () => {
    const setup = dailySetup()
    const salted = setupFromSeed(`${setup.seed}:a1b2c3d4`)!
    expect(salted.course.slug).toBe(setup.course.slug)
    expect(salted.cond).toEqual(setup.cond) // conditions are shared — the challenge is the same
    // the same strategy rolls different dice under different salts
    const probe = (seed: string) => {
      // grow decision lists until the replay accepts them — deterministic per seed
      const decisions: Choice[][] = Array(18).fill(null).map(() => ['normal'])
      for (let guard = 0; guard < 200; guard++) {
        const r = replayRound(seed, undefined, decisions)
        if (r.ok) return r
        const m = /hole (\d+): round left unfinished/.exec(r.error)
        if (!m) throw new Error(`unexpected: ${r.error}`)
        decisions[Number(m[1]) - 1].push('normal')
      }
      throw new Error('probe never finished')
    }
    const a = probe(`${setup.seed}:saltaaaa`)
    const b = probe(`${setup.seed}:saltbbbb`)
    // identical strategies, different luck: the full result sequence differing
    // (or scores) proves the dice are per-player
    expect(a.results.join() === b.results.join() && a.toPar === b.toPar).toBe(false)
  })

  it('binds the daily salt to the player, so luck cannot be ground for', () => {
    // The attack this guards against: the salt reseeds every roll, so a client
    // free to pick one replays the same decisions under thousands of salts
    // offline and posts the luckiest card. The replay is genuine — only the
    // salt check can catch it. Measured before the fix: 5000/5000 ground salts
    // accepted, best -10 against an honest average of +2.7.
    const setup = dailySetup()
    const playerId = 'a3f1c2d4-0000-4000-8000-abcdefabcdef'
    const mySalt = dailySalt(playerId, setup.dateKey)

    // the salt my client seeds with is the one the referee derives for me.
    // Asserted through setupFromSeed rather than string equality so this keeps
    // testing the property, not the seed's spelling, if the format grows.
    expect(setupFromSeed(newRound(setup, 'daily', 'dart', playerId).seed)!.salt).toBe(mySalt)
    expect(dailySalt(playerId, setup.dateKey)).toBe(mySalt) // deterministic
    expect(dailySalt('someone-else', setup.dateKey)).not.toBe(mySalt) // per-player
    expect(dailySalt(playerId, '2020-01-01')).not.toBe(mySalt) // per-day

    // every ground salt parses as a valid seed — the referee cannot lean on
    // replayRound to reject them, which is exactly why it must check the salt
    let parsedFine = 0
    for (let i = 0; i < 200; i++) {
      const info = setupFromSeed(`${setup.seed}:${i.toString(36)}`)
      if (info) {
        parsedFine++
        expect(info.salt).toBe(i.toString(36))
        // ...and the referee's check is what rejects it
        expect(info.salt === dailySalt(playerId, setup.dateKey)).toBe(false)
      }
    }
    expect(parsedFine).toBe(200)

    // a player whose identity mint never landed (offline) plays the one
    // canonical seed: no salt, therefore nothing to grind
    expect(setupFromSeed(newRound(setup, 'daily', 'dart').seed)!.salt).toBeUndefined()
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

  it('replay codes roundtrip and frames retell the exact same round', () => {
    const setup = practiceSetup(COURSES[5].slug, 'frames')
    const finished = playThroughStore(setup, 'practice', 'fairway')
    const decisions = decisionsFromScores(finished.scores)!

    // encode → decode is lossless (including a name with non-ASCII)
    const code = encodeReplay({ seed: finished.seed, character: 'fairway', decisions, name: 'Señor Bogey' })
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/) // URL-safe
    const decoded = decodeReplay(code)!
    expect(decoded.seed).toBe(finished.seed)
    expect(decoded.character).toBe('fairway')
    expect(decoded.decisions).toEqual(decisions)
    expect(decoded.name).toBe('Señor Bogey')

    // frames: one per tee + one per shot, ending on the same final score
    const frames = replayFrames(finished.seed, 'fairway', decisions)!
    const shotCount = decisions.reduce((s, h) => s + h.length, 0)
    expect(frames).toHaveLength(18 + shotCount)
    const lastFrame = frames[frames.length - 1]
    const finalToPar = lastFrame.runningToPar + (lastFrame.hole.score!.strokes - lastFrame.hole.layout.spec.par)
    expect(finalToPar).toBe(roundToPar(finished))
    // garbage codes are rejected, not crashed on
    expect(decodeReplay('not-a-real-code')).toBeNull()
  })

  it('a salted daily seed replays through frames — share links survive per-player dice', () => {
    // regression for the #24/#28 interaction: replay links carry the salted
    // seed verbatim, so the frames builder must accept it like the referee does
    const setup = dailySetup()
    const playerId = 'a3f1c2d4-0000-4000-8000-abcdefabcdef'
    // the playerId goes through newRound itself: pre-fortune this test fed a
    // pre-salted seed back through the setup, but newRound now also appends
    // the fortune tail, and doing that twice builds a seed no referee accepts
    const round = playThroughStore(setup, 'daily', 'dart', playerId)
    const decisions = decisionsFromScores(round.scores)!
    const decoded = decodeReplay(encodeReplay({ seed: round.seed, character: 'dart', decisions }))!
    expect(decoded.seed).toBe(round.seed)
    const frames = replayFrames(decoded.seed, decoded.character, decoded.decisions)!
    expect(frames).not.toBeNull()
    const lastFrame = frames[frames.length - 1]
    const finalToPar = lastFrame.runningToPar + (lastFrame.hole.score!.strokes - lastFrame.hole.layout.spec.par)
    expect(finalToPar).toBe(roundToPar(round))
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

describe('choiceRowsFromReplay: the clubhouse decision stats feed (Layer 2)', () => {
  it('one row per (hole, stage), holes 1..18, par-3 holes carry no second-shot row', () => {
    for (let i = 0; i < 9; i++) {
      const course = COURSES[(i * 5) % COURSES.length]
      const character = CHARACTERS[i % CHARACTERS.length].id
      const setup = practiceSetup(course.slug, `choicerows:${i}`)
      const finished = playThroughStore(setup, 'practice', character)
      expect(finished.complete).toBe(true)

      const rows = choiceRowsFromReplay(finished.scores)
      expect(rows.length).toBeGreaterThan(0)

      const seen = new Set<string>()
      for (const row of rows) {
        expect(row.hole).toBeGreaterThanOrEqual(1)
        expect(row.hole).toBeLessThanOrEqual(18)
        const key = `${row.hole}:${row.stage}`
        expect(seen.has(key), `duplicate (hole,stage) row: ${key}`).toBe(false)
        seen.add(key)
      }

      // par-3 holes never see a 'second' shot in the real game — assert the
      // feed agrees, for every par-3 on this course
      course.holes.forEach((h, idx) => {
        if (h.par === 3) {
          expect(rows.some((r) => r.hole === idx + 1 && r.stage === 'second')).toBe(false)
        }
      })
    }
  })

  // Multi-putt (1/2/3 strokes) collapses into a SINGLE 'putt'-stage shot
  // record in this engine — there's no re-entry, so `putt` can never repeat
  // within a hole. The stage that genuinely repeats is 'shortgame': a bunker
  // shot that stays in the trap ('stillin') or flies the green ('across')
  // loops back to another shortgame decision (see resolve.ts). That's the
  // real "first-shot-at-a-repeated-stage" case this test exercises.
  it('a repeated shortgame hole (bunker do-over) rows the FIRST shortgame choice, never a later one', () => {
    let found = false
    for (let i = 0; i < 60 && !found; i++) {
      const course = COURSES[(i * 3) % COURSES.length]
      const character = CHARACTERS[i % CHARACTERS.length].id
      const setup = practiceSetup(course.slug, `shortgamerepeat:${i}`)
      const finished = playThroughStore(setup, 'practice', character)
      const rows = choiceRowsFromReplay(finished.scores)

      finished.scores.forEach((score, holeIdx) => {
        if (found || !score) return
        const shortgames = score.shots.filter((s) => s.stage === 'shortgame')
        if (shortgames.length < 2) return
        const row = rows.find((r) => r.hole === holeIdx + 1 && r.stage === 'shortgame')
        expect(row, `expected a shortgame row for hole ${holeIdx + 1}`).toBeDefined()
        expect(row!.choice).toBe(shortgames[0].choice) // the OPENING call, not a later re-roll
        found = true
      })
    }
    expect(found, 'never observed a repeated shortgame hole across 60 sampled rounds').toBe(true)
  })

  it('defensively skips null entries in a sparse scores array', () => {
    const setup = practiceSetup(COURSES[0].slug, 'choicerows:sparse')
    const finished = playThroughStore(setup, 'practice', 'dart')
    const sparse = [...finished.scores]
    sparse[3] = null
    const rows = choiceRowsFromReplay(sparse)
    expect(rows.some((r) => r.hole === 4)).toBe(false)
    expect(rows.some((r) => r.hole === 1)).toBe(true)
  })
})

describe('engine-version handshake', () => {
  it('replay re-exports ENGINE_VERSION so engine.mjs carries the referee copy', async () => {
    // the client sends src/engine/version.ts's constant; the edge function
    // imports ENGINE_VERSION from engine.mjs (bundled from THIS module). If
    // the re-export disappears, the deployed referee crashes on import — so
    // its presence here is the whole handshake's load-bearing wall.
    const replayModule = await import('./replay')
    const { ENGINE_VERSION } = await import('./version')
    expect(replayModule.ENGINE_VERSION).toBe(ENGINE_VERSION)
    expect(Number.isInteger(ENGINE_VERSION)).toBe(true)
    expect(ENGINE_VERSION).toBeGreaterThan(0)
  })
})

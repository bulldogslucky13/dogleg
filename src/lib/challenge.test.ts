// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { practiceSetup } from '../engine/daily'
import { splitFortune } from '../engine/fortune'
import { decisionsFromScores, encodeReplay, decodeReplay, replayRound } from '../engine/replay'
import type { Choice } from '../engine/types'
import { advanceHole, applyChoice, newRound, roundToPar, type RoundState } from '../state/store'
import {
  acceptChallenge,
  attemptFor,
  attemptSetup,
  challengeAttemptForRound,
  challengeIdFor,
  challengeShareText,
  challengeUrl,
  challengeVerdict,
  parseChallenge,
  syncChallengeRound,
} from './challenge'

beforeEach(() => {
  localStorage.clear()
})

/** A real finished round through the store API — the raw material for a link. */
function playRound(state: RoundState, pick: Choice = 'normal'): RoundState {
  let s = state
  let guard = 0
  while (!s.complete) {
    if (guard++ > 18 * 25) throw new Error('round did not finish')
    s = s.hole?.stage === 'done' ? advanceHole(s) : applyChoice(s, pick)
  }
  return s
}

function finishedRound(seedExtra = 'sender'): RoundState {
  return playRound(newRound(practiceSetup('pebble-beach', seedExtra), 'practice', 'fairway'))
}

function codeFor(round: RoundState, name?: string, rally?: number): string {
  const decisions = decisionsFromScores(round.scores)!
  return challengeUrl({ seed: round.seed, character: round.character, decisions, name, rally }).split('#challenge=')[1]
}

describe('the challenge codec', () => {
  it('round-trips a rally count through the replay codec', () => {
    const round = finishedRound()
    const decisions = decisionsFromScores(round.scores)!
    const code = encodeReplay({ seed: round.seed, character: round.character, decisions, name: 'Rob', rally: 2 })
    const back = decodeReplay(code)!
    expect(back.rally).toBe(2)
    expect(back.name).toBe('Rob')
    expect(back.seed).toBe(round.seed)
  })

  it('plain replay links carry no rally and still decode to none', () => {
    const round = finishedRound()
    const decisions = decisionsFromScores(round.scores)!
    const code = encodeReplay({ seed: round.seed, character: round.character, decisions })
    expect(decodeReplay(code)!.rally).toBeUndefined()
  })

  it('parseChallenge validates by replaying — a mangled code is null, a real one carries the score', () => {
    const round = finishedRound()
    expect(parseChallenge('not-a-real-code')).toBeNull()
    const ch = parseChallenge(codeFor(round, 'Rob'))!
    expect(ch.courseSlug).toBe('pebble-beach')
    expect(ch.from.name).toBe('Rob')
    expect(ch.from.toPar).toBe(roundToPar(round))
    expect(ch.rally).toBe(0)
  })

  it('the challenge id is stable across re-encodes and blind to the rally', () => {
    const round = finishedRound()
    const a = parseChallenge(codeFor(round, 'Rob'))!
    const b = parseChallenge(codeFor(round, 'Rob', 3))!
    expect(a.id).toBe(b.id)
    const other = parseChallenge(codeFor(finishedRound('other')))!
    expect(other.id).not.toBe(a.id)
  })
})

describe('one attempt, run like the daily', () => {
  it('accepting pins ONE attempt seed — a second accept re-deals nothing', () => {
    const ch = parseChallenge(codeFor(finishedRound(), 'Rob'))!
    const first = acceptChallenge(ch)
    const second = acceptChallenge(ch)
    expect(second.seed).toBe(first.seed)
    expect(second.cond).toEqual(first.cond)
    expect(first.course.slug).toBe('pebble-beach')
    // the pinned seed is a normal practice seed — own conditions, own dice
    expect(first.seed).not.toBe(ch.from.seed)
  })

  it('attemptSetup rebuilds the same deal from the pinned seed', () => {
    const ch = parseChallenge(codeFor(finishedRound(), 'Rob'))!
    const setup = acceptChallenge(ch)
    const rebuilt = attemptSetup(setup.seed, ch.courseSlug)
    expect(rebuilt.cond).toEqual(setup.cond)
  })

  it('the live attempt is recognized through its fortune tail', () => {
    const ch = parseChallenge(codeFor(finishedRound(), 'Rob'))!
    const setup = acceptChallenge(ch)
    const round = newRound(setup, 'practice', 'dart')
    expect(splitFortune(round.seed).base).toBe(setup.seed)
    expect(challengeAttemptForRound(round)?.id).toBe(ch.id)
    // an unrelated practice round is nobody's attempt
    const other = newRound(practiceSetup('pebble-beach', 'unrelated'), 'practice', 'dart')
    expect(challengeAttemptForRound(other)).toBeNull()
  })

  it('mid-round saves snapshot into the ledger; finishing signs the card and retires the snapshot', () => {
    const ch = parseChallenge(codeFor(finishedRound(), 'Rob'))!
    const setup = acceptChallenge(ch)
    let round = newRound(setup, 'practice', 'dart')
    round = applyChoice(round, 'normal')
    syncChallengeRound(round)
    let att = attemptFor(ch.id)!
    expect(att.snapshot?.seed).toBe(round.seed)
    expect(att.done).toBeUndefined()

    const done = playRound(round)
    syncChallengeRound(done)
    att = attemptFor(ch.id)!
    expect(att.snapshot).toBeUndefined()
    expect(att.done?.toPar).toBe(roundToPar(done))
    expect(att.done?.results).toHaveLength(18)
    // a finished attempt no longer matches as a live one
    expect(challengeAttemptForRound(done)).toBeNull()
    // and the signed decisions replay — they're the revenge link's payload
    expect(replayRound(att.done!.seed, att.done!.character, att.done!.decisions).ok).toBe(true)
  })

  it('rounds that are not challenge attempts leave the ledger untouched', () => {
    const round = playRound(newRound(practiceSetup('pebble-beach', 'free'), 'practice'))
    syncChallengeRound(round)
    expect(localStorage.getItem('dogleg:challenges:v1')).toBeNull()
  })
})

describe('the verdict', () => {
  it('ties do not take it', () => {
    expect(challengeVerdict(-3, -2)).toBe('won')
    expect(challengeVerdict(-2, -2)).toBe('tied')
    expect(challengeVerdict(-1, -2)).toBe('lost')
  })

  it('share text is a taunt plus the URL, revenge labeled as such', () => {
    const fresh = challengeShareText({ courseName: 'Pebble Beach', toPar: -3, url: 'https://x/#challenge=abc', rally: 0 })
    expect(fresh).toContain('-3 at Pebble Beach')
    expect(fresh).toContain('one attempt')
    expect(fresh.endsWith('https://x/#challenge=abc')).toBe(true)
    expect(challengeShareText({ courseName: 'Pebble Beach', toPar: -3, url: 'u', rally: 1 })).toContain('REVENGE')
  })

  it('challengeIdFor differs when only the character differs (same seed and decisions)', () => {
    const round = finishedRound()
    const decisions = decisionsFromScores(round.scores)!
    const a = challengeIdFor({ seed: round.seed, character: 'fairway', decisions })
    const b = challengeIdFor({ seed: round.seed, character: 'dart', decisions })
    expect(a).not.toBe(b)
  })
})

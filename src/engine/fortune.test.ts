import { describe, expect, it, vi } from 'vitest'
import { COURSES } from './courses'
import { localDateKey, practiceSetup } from './daily'
import {
  FORTUNE_CONFIG,
  destinyDue,
  encodeFortune,
  fortuneShotOdds,
  loyaltyMult,
  practiceThreshold,
  splitFortune,
  type FortuneState,
} from './fortune'
import { decisionsFromScores, replayRound, setupFromSeed } from './replay'
import { advanceHole, applyChoice, newRound, roundToPar } from '../state/store'
import type { Choice } from './types'

const f = (over: Partial<FortuneState>): FortuneState => ({ ace: 0, alb: 0, aceK: 0, albK: 0, streak: 0, ...over })

describe('fortune math', () => {
  it('practice thresholds scale 500 → 550 → 600… and cap at 1000', () => {
    expect(practiceThreshold(0)).toBe(500)
    expect(practiceThreshold(1)).toBe(550)
    expect(practiceThreshold(3)).toBe(650)
    expect(practiceThreshold(99)).toBe(1000)
  })

  it('daily loyalty multiplier runs 1x → 3x at a 30-day streak', () => {
    expect(loyaltyMult(0)).toBe(1)
    expect(loyaltyMult(15)).toBe(2)
    expect(loyaltyMult(30)).toBe(3)
    expect(loyaltyMult(300)).toBe(3) // capped
  })

  it('per-shot odds follow the round-rate design', () => {
    // practice at k=0: 1-in-500 rounds → 1/2000 per par-3
    expect(fortuneShotOdds('practice', f({})).acePerShot).toBeCloseTo(1 / 2000, 10)
    // daily at 30-day streak: 3x of 1-in-200 rounds → 3/800 per par-3
    expect(fortuneShotOdds('daily', f({ streak: 30 })).acePerShot).toBeCloseTo(3 / 800, 10)
    // tracks are independent: ace progress never moves albatross odds
    const a = fortuneShotOdds('practice', f({ aceK: 5 }))
    const b = fortuneShotOdds('practice', f({ aceK: 0 }))
    expect(a.albPerShot).toBe(b.albPerShot)
    expect(a.acePerShot).not.toBe(b.acePerShot)
  })

  it('destiny comes due exactly at the thresholds, per track', () => {
    expect(destinyDue('practice', f({ ace: 499 })).ace).toBe(false)
    expect(destinyDue('practice', f({ ace: 500 })).ace).toBe(true)
    expect(destinyDue('practice', f({ ace: 500 })).albatross).toBe(false)
    expect(destinyDue('daily', f({ alb: FORTUNE_CONFIG.daily.guaranteeAt })).albatross).toBe(true)
  })

  it('the seed codec roundtrips and clamps garbage', () => {
    const state = f({ ace: 123, aceK: 2, alb: 88, albK: 1, streak: 12 })
    const seed = `practice:pebble-beach:x:${encodeFortune(state)}`
    const { base, fortune } = splitFortune(seed)
    expect(base).toBe('practice:pebble-beach:x')
    expect(fortune).toEqual(state)
    expect(splitFortune('practice:pebble-beach:x').fortune).toBeNull()
    expect(encodeFortune(f({ ace: 9e9, streak: -5 }))).toBe('f100000.0.0.0.0')
  })
})

describe('destiny in the engine', () => {
  /** grow decision lists until the replay accepts them — deterministic */
  function probe(seed: string, choose: (holeIdx: number, shotIdx: number) => Choice) {
    const decisions: Choice[][] = Array(18)
      .fill(null)
      .map(() => [] as Choice[])
    for (let h = 0; h < 18; h++) decisions[h].push(choose(h, 0))
    for (let guard = 0; guard < 300; guard++) {
      const r = replayRound(seed, undefined, decisions)
      if (r.ok) return { r, decisions }
      const m = /hole (\d+): round left unfinished/.exec(r.error)
      if (!m) throw new Error(`unexpected: ${r.error}`)
      const idx = Number(m[1]) - 1
      decisions[idx].push(choose(idx, decisions[idx].length))
      void guard
    }
    throw new Error('probe never finished')
  }

  it('a due ace counter holes out the first par-3 tee shot — and only that one', () => {
    const seed = `practice:pebble-beach:destinytest:${encodeFortune(f({ ace: 500 }))}`
    const { r } = probe(seed, () => 'normal')
    if (!r.ok) throw new Error('replay failed')
    const course = COURSES.find((c) => c.slug === 'pebble-beach')!
    const par3s = course.holes.map((h, i) => ({ par: h.par, i })).filter((x) => x.par === 3)
    const first = par3s[0].i
    expect(r.scores[first].strokes).toBe(1) // the ace
    // later par 3s were NOT forced (they can ace naturally, but all four acing is impossible-odds)
    const laterAces = par3s.slice(1).filter((x) => r.scores[x.i].strokes === 1)
    expect(laterAces.length).toBeLessThan(par3s.length - 1)
    // and the same seed replays to the same ace — determinism intact
    const again = replayRound(seed, undefined, r.scores.map((s) => s.shots.map((sh) => sh.choice)))
    expect(again.ok && again.scores[first].strokes).toBe(1)
  })

  it('a due albatross counter holes out the first go-for-it — layup players get nothing', () => {
    const seed = `practice:pebble-beach:albtest:${encodeFortune(f({ alb: 500 }))}`
    const course = COURSES.find((c) => c.slug === 'pebble-beach')!
    const firstPar5 = course.holes.findIndex((h) => h.par === 5)
    // go for the green on the first par 5's second shot
    const { r } = probe(seed, (h, shot) => (h === firstPar5 && shot === 1 ? 'aggressive' : 'normal'))
    if (!r.ok) throw new Error('replay failed')
    expect(r.scores[firstPar5].strokes).toBe(2) // the albatross

    // never going for it → no destiny albatross anywhere
    const { r: layup } = probe(seed, () => 'normal')
    if (!layup.ok) throw new Error('replay failed')
    expect(layup.scores.some((s, i) => course.holes[i].par === 5 && s.strokes === 2)).toBe(false)
  })

  // ~1.2s alone, but the whole-course seed hunt can starve past vitest's 5s
  // default when CI runs it beside the Monte Carlo calibration workers
  it('a penalty-tainted go attempt neither fires nor spends the albatross destiny', { timeout: 30_000 }, () => {
    // Hunt any course/seed where the FIRST par 5's tee shot takes a penalty
    // (aggressive tee, courting the trouble) while the next par 5's tee
    // stays clean — the destined albatross must SKIP the for-3 recovery on
    // the first and fire on the next clean go instead. Deterministic: the
    // scan order is fixed, so the same seed is found every run.
    for (const course of COURSES) {
      const par5s = course.holes.map((h, i) => ({ par: h.par, i })).filter((x) => x.par === 5).map((x) => x.i)
      if (par5s.length < 2) continue
      const [wetIdx, nextIdx] = [par5s[0], par5s[1]]
      const policy = (h: number, shot: number): Choice =>
        h === wetIdx && shot === 0 ? 'aggressive' : par5s.includes(h) && shot === 1 ? 'aggressive' : 'normal'
      for (let i = 0; i < 60; i++) {
        const seed = `practice:${course.slug}:albpen${i}:${encodeFortune(f({ alb: 500 }))}`
        const { r } = probe(seed, policy)
        if (!r.ok) throw new Error('replay failed')
        const wetTee = r.scores[wetIdx].shots[0]
        const dryTee = r.scores[nextIdx].shots[0]
        if (!wetTee.penalty || dryTee.penalty) continue // keep hunting
        // the first go was for 3 — no albatross possible, guarantee untouched
        expect(r.scores[wetIdx].strokes).toBeGreaterThanOrEqual(3)
        // …and it fires on the next CLEAN go instead of being silently spent
        expect(r.scores[nextIdx].strokes).toBe(2)
        return
      }
    }
    throw new Error('no seed with a penalized first-par-5 tee and a clean next one')
  })

  it('the client store and the referee agree on a destiny round', () => {
    // node env: stand in for the browser's localStorage
    const map = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      get length() {
        return map.size
      },
      clear: () => map.clear(),
      getItem: (k: string) => map.get(k) ?? null,
      key: (i: number) => [...map.keys()][i] ?? null,
      removeItem: (k: string) => void map.delete(k),
      setItem: (k: string, v: string) => void map.set(k, v),
    } as Storage)
    // force the store to bake a due counter into the seed via localStorage
    const setup = practiceSetup('st-andrews-old', 'destinylockstep')
    localStorage.setItem(
      'dogleg:fortune:v1',
      JSON.stringify({ p: { ace: 700, aceK: 1, alb: 0, albK: 0 }, d: { ace: 0, alb: 0 } }),
    )
    let s = newRound(setup, 'practice', 'greens')
    expect(s.seed).toContain(':f700.1.0.0.0')
    let guard = 0
    while (!s.complete && guard++ < 500) {
      if (s.hole?.stage === 'done') {
        s = advanceHole(s)
        continue
      }
      const next = applyChoice(s, 'normal')
      s = next === s ? applyChoice(s, 'safe') : next
    }
    const course = COURSES.find((c) => c.slug === 'st-andrews-old')!
    const firstPar3 = course.holes.findIndex((h) => h.par === 3)
    expect(s.scores[firstPar3]!.strokes).toBe(1) // client saw the destiny ace
    const replay = replayRound(s.seed, 'greens', decisionsFromScores(s.scores)!)
    expect(replay.ok).toBe(true)
    if (replay.ok) expect(replay.toPar).toBe(roundToPar(s)) // referee agrees exactly
    vi.unstubAllGlobals()
  })

  it('pre-fortune seeds still parse and play (no fortune tail)', () => {
    const info = setupFromSeed('practice:pebble-beach:legacy')!
    expect(info.fortune).toBeNull()
  })

  it('the fortune tail cannot reroll the dice — counters that leave the odds alone leave the round alone', () => {
    // The grind this closes: the tail is client-kept, so if it seeded the
    // rng, replaying one decision list under many tails would deal many
    // hands. Dice are keyed on the stripped seed; a practice ace counter
    // below its threshold moves neither the odds nor (now) the dice, so the
    // rounds must be IDENTICAL.
    const a = `practice:pebble-beach:grindcheck:${encodeFortune(f({ ace: 10 }))}`
    const b = `practice:pebble-beach:grindcheck:${encodeFortune(f({ ace: 400 }))}`
    const decisions: Choice[][] = Array(18)
      .fill(null)
      .map(() => ['normal'])
    for (let guard = 0; guard < 300; guard++) {
      const ra = replayRound(a, undefined, decisions)
      const rb = replayRound(b, undefined, decisions)
      expect(rb.ok).toBe(ra.ok)
      if (ra.ok && rb.ok) {
        expect(rb.results).toEqual(ra.results)
        expect(rb.toPar).toBe(ra.toPar)
        return
      }
      if (!ra.ok) {
        const m = /hole (\d+): round left unfinished/.exec(ra.error)
        if (!m) throw new Error(`unexpected: ${ra.error}`)
        decisions[Number(m[1]) - 1].push('normal')
      }
    }
    throw new Error('probe never finished')
  })

  it('only a named identity claims the daily streak multiplier', async () => {
    const map = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      get length() {
        return map.size
      },
      clear: () => map.clear(),
      getItem: (k: string) => map.get(k) ?? null,
      key: (i: number) => [...map.keys()][i] ?? null,
      removeItem: (k: string) => void map.delete(k),
      setItem: (k: string, v: string) => void map.set(k, v),
    } as Storage)
    const { fortuneFor } = await import('../state/store')
    const day = (offset: number) => {
      const d = new Date()
      d.setDate(d.getDate() + offset)
      return localDateKey(d)
    }
    // the claim is derived from POSTED dailies (what the referee can verify),
    // never from local-only history — and never for an anonymous identity
    localStorage.setItem('dogleg:posted:v1', JSON.stringify([day(-1), day(-2)]))
    expect(fortuneFor('daily').streak).toBe(0) // no identity at all
    localStorage.setItem('dogleg:player:v1', JSON.stringify({ id: 'x', secret: 'y', name: null }))
    expect(fortuneFor('daily').streak).toBe(0) // anonymous: nothing posted under a name
    localStorage.setItem('dogleg:player:v1', JSON.stringify({ id: 'x', secret: 'y', name: 'Cam' }))
    expect(fortuneFor('daily').streak).toBe(3) // yesterday + the day before + today
    // a gap breaks the run: consecutive days, not a lifetime count
    localStorage.setItem('dogleg:posted:v1', JSON.stringify([day(-3), day(-10)]))
    expect(fortuneFor('daily').streak).toBe(1) // just today
    localStorage.removeItem('dogleg:posted:v1')
    expect(fortuneFor('daily').streak).toBe(1) // first-ever post still counts itself
    vi.unstubAllGlobals()
  })

  it('daily ace/albatross counters are derived from posted cards, not local tallies', async () => {
    const map = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      get length() {
        return map.size
      },
      clear: () => map.clear(),
      getItem: (k: string) => map.get(k) ?? null,
      key: (i: number) => [...map.keys()][i] ?? null,
      removeItem: (k: string) => void map.delete(k),
      setItem: (k: string, v: string) => void map.set(k, v),
    } as Storage)
    const { fortuneFor } = await import('../state/store')
    localStorage.setItem('dogleg:player:v1', JSON.stringify({ id: 'x', secret: 'y', name: 'Cam' }))
    const day = (offset: number) => {
      const d = new Date()
      d.setDate(d.getDate() + offset)
      return localDateKey(d)
    }
    // pebble-beach hole 5 (index 4) is a par 3 — an eagle there is an ace
    const pars = Array(18).fill('par')
    const aceDay = [...pars]
    aceDay[4] = 'eagle'
    const hist = (dateKey: string, results: string[]) => ({
      dateKey,
      puzzleNumber: 1,
      courseSlug: 'pebble-beach',
      toPar: 0,
      results,
    })
    localStorage.setItem(
      'dogleg:history:v1',
      JSON.stringify([hist(day(-5), pars), hist(day(-3), aceDay), hist(day(-2), pars), hist(day(-1), pars)]),
    )
    // only day(-3) onward count toward the ace drought; the albatross track
    // never reset, so it spans every posted card. day(-4) played locally but
    // never posted — it must not exist as far as the counters are concerned.
    localStorage.setItem('dogleg:posted:v1', JSON.stringify([day(-5), day(-3), day(-2), day(-1)]))
    const f1 = fortuneFor('daily')
    expect(f1.ace).toBe(2) // the two ace-less cards since the posted ace
    expect(f1.alb).toBe(4) // all four posted cards, no albatross ever
    // a card that never posted doesn't extend the drought
    localStorage.setItem('dogleg:posted:v1', JSON.stringify([day(-3), day(-2), day(-1)]))
    expect(fortuneFor('daily').alb).toBe(3)
    vi.unstubAllGlobals()
  })
})

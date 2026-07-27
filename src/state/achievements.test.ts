import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HoleResult } from '../engine/types'
import {
  computeProgress,
  LADDERS,
  loadAchievements,
  ONE_OFFS,
  reconcileAchievements,
} from './achievements'
import type { LoggedRound } from './stats'

// the suite runs in node — stand in for the browser's localStorage
function stubStorage() {
  const store = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  })
}

beforeEach(stubStorage)
afterEach(() => vi.unstubAllGlobals())

const PAR_ROUND: HoleResult[] = Array(18).fill('par')

function round(overrides: Partial<LoggedRound> & { results?: HoleResult[] } = {}): LoggedRound {
  const results = overrides.results ?? PAR_ROUND
  const toPar = results.reduce(
    (s, r) => s + ({ albatross: -3, eagle: -2, birdie: -1, par: 0, bogey: 1, double: 2, triple: 3 })[r],
    0,
  )
  return {
    seed: overrides.seed ?? `t:${Math.random()}`,
    mode: 'practice',
    courseSlug: 'pebble-beach',
    dateKey: '2026-07-20',
    playedAt: new Date(2026, 6, 20, 12, 0).getTime(),
    toPar,
    strokes: 72 + toPar,
    results,
    ...overrides,
  }
}

const emptyLedger = () => ({ v: 1 as const, held: {}, stolen: {} })

describe('computeProgress', () => {
  it('counts ladder stats off the log', () => {
    const results: HoleResult[] = [...Array(4).fill('birdie'), 'eagle', 'bogey', ...Array(12).fill('par')]
    const p = computeProgress([round({ results }), round()], [], emptyLedger())
    expect(p.ladders.birdies).toBe(4)
    expect(p.ladders.eagles).toBe(1)
    expect(p.ladders.bogeys).toBe(1)
    expect(p.ladders.pars).toBe(12 + 18)
    expect(p.ladders.rounds).toBe(2)
    expect(p.ladders.redRounds).toBe(1) // 4 birdies + eagle - bogey = -5
  })

  it('derives the per-round event badges', () => {
    const spotless: HoleResult[] = [...Array(3).fill('birdie'), ...Array(15).fill('par')]
    const p = computeProgress([round({ results: spotless })], [], emptyLedger())
    expect(p.oneOffs.spotless).toBe(1) // no bogeys
    expect(p.oneOffs.heater).toBe(1) // three straight birdies
    expect(p.oneOffs.evenSteven).toBe(0)
    const allPar = computeProgress([round()], [], emptyLedger())
    expect(allPar.oneOffs.evenSteven).toBe(1)
    expect(allPar.oneOffs.spotless).toBe(1)
  })

  it('scores the comeback and the bounce-backs', () => {
    // +4 through six, then storms home to -1
    const results: HoleResult[] = [
      'double', 'bogey', 'bogey', 'par', 'par', 'par',
      'birdie', 'birdie', 'birdie', 'birdie', 'birdie',
      ...Array(7).fill('par'),
    ]
    const p = computeProgress([round({ results })], [], emptyLedger())
    expect(p.oneOffs.comeback).toBe(1)
    // pars separate every over from every under above — no bounce-back
    expect(p.oneOffs.shortMemory).toBe(0)

    // a real bounce-back, and a shake-it-off right after a triple
    const bounce: HoleResult[] = ['bogey', 'birdie', 'triple', 'eagle', ...Array(14).fill('par')]
    const q = computeProgress([round({ results: bounce })], [], emptyLedger())
    expect(q.oneOffs.shortMemory).toBe(2) // bogey→birdie AND triple→eagle both count
    expect(q.oneOffs.shakeItOff).toBe(1) // only the triple→eagle
  })

  it('reads the clock only from rounds with real timestamps', () => {
    const hooky = round({ playedAt: new Date(2026, 6, 22, 15, 30).getTime() }) // Wed 3:30pm
    const synthetic = round({ seed: 'hist:2026-07-01', playedAt: new Date(2026, 6, 1, 15, 30).getTime() })
    const weekend = round({ playedAt: new Date(2026, 6, 25, 15, 30).getTime() }) // Saturday
    const p = computeProgress([hooky, synthetic, weekend], [], emptyLedger())
    expect(p.oneOffs.hooky).toBe(1)
    const dawn = round({ playedAt: new Date(2026, 6, 22, 6, 10).getTime() })
    expect(computeProgress([dawn], [], emptyLedger()).oneOffs.dawnPatrol).toBe(1)
  })

  it('reads records held, ever-held, and reclaims from the ledger', () => {
    const ledger = {
      v: 1 as const,
      held: { 'pebble-beach': { toPar: -4, since: 1 }, augusta: { toPar: -2, since: 2 } },
      stolen: {
        'pebble-beach': { by: 'X', theirToPar: -5, myToPar: -4, at: 3, notifiedOn: 'd', dismissed: true },
        'st-andrews': { by: 'Y', theirToPar: -6, myToPar: -3, at: 4, notifiedOn: 'd', dismissed: true },
      },
    }
    const p = computeProgress([], [], ledger)
    expect(p.ladders.recordsNow).toBe(2)
    expect(p.ladders.recordsEver).toBe(3) // pebble, augusta, st-andrews
    expect(p.oneOffs.reclaim).toBe(1) // pebble: stolen AND held again
    expect(p.oneOffs.firstRecord).toBe(1)
  })
})

describe('reconcileAchievements', () => {
  it('quiet mode grants silently, records the summary once, and is idempotent', () => {
    const snapshot = computeProgress([round(), round({ results: [...Array(3).fill('birdie'), ...Array(15).fill('par')] })], [], emptyLedger())
    const first = reconcileAchievements('quiet', snapshot)
    expect(first).toEqual([]) // never toasts
    const ledger = loadAchievements()
    expect(ledger.backfill?.granted).toBeGreaterThan(0)
    expect(ledger.earned['rounds:1']).toMatchObject({ backfilled: true })
    expect(ledger.earned['birdies:1']).toBeTruthy()
    const grantedFirst = ledger.backfill!.granted
    // re-run: nothing changes, summary not re-recorded
    reconcileAchievements('quiet', snapshot)
    const again = loadAchievements()
    expect(Object.keys(again.earned).length).toBe(Object.keys(ledger.earned).length)
    expect(again.backfill?.granted).toBe(grantedFirst)
  })

  it('live mode returns exactly the newly earned tiers, once', () => {
    reconcileAchievements('quiet', computeProgress([round()], [], emptyLedger()))
    // ten rounds later: The Grind tier 2 falls, nothing else new at tier level
    const tenRounds = Array.from({ length: 10 }, () => round())
    const unlocks = reconcileAchievements('live', computeProgress(tenRounds, [], emptyLedger()))
    expect(unlocks.some((u) => u.id === 'rounds:2' && u.name === 'Regular')).toBe(true)
    // same snapshot again: nothing fires twice
    expect(reconcileAchievements('live', computeProgress(tenRounds, [], emptyLedger()))).toEqual([])
  })

  it('repeatable one-offs bump their count with a gentler toast, non-repeatables never do', () => {
    const spotless = () => round({ results: [...Array(2).fill('birdie'), ...Array(16).fill('par')] })
    reconcileAchievements('quiet', computeProgress([spotless()], [], emptyLedger()))
    expect(loadAchievements().counts.spotless).toBe(1)
    const unlocks = reconcileAchievements('live', computeProgress([spotless(), spotless()], [], emptyLedger()))
    const bump = unlocks.find((u) => u.id === 'spotless')
    expect(bump?.count).toBe(2)
    expect(loadAchievements().counts.spotless).toBe(2)
  })

  it('every definition id is unique and thresholds strictly climb', () => {
    const ids = new Set<string>()
    for (const l of LADDERS) {
      expect(ids.has(l.id)).toBe(false)
      ids.add(l.id)
      for (let i = 1; i < l.tiers.length; i++) expect(l.tiers[i].threshold).toBeGreaterThan(l.tiers[i - 1].threshold)
    }
    for (const o of ONE_OFFS) {
      expect(ids.has(o.id)).toBe(false)
      ids.add(o.id)
      if (o.hidden) expect(o.hint).toBeTruthy()
    }
  })
})

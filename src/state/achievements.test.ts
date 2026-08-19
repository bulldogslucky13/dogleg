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

const emptyLedger = () => ({ v: 2 as const, held: {}, stolen: {}, reclaimed: {}, heldSeason: {}, stolenSeason: {} })

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

  it('counts a full round of a SHORT course, not just eighteen holes', () => {
    // cobblestone-creek is a real 9-hole par-3 course; the-swing is 10. A gate
    // of `results.length >= 18` locked every short-course player out of
    // Spotless, whose requirement is "a full round" — not eighteen holes.
    const nine = round({ courseSlug: 'cobblestone-creek', results: Array(9).fill('par') })
    expect(computeProgress([nine], [], emptyLedger()).oneOffs.spotless).toBe(1)
    const ten = round({ courseSlug: 'the-swing', results: Array(10).fill('par') })
    expect(computeProgress([ten], [], emptyLedger()).oneOffs.spotless).toBe(1)
    // a bogey still spoils it, short course or long
    const blemished = round({ courseSlug: 'cobblestone-creek', results: ['bogey', ...Array(8).fill('par')] })
    expect(computeProgress([blemished], [], emptyLedger()).oneOffs.spotless).toBe(0)

    // …but the badges whose own copy names eighteen stay eighteen-hole badges:
    // an all-par nine is not "par all eighteen holes"
    const shortAllPar = computeProgress([nine], [], emptyLedger())
    expect(shortAllPar.oneOffs.evenSteven).toBe(0)
    expect(shortAllPar.oneOffs.bookends).toBe(0)

    // a PARTIAL card never counts as a full round — daily history recovered
    // from old saves can carry an empty results array
    const stub = round({ courseSlug: 'cobblestone-creek', results: [] })
    expect(computeProgress([stub], [], emptyLedger()).oneOffs.spotless).toBe(0)
  })

  it('scores Character Building against pars or better — the damage has to win the card', () => {
    // ten holes over, eight that held
    const rough: HoleResult[] = [...Array(10).fill('bogey'), ...Array(7).fill('par'), 'birdie']
    expect(computeProgress([round({ results: rough })], [], emptyLedger()).oneOffs.characterBuilding).toBe(1)

    // a TIE is not "more": nine and nine, however ugly the nine were
    const tied: HoleResult[] = [...Array(8).fill('triple'), 'double', ...Array(8).fill('par'), 'eagle']
    expect(computeProgress([round({ results: tied })], [], emptyLedger()).oneOffs.characterBuilding).toBe(0)

    // pars are on the GOOD side of this one — a card full of them, or one where
    // a few blow-ups sit among pars, doesn't qualify however far over it went
    expect(computeProgress([round()], [], emptyLedger()).oneOffs.characterBuilding).toBe(0)
    const blowups: HoleResult[] = [...Array(4).fill('triple'), ...Array(14).fill('par')]
    expect(computeProgress([round({ results: blowups })], [], emptyLedger()).oneOffs.characterBuilding).toBe(0)

    // full rounds only, at whatever length the course actually is
    const nine = round({ courseSlug: 'cobblestone-creek', results: [...Array(5).fill('bogey'), ...Array(4).fill('par')] })
    expect(computeProgress([nine], [], emptyLedger()).oneOffs.characterBuilding).toBe(1)
    const abandoned = round({ results: ['bogey', 'bogey', 'par'] })
    expect(computeProgress([abandoned], [], emptyLedger()).oneOffs.characterBuilding).toBe(0)
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

  it('reads records held and ever-held from the ledger', () => {
    const ledger = {
      v: 2 as const,
      held: { 'pebble-beach': { toPar: -4, since: 1 }, augusta: { toPar: -2, since: 2 } },
      stolen: {
        'st-andrews': { by: 'Y', theirToPar: -6, myToPar: -3, at: 4, notifiedOn: 'd', dismissed: true },
      },
      reclaimed: {},
      heldSeason: {},
      stolenSeason: {},
    }
    const p = computeProgress([], [], ledger)
    expect(p.ladders.recordsNow).toBe(2)
    expect(p.ladders.recordsEver).toBe(3) // pebble, augusta, st-andrews
    expect(p.oneOffs.firstRecord).toBe(1)
    expect(p.oneOffs.reclaim).toBe(0) // nothing has been taken back
  })

  /**
   * Repo Man counts reclaims off `ledger.reclaimed`, and this test drives the
   * REAL writers to fill it. That matters: the first version of this counted
   * `held ∩ stolen`, which reads plausibly and is always empty — records.ts
   * deletes the steal entry the moment a record is won back, so no ledger a
   * player can actually produce has a slug in both maps. A test that hand-built
   * such a ledger passed while the badge was unearnable, so this one refuses to
   * build ledger state by hand.
   */
  it('counts every reclaim the records ledger actually records', async () => {
    const { recordWon, syncLedger, loadLedger } = await import('../lib/records')
    // holders are ids (names are shared) — one stable id per fixture name
    const idOf = (name: string) => `id-${name.toLowerCase()}`
    const ME = idOf('Jackson')
    const server = (holder: string, toPar: number) =>
      new Map([['pebble-beach', { player_id: idOf(holder), player_name: holder, to_par: toPar }]])

    recordWon('pebble-beach', -4, 1000) // ours
    expect(computeProgress([], [], loadLedger()).oneOffs.reclaim).toBe(0)

    syncLedger(server('Hank', -6), ME, 2000, '2026-07-20') // stolen
    expect(computeProgress([], [], loadLedger()).oneOffs.reclaim).toBe(0)

    recordWon('pebble-beach', -7, 3000) // taken back, on this device
    const once = computeProgress([], [], loadLedger())
    expect(once.oneOffs.reclaim).toBe(1)
    expect(once.ladders.recordsNow).toBe(1)

    // a later sync agreeing the record is ours must not re-count the same
    // take-back — the steal entry is already gone
    syncLedger(server('Jackson', -7), ME, 4000, '2026-07-21')
    expect(computeProgress([], [], loadLedger()).oneOffs.reclaim).toBe(1)

    // stolen again, then reclaimed on ANOTHER device — sync learns it as a diff
    syncLedger(server('Marge', -8), ME, 5000, '2026-07-22')
    syncLedger(server('Jackson', -9), ME, 6000, '2026-07-23')
    expect(computeProgress([], [], loadLedger()).oneOffs.reclaim).toBe(2)
    expect(loadLedger().stolen['pebble-beach']).toBeUndefined()
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

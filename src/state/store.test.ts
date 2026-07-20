import { afterEach, describe, expect, it, vi } from 'vitest'
import { COURSES } from '../engine/courses'
import { shareText, SITE_URL, type DailySetup } from '../engine/daily'
import type { HoleResult, HoleScore } from '../engine/types'
import {
  buildRecap,
  characterRecords,
  loadHistory,
  loadRound,
  migrateLegacyStorage,
  type HistoryEntry,
  type RoundState,
} from './store'

const entry = (over: Partial<HistoryEntry>): HistoryEntry => ({
  dateKey: '2026-07-01',
  puzzleNumber: 1,
  courseSlug: COURSES[0].slug,
  toPar: 0,
  results: Array(18).fill('par'),
  ...over,
})

describe('shareText (Break Par card format)', () => {
  const course = COURSES[0]
  const par = course.holes.reduce((s, h) => s + h.par, 0)
  const setup: DailySetup = {
    course,
    cond: { wind: 10, greens: 'Medium', difficulty: 5 },
    seed: 's',
    puzzleNumber: 18,
    dateKey: '2026-07-18',
  }
  const results: HoleResult[] = [
    'birdie', 'par', 'double', 'par', 'bogey', 'birdie', 'birdie', 'bogey', 'par',
    'par', 'birdie', 'birdie', 'birdie', 'par', 'bogey', 'bogey', 'par', 'birdie',
  ]

  it('mirrors the original layout with the character in the rank slot', () => {
    const lines = shareText(setup, results, -1, 'fairway').split('\n')
    expect(lines[0]).toBe('DOGLEG #18 ⛳')
    expect(lines[1]).toBe(`${course.name} (Par ${par})`)
    expect(lines[2]).toBe(`${par - 1} (-1)`)
    expect(lines[3]).toBe('')
    expect([...lines[4]]).toHaveLength(9) // spread: emoji are multi-unit in .length
    expect([...lines[5]]).toHaveLength(9)
    expect(lines[6]).toBe('💣 Fairway Finder')
    expect(lines[7]).toBe('')
    expect(lines[8]).toBe('🐦 7  ·  ⛳ 6  ·  😬 5')
    expect(lines[9]).toBe(SITE_URL)
  })

  it('omits the character line for pre-character rounds', () => {
    const lines = shareText(setup, results, -1).split('\n')
    expect([...lines[5]]).toHaveLength(9)
    expect(lines[6]).toBe('')
    expect(lines[7]).toBe('🐦 7  ·  ⛳ 6  ·  😬 5')
  })
})

describe('legacy bp: → dogleg: storage migration', () => {
  // the suite runs in node, so stand in for the browser's localStorage
  const fakeStorage = (seed: Record<string, string> = {}): Storage => {
    const map = new Map(Object.entries(seed))
    return {
      get length() {
        return map.size
      },
      clear: () => map.clear(),
      getItem: (k: string) => map.get(k) ?? null,
      key: (i: number) => [...map.keys()][i] ?? null,
      removeItem: (k: string) => void map.delete(k),
      setItem: (k: string, v: string) => void map.set(k, v),
    }
  }

  afterEach(() => vi.unstubAllGlobals())

  it('moves bp:* saves to dogleg:* and drops the old keys', () => {
    const storage = fakeStorage({ 'bp:round:v1': '{"seed":"s"}', 'bp:history:v1': '[]' })
    vi.stubGlobal('localStorage', storage)
    migrateLegacyStorage()
    expect(storage.getItem('dogleg:round:v1')).toBe('{"seed":"s"}')
    expect(storage.getItem('dogleg:history:v1')).toBe('[]')
    expect(storage.getItem('bp:round:v1')).toBeNull()
    expect(storage.getItem('bp:history:v1')).toBeNull()
  })

  it('merges histories by day when an old-bundle tab wrote bp:* after migration', () => {
    // legacy has an extra day (07-01) plus a different copy of 07-02; current wins the tie
    const legacy = [entry({ dateKey: '2026-07-01', toPar: -1 }), entry({ dateKey: '2026-07-02', toPar: 9 })]
    const current = [entry({ dateKey: '2026-07-02', toPar: 2 }), entry({ dateKey: '2026-07-03', toPar: 1 })]
    const storage = fakeStorage({
      'bp:history:v1': JSON.stringify(legacy),
      'dogleg:history:v1': JSON.stringify(current),
    })
    vi.stubGlobal('localStorage', storage)
    migrateLegacyStorage()
    const merged = JSON.parse(storage.getItem('dogleg:history:v1')!) as HistoryEntry[]
    expect(merged.map((e) => [e.dateKey, e.toPar])).toEqual([
      ['2026-07-01', -1],
      ['2026-07-02', 2],
      ['2026-07-03', 1],
    ])
    expect(storage.getItem('bp:history:v1')).toBeNull()
  })

  it('keeps the further-along copy when the same round sits under both keys', () => {
    const base = { seed: 's', mode: 'daily', dateKey: '2026-07-19' }
    const storage = fakeStorage({
      'bp:round:v1': JSON.stringify({ ...base, rolls: 12 }),
      'dogleg:round:v1': JSON.stringify({ ...base, rolls: 4 }),
    })
    vi.stubGlobal('localStorage', storage)
    migrateLegacyStorage()
    expect((JSON.parse(storage.getItem('dogleg:round:v1')!) as RoundState).rolls).toBe(12)
    expect(storage.getItem('bp:round:v1')).toBeNull()
  })

  it('keeps the dogleg round when the legacy one is a different round or corrupt', () => {
    const current = JSON.stringify({ seed: 'new', mode: 'daily', dateKey: '2026-07-19', rolls: 1 })
    const different = fakeStorage({
      'bp:round:v1': JSON.stringify({ seed: 'old', mode: 'practice', dateKey: '2026-07-10', rolls: 40 }),
      'dogleg:round:v1': current,
    })
    vi.stubGlobal('localStorage', different)
    migrateLegacyStorage()
    expect(different.getItem('dogleg:round:v1')).toBe(current)
    expect(different.getItem('bp:round:v1')).toBeNull()
    vi.unstubAllGlobals()

    const corrupt = fakeStorage({ 'bp:round:v1': 'not json', 'dogleg:round:v1': current })
    vi.stubGlobal('localStorage', corrupt)
    migrateLegacyStorage()
    expect(corrupt.getItem('dogleg:round:v1')).toBe(current)
    expect(corrupt.getItem('bp:round:v1')).toBeNull()
  })

  it('loadRound and loadHistory pick up saves still under the legacy keys', () => {
    const round: RoundState = {
      mode: 'practice',
      seed: 's',
      courseSlug: COURSES[0].slug,
      cond: { wind: 10, greens: 'Medium', difficulty: 5 },
      puzzleNumber: 1,
      dateKey: '2026-07-01',
      currentHole: 0,
      scores: Array(18).fill(null),
      aggressiveLeft: 8,
      rolls: 0,
      complete: false,
      hole: null,
    }
    vi.stubGlobal(
      'localStorage',
      fakeStorage({
        'bp:round:v1': JSON.stringify(round),
        'bp:history:v1': JSON.stringify([entry({})]),
      }),
    )
    expect(loadRound()?.seed).toBe('s')
    expect(loadHistory()).toHaveLength(1)
  })
})

describe('pruneArchive retention', () => {
  const arch = (over: Partial<import('./store').ArchivedRound>): import('./store').ArchivedRound => ({
    seed: `practice:x:${Math.random()}`,
    mode: 'practice',
    courseSlug: 'pebble-beach',
    dateKey: '2026-07-19',
    toPar: 2,
    strokes: 74,
    results: Array(18).fill('par'),
    decisions: Array(18).fill(['normal', 'normal']),
    playedAt: 0,
    ...over,
  })

  it('keeps the 10 most recent, personal bests, and course records forever', async () => {
    const { pruneArchive } = await import('./store')
    const rounds = [
      // 12 recent mediocre rounds on the same course, newest last
      ...Array.from({ length: 12 }, (_x, i) => arch({ seed: `s${i}`, toPar: 5, playedAt: 100 + i })),
      // an old personal best on another course
      arch({ seed: 'pr-old', courseSlug: 'st-andrews-old', toPar: -4, playedAt: 1 }),
      // an ancient confirmed course record, worse than a later personal round
      arch({ seed: 'cr-ancient', courseSlug: 'oakmont', toPar: -1, courseRecord: true, playedAt: 2 }),
      arch({ seed: 'oak-better', courseSlug: 'oakmont', toPar: -3, playedAt: 3 }),
    ]
    const kept = pruneArchive(rounds)
    const seeds = new Set(kept.map((r) => r.seed))
    // 10 most recent of the mediocre pile survive; the 2 oldest drop (unless they're bests)
    expect(seeds.has('s11')).toBe(true)
    expect(seeds.has('s2')).toBe(true)
    expect(seeds.has('s1')).toBe(false)
    expect(seeds.has('pr-old')).toBe(true) // personal best never ages out
    expect(seeds.has('cr-ancient')).toBe(true) // course record never ages out
    expect(seeds.has('oak-better')).toBe(true) // personal best on oakmont too
    // sorted newest first
    expect(kept[0].seed).toBe('s11')
  })
})

describe('lifetimeRounds', () => {
  const fakeStorage = (seed: Record<string, string> = {}): Storage => {
    const map = new Map(Object.entries(seed))
    return {
      get length() {
        return map.size
      },
      clear: () => map.clear(),
      getItem: (k: string) => map.get(k) ?? null,
      key: (i: number) => [...map.keys()][i] ?? null,
      removeItem: (k: string) => void map.delete(k),
      setItem: (k: string, v: string) => void map.set(k, v),
    }
  }

  afterEach(() => vi.unstubAllGlobals())

  it('seeds pre-counter players from daily history + archived practice rounds', async () => {
    const { lifetimeRounds } = await import('./store')
    const history = [entry({ dateKey: '2026-07-18' }), entry({ dateKey: '2026-07-19' })]
    const archive = [
      { seed: 'p1', mode: 'practice', playedAt: 1 },
      { seed: 'd1', mode: 'daily', playedAt: 2 }, // daily already counted via history
    ]
    vi.stubGlobal(
      'localStorage',
      fakeStorage({
        'dogleg:history:v1': JSON.stringify(history),
        'dogleg:archive:v1': JSON.stringify(archive),
      }),
    )
    expect(lifetimeRounds()).toBe(3) // 2 dailies + 1 practice
    expect(lifetimeRounds()).toBe(3) // stable on re-read
  })

  it('archiving a finished round bumps the tally exactly once', async () => {
    const { archiveRound, lifetimeRounds } = await import('./store')
    vi.stubGlobal('localStorage', fakeStorage())
    const shots = [{ stage: 'tee', choice: 'normal', outcome: 'fairway', penalty: false, faced: {}, after: {} }]
    const round = {
      mode: 'practice',
      seed: 'practice:pebble-beach:lifetime',
      courseSlug: 'pebble-beach',
      cond: { wind: 10, greens: 'Medium', difficulty: 5 },
      puzzleNumber: 0,
      dateKey: '2026-07-19',
      currentHole: 17,
      scores: Array(18).fill({ strokes: 4, penalties: 0, result: 'par', note: '', shots }),
      aggressiveLeft: 8,
      rolls: 1,
      complete: true,
      hole: null,
    } as unknown as RoundState
    expect(lifetimeRounds()).toBe(0)
    archiveRound(round)
    expect(lifetimeRounds()).toBe(1)
    archiveRound(round) // same round again — must not double-count
    expect(lifetimeRounds()).toBe(1)
  })
})

describe('characterRecords', () => {
  it('groups daily rounds by character and tracks avg/best', () => {
    const history: HistoryEntry[] = [
      entry({ dateKey: '2026-07-01', toPar: -2, character: 'dart' }),
      entry({ dateKey: '2026-07-02', toPar: 4, character: 'dart' }),
      entry({ dateKey: '2026-07-03', toPar: 1, character: 'greens' }),
      entry({ dateKey: '2026-07-04', toPar: 3 }), // pre-character round: ignored
    ]
    const records = characterRecords(history)
    expect(records).toHaveLength(2)
    const dart = records.find((r) => r.id === 'dart')!
    expect(dart.played).toBe(2)
    expect(dart.avgToPar).toBe(1)
    expect(dart.bestToPar).toBe(-2)
  })

  it('is empty for pre-character history', () => {
    expect(characterRecords([entry({})])).toHaveLength(0)
  })
})

describe('buildRecap', () => {
  const course = COURSES[0]
  const score = (holeIdx: number, diff: number, penalties = 0, shots: HoleScore['shots'] = []): HoleScore => ({
    strokes: course.holes[holeIdx].par + diff,
    penalties,
    result: diff <= -1 ? 'birdie' : diff === 0 ? 'par' : diff === 1 ? 'bogey' : 'double',
    note: '',
    shots,
  })

  const roundWith = (scores: (HoleScore | null)[], aggressiveLeft = 5): RoundState => ({
    mode: 'daily',
    seed: 's',
    courseSlug: course.slug,
    cond: { wind: 10, greens: 'Medium', difficulty: 5 },
    puzzleNumber: 1,
    dateKey: '2026-07-01',
    currentHole: 17,
    scores,
    aggressiveLeft,
    rolls: 0,
    complete: true,
    hole: null,
  })

  it('finds best hole, toughest hole, budget used, and penalties', () => {
    const scores = course.holes.map((_h, i) => score(i, 0))
    scores[6] = score(6, -1) // birdie on 7
    scores[11] = score(11, 2, 1) // double on 12 with a penalty
    const recap = buildRecap(roundWith(scores, 3))!
    expect(recap.best).toEqual({ hole: course.holes[6].number, result: 'birdie' })
    expect(recap.worst).toEqual({ hole: course.holes[11].number, result: 'double' })
    expect(recap.aggressiveUsed).toBe(5)
    expect(recap.penalties).toBe(1)
  })

  it('reports a clean card and the longest one-putt', () => {
    const scores = course.holes.map((_h, i) => score(i, 0))
    const mkShot = (over: Record<string, unknown>) =>
      ({ choice: 'normal', outcome: 'lag', penalty: false, faced: {} as never, ...over }) as unknown as HoleScore['shots'][number]
    scores[3] = score(3, 0, 0, [
      mkShot({ stage: 'approach', after: { pos: 100, lie: 'green', side: 'center', puttFeet: 31 } }),
      mkShot({ stage: 'putt', outcome: 'one', after: { pos: 100, lie: 'green', side: 'center', puttFeet: 0 } }),
    ])
    const recap = buildRecap(roundWith(scores, 8))!
    expect(recap.worst).toBeNull()
    expect(recap.aggressiveUsed).toBe(0)
    expect(recap.longestMake).toBe(31)
  })

  it('returns null for an unfinished round', () => {
    const scores = course.holes.map((_h, i) => score(i, 0))
    expect(buildRecap({ ...roundWith(scores), complete: false })).toBeNull()
  })
})

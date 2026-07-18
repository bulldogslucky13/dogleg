import { describe, expect, it } from 'vitest'
import { COURSES } from '../engine/courses'
import type { HoleScore } from '../engine/types'
import { buildRecap, characterRecords, type HistoryEntry, type RoundState } from './store'

const entry = (over: Partial<HistoryEntry>): HistoryEntry => ({
  dateKey: '2026-07-01',
  puzzleNumber: 1,
  courseSlug: COURSES[0].slug,
  toPar: 0,
  results: Array(18).fill('par'),
  ...over,
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

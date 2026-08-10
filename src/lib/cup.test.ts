import { describe, expect, it } from 'vitest'
import { cupPoints } from '../engine/events'
import type { HoleResult } from '../engine/types'
import { cupStandings, eventStandings, type EventScoreRow } from './cup'

/** a posted round — only the fields the math reads carry real values */
function row(eventKey: string, day: number, playerId: string, toPar: number): EventScoreRow {
  return {
    event_key: eventKey,
    day,
    player_id: playerId,
    player_name: playerId.toUpperCase(),
    to_par: toPar,
    strokes: 72 + toPar,
    results: [] as HoleResult[],
  }
}

/** four days for one player in one call: nulls skip that day */
function week(eventKey: string, playerId: string, days: (number | null)[]): EventScoreRow[] {
  return days.flatMap((toPar, i) => (toPar === null ? [] : [row(eventKey, i + 1, playerId, toPar)]))
}

// a real points-paying week and the exhibition flagship, straight off the calendar
const PAYS = 'pinehurst-no2-2026'
const EXHIBITION = 'the-dogleg-2026'
const MAJOR = 'augusta-national-2027'

describe('eventStandings — best three of four, no cuts', () => {
  it('drops the worst of four; three posted rounds are a full card', () => {
    const board = eventStandings([
      ...week(PAYS, 'ann', [-2, -1, +5, -3]), // best three: -6
      ...week(PAYS, 'bob', [-2, -2, null, -2]), // exactly three: -6
    ])
    const ann = board.find((s) => s.playerId === 'ann')!
    expect(ann.counted).toEqual([-3, -2, -1])
    expect(ann.total).toBe(-6)
    expect(ann.eligible).toBe(true)
    const bob = board.find((s) => s.playerId === 'bob')!
    expect(bob.total).toBe(-6)
    // equal totals, but ann's -3 best round beats bob's -2 — the tie-break
    // trickles down the counted card, exactly the locked rule
    expect(ann.rank).toBe(1)
    expect(bob.rank).toBe(2)
  })

  it('ties break by best single round, then second, then third — never by post time', () => {
    const board = eventStandings([
      ...week(PAYS, 'ace', [-5, 0, -1, null]), // -6, best round -5
      ...week(PAYS, 'bud', [-3, -2, -1, null]), // -6, best round -3
    ])
    expect(board[0].playerId).toBe('ace')
    expect(board[0].rank).toBe(1)
    expect(board[1].rank).toBe(2)
  })

  it('a shared rank eats the next one — two 2nds, then 4th', () => {
    const board = eventStandings([
      ...week(PAYS, 'win', [-4, -4, -4, null]),
      ...week(PAYS, 'tie1', [-2, -2, -2, null]),
      ...week(PAYS, 'tie2', [-2, -2, -2, null]),
      ...week(PAYS, 'next', [-1, -1, -1, null]),
    ])
    const ranks = new Map(board.map((s) => [s.playerId, s.rank]))
    expect(ranks.get('win')).toBe(1)
    expect(ranks.get('tie1')).toBe(2)
    expect(ranks.get('tie2')).toBe(2)
    expect(ranks.get('next')).toBe(4)
  })

  it('fewer than three rounds is not eligible: no total, no rank, listed after the field', () => {
    const board = eventStandings([
      ...week(PAYS, 'full', [+1, +2, +3, null]),
      ...week(PAYS, 'two', [-9, -9, null, null]), // torrid pace, still 2 of 3
    ])
    const two = board.find((s) => s.playerId === 'two')!
    expect(two.eligible).toBe(false)
    expect(two.total).toBeNull()
    expect(two.rank).toBeUndefined()
    expect(two.played).toBe(2)
    // the eligible card outranks the hotter partial — three rounds is the bar
    expect(board[0].playerId).toBe('full')
  })
})

describe('cupStandings — the season points race', () => {
  it('pays the published points at a points event and nothing at an exhibition', () => {
    const rows = [
      ...week(PAYS, 'ann', [-3, -3, -3, null]), // wins the paying week
      ...week(PAYS, 'bob', [0, 0, 0, null]),
      ...week(EXHIBITION, 'bob', [-9, -9, -9, null]), // dominates the exhibition
    ]
    const standings = cupStandings(rows)
    const ann = standings.find((s) => s.playerId === 'ann')!
    const bob = standings.find((s) => s.playerId === 'bob')!
    expect(ann.points).toBe(cupPoints(1))
    expect(ann.wins).toBe(1)
    // the exhibition win moved nothing — bob only scores his 2nd at Pinehurst
    expect(bob.points).toBe(cupPoints(2))
    expect(standings[0].playerId).toBe('ann')
  })

  it('a major pays its multiplier', () => {
    const standings = cupStandings(week(MAJOR, 'ann', [0, 0, 0, null]))
    expect(standings[0].points).toBe(cupPoints(1, true))
    expect(cupPoints(1, true)).toBe(600)
  })

  it('an ineligible week scores zero — the floor of 5 is for finishers', () => {
    const standings = cupStandings(week(PAYS, 'ann', [-9, -9, null, null]))
    expect(standings).toHaveLength(0)
  })

  it('unknown event keys contribute nothing rather than throwing', () => {
    expect(cupStandings(week('not-a-real-event', 'ann', [0, 0, 0, 0]))).toHaveLength(0)
  })
})

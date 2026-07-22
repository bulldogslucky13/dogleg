// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { seasonForDate } from '../engine/season'
import { ackSeason, needsSeasonSplash, pastSeasons, podium, roundsInSeason } from './seasonStore'
import type { LoggedRound } from './stats'

beforeEach(() => {
  localStorage.clear()
})

describe('the season splash shows once per rollover', () => {
  it('needs the splash until acked, then not again until the season turns', () => {
    const july = new Date('2026-07-21T12:00:00Z')
    expect(needsSeasonSplash(july)).toBe(true)
    ackSeason(july)
    expect(needsSeasonSplash(july)).toBe(false)
    // …the calendar turns to Fall: the ack is stale, the splash returns once
    const august = new Date('2026-08-05T12:00:00Z')
    expect(needsSeasonSplash(august)).toBe(true)
    ackSeason(august)
    expect(needsSeasonSplash(august)).toBe(false)
  })
})

describe('past seasons and the podium', () => {
  it('enumerates only seasons since launch, oldest first', () => {
    // during Summer 2026 (the launch season) there is no past season at all
    expect(pastSeasons(seasonForDate(new Date('2026-07-21T12:00:00Z')))).toHaveLength(0)
    // a year later: summer26, fall26, off26, spring27 — never before launch
    const keys = pastSeasons(seasonForDate(new Date('2027-06-15T12:00:00Z'))).map((s) => s.key)
    expect(keys).toEqual(['2026-q2-summer', '2026-q3-fall', '2026-q4-off', '2027-q1-spring'])
  })

  it('ranks by records held, best round breaking ties, top three only', () => {
    const row = (playerName: string, courseSlug: string, toPar: number) => ({ playerName, courseSlug, toPar })
    const rows = [
      row('Hank', 'a', -6),
      row('Hank', 'b', -2),
      row('Jackson', 'c', -8),
      row('Jackson', 'd', -1),
      row('Marge', 'e', -9), // one spectacular record loses to two decent ones
      row('Chud Ben 2', 'f', 2),
    ]
    const p = podium(rows)
    expect(p).toHaveLength(3)
    // Jackson and Hank both hold 2 — Jackson's −8 beats Hank's −6 for the tie
    expect(p[0]).toEqual({ playerName: 'Jackson', records: 2, place: 1 })
    expect(p[1]).toEqual({ playerName: 'Hank', records: 2, place: 2 })
    expect(p[2]).toEqual({ playerName: 'Marge', records: 1, place: 3 })
  })
})

describe('rounds are assigned to seasons by when they were played', () => {
  it('filters the log by the season window', () => {
    const summer = seasonForDate(new Date('2026-07-21T12:00:00Z'))
    const mk = (playedAt: number): LoggedRound => ({
      seed: `s${playedAt}`,
      mode: 'practice',
      courseSlug: 'pebble-beach',
      dateKey: '2026-07-20',
      playedAt,
      toPar: 0,
      strokes: 71,
      results: Array(18).fill('par'),
    })
    const log = [mk(summer.startsAt - 1), mk(summer.startsAt), mk(summer.endsAt - 1), mk(summer.endsAt)]
    const inSummer = roundsInSeason(summer, log)
    expect(inSummer.map((r) => r.playedAt)).toEqual([summer.startsAt, summer.endsAt - 1])
  })
})

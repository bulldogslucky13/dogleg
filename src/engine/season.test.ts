import { describe, expect, it } from 'vitest'
import { etMidnightUtc, previousSeason, seasonCountdown, seasonEndLabel, seasonForDate } from './season'

/** an instant N ms after 00:00 ET on the 1st of a month */
const etFirst = (year: number, month: number, offsetMs = 0) => new Date(etMidnightUtc(year, month) + offsetMs)

describe('the season calendar rolls over at 00:00 Eastern on the 1st', () => {
  it('maps every month to its season, January to the PRIOR year Off Season', () => {
    expect(seasonForDate(new Date('2026-07-21T12:00:00Z')).key).toBe('2026-q2-summer')
    expect(seasonForDate(new Date('2026-02-15T12:00:00Z')).key).toBe('2026-q1-spring')
    expect(seasonForDate(new Date('2026-09-01T12:00:00Z')).key).toBe('2026-q3-fall')
    expect(seasonForDate(new Date('2026-12-25T12:00:00Z')).key).toBe('2026-q4-off')
    // January 2027 belongs to Off Season 2026 — the season that started in Nov
    const jan = seasonForDate(new Date('2027-01-15T12:00:00Z'))
    expect(jan.key).toBe('2026-q4-off')
    expect(jan.label).toBe('Off Season 2026')
    expect(jan.year).toBe(2026)
  })

  it('flips exactly at the ET midnight boundary, not UTC midnight', () => {
    // one millisecond before Aug 1 00:00 ET is still Summer; on the dot is Fall
    expect(seasonForDate(etFirst(2026, 7, -1)).slug).toBe('summer')
    expect(seasonForDate(etFirst(2026, 7)).slug).toBe('fall')
    // UTC midnight Aug 1 is still July 31 in ET — must still be Summer
    expect(seasonForDate(new Date('2026-08-01T00:00:00Z')).slug).toBe('summer')
  })

  it('handles both DST regimes: Feb 1 is EST (UTC-5), May/Aug/Nov 1 are EDT (UTC-4)', () => {
    expect(etMidnightUtc(2026, 1)).toBe(Date.UTC(2026, 1, 1, 5)) // Feb — EST
    expect(etMidnightUtc(2026, 4)).toBe(Date.UTC(2026, 4, 1, 4)) // May — EDT
    expect(etMidnightUtc(2026, 7)).toBe(Date.UTC(2026, 7, 1, 4)) // Aug — EDT
    expect(etMidnightUtc(2026, 10)).toBe(Date.UTC(2026, 10, 1, 4)) // Nov 1 — still EDT (falls back Nov 8)
  })

  it('a season knows when it ends, its predecessor, and its countdown', () => {
    const summer = seasonForDate(new Date('2026-07-21T12:00:00Z'))
    expect(summer.endsAt).toBe(etMidnightUtc(2026, 7))
    expect(seasonEndLabel(summer)).toBe('July 31')
    expect(previousSeason(summer).key).toBe('2026-q1-spring')
    // off season wraps the year going backward too
    expect(previousSeason(seasonForDate(new Date('2027-02-10T12:00:00Z'))).key).toBe('2026-q4-off')

    expect(seasonCountdown(summer, summer.endsAt - 10 * 86_400_000)).toBe('10 days')
    expect(seasonCountdown(summer, summer.endsAt - 30 * 3_600_000)).toBe('30 hours')
    expect(seasonCountdown(summer, summer.endsAt - 45 * 60_000)).toBe('45 minutes')
  })
})

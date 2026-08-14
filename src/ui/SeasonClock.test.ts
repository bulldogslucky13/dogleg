import { describe, expect, it } from 'vitest'
import { countdownParts } from './SeasonClock'

const DAY = 86_400_000

describe('countdownParts', () => {
  it('splits the remainder into days and padded h:m:s', () => {
    const now = 1_000_000_000_000
    const ends = now + 84 * DAY + 7 * 3_600_000 + 5 * 60_000 + 3_000
    expect(countdownParts(ends, now)).toEqual({ days: 84, hrs: '07', min: '05', sec: '03' })
  })

  it('the horn never counts backwards', () => {
    expect(countdownParts(1000, 5000)).toEqual({ days: 0, hrs: '00', min: '00', sec: '00' })
  })

  it('the last minute reads 0 days 00:00:59, not a dangling 59', () => {
    const now = 1_000_000_000_000
    expect(countdownParts(now + 59_000, now)).toEqual({ days: 0, hrs: '00', min: '00', sec: '59' })
  })
})

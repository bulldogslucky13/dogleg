import { describe, expect, it } from 'vitest'
import { recordChurn } from './churn'

const DAY = 86_400_000
const NOW = Date.parse('2026-08-09T12:00:00Z')
const rec = (daysAgo: number, mode?: 'daily' | 'practice') => ({
  set_at: new Date(NOW - daysAgo * DAY).toISOString(),
  mode,
})

describe('recordChurn counts the week the wall moved', () => {
  it('counts every fresh row — the table cannot say whose record it was', () => {
    // One row per course is all there is: a course whose record fell three
    // times this week presents one row, and a first claim or a holder
    // lowering their own record presents a fresh row without the record
    // changing hands. Every one of these counts, which is exactly why the
    // copy says "records set in the past week" and never "changed hands".
    // If this ever filters by holder, the line above the course list has to
    // change with it.
    const recs = new Map([
      ['first-claim', rec(2, 'practice')],
      ['same-holder-improved', rec(3, 'daily')],
      ['genuinely-stolen', rec(4, 'daily')],
    ])
    expect(recordChurn(recs, NOW)).toEqual({ total: 3, daily: 2 })
  })

  it('inside the window counts; outside and dateless do not', () => {
    const recs = new Map<string, { set_at?: string; mode?: 'daily' | 'practice' | null }>([
      ['a', rec(1, 'daily')],
      ['b', rec(6, 'practice')],
      ['c', rec(8, 'daily')], // aged out
      ['d', { set_at: undefined, mode: 'practice' }], // pre-column row
    ])
    expect(recordChurn(recs, NOW)).toEqual({ total: 2, daily: 1 })
  })

  it('an unreachable board says nothing; a quiet week says zero', () => {
    expect(recordChurn(null, NOW)).toBeNull()
    expect(recordChurn(new Map(), NOW)).toEqual({ total: 0, daily: 0 })
  })
})

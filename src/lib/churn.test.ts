import { describe, expect, it } from 'vitest'
import { recordChurn } from './churn'

const DAY = 86_400_000
const NOW = Date.parse('2026-08-09T12:00:00Z')
const rec = (daysAgo: number, mode?: 'daily' | 'practice') => ({
  set_at: new Date(NOW - daysAgo * DAY).toISOString(),
  mode,
})

describe('recordChurn counts the week the wall moved', () => {
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

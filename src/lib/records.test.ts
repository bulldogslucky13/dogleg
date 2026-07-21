// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import {
  chasing,
  dismissSteals,
  loadLedger,
  pendingSteals,
  recordWon,
  syncLedger,
  type ServerRecord,
} from './records'

const server = (entries: Array<[string, string, number]>): Map<string, ServerRecord> =>
  new Map(entries.map(([slug, player_name, to_par]) => [slug, { player_name, to_par }]))

beforeEach(() => {
  localStorage.clear()
})

describe('the record ledger notices thefts by diffing against the server', () => {
  it('a held record under a new holder becomes a pending steal', () => {
    recordWon('pebble-beach', -4, 1000)
    syncLedger(server([['pebble-beach', 'Hank', -6]]), 'Jackson', 2000, '2026-07-20')
    const steals = pendingSteals()
    expect(steals).toHaveLength(1)
    expect(steals[0]).toMatchObject({ courseSlug: 'pebble-beach', by: 'Hank', theirToPar: -6, myToPar: -4 })
    expect(loadLedger().held['pebble-beach']).toBeUndefined()
    expect(chasing('pebble-beach')?.by).toBe('Hank')
  })

  it('my own better round is an improvement, not a steal (and name match is case-insensitive)', () => {
    recordWon('pebble-beach', -4, 1000)
    syncLedger(server([['pebble-beach', 'JACKSON', -6]]), 'jackson', 2000, '2026-07-20')
    expect(pendingSteals()).toHaveLength(0)
    expect(loadLedger().held['pebble-beach'].toPar).toBe(-6)
  })

  it('adopts server records bearing my name that this device never saw', () => {
    syncLedger(server([['st-andrews-old', 'Jackson', -3]]), 'Jackson', 2000, '2026-07-20')
    expect(loadLedger().held['st-andrews-old'].toPar).toBe(-3)
    // ...so a later theft of it IS noticed here
    syncLedger(server([['st-andrews-old', 'Hank', -5]]), 'Jackson', 3000, '2026-07-20')
    expect(pendingSteals()).toHaveLength(1)
  })

  it('anonymous devices never sync (no name, no records, no noise)', () => {
    recordWon('pebble-beach', -4, 1000)
    syncLedger(server([['pebble-beach', 'Hank', -6]]), null, 2000, '2026-07-20')
    expect(pendingSteals()).toHaveLength(0)
    expect(loadLedger().held['pebble-beach']).toBeDefined()
  })
})

describe('rate limiting: one notification per course per day', () => {
  it('a dismissed steal stays quiet the same day even if the record moves again', () => {
    recordWon('pebble-beach', -4, 1000)
    syncLedger(server([['pebble-beach', 'Hank', -6]]), 'Jackson', 2000, '2026-07-20')
    dismissSteals('2026-07-20')
    expect(pendingSteals()).toHaveLength(0)
    // the record changes hands AGAIN the same day — data updates, card stays down
    syncLedger(server([['pebble-beach', 'Marge', -7]]), 'Jackson', 3000, '2026-07-20')
    expect(pendingSteals()).toHaveLength(0)
    expect(chasing('pebble-beach')?.by).toBe('Marge')
  })

  it('a fresh change on a NEW day re-surfaces the card once', () => {
    recordWon('pebble-beach', -4, 1000)
    syncLedger(server([['pebble-beach', 'Hank', -6]]), 'Jackson', 2000, '2026-07-20')
    dismissSteals('2026-07-20')
    syncLedger(server([['pebble-beach', 'Marge', -7]]), 'Jackson', 3000, '2026-07-21')
    expect(pendingSteals()).toHaveLength(1)
    expect(pendingSteals()[0].by).toBe('Marge')
  })

  it('an unchanged stolen record does not re-surface after dismissal, any day', () => {
    recordWon('pebble-beach', -4, 1000)
    syncLedger(server([['pebble-beach', 'Hank', -6]]), 'Jackson', 2000, '2026-07-20')
    dismissSteals('2026-07-20')
    syncLedger(server([['pebble-beach', 'Hank', -6]]), 'Jackson', 3000, '2026-07-22')
    expect(pendingSteals()).toHaveLength(0)
  })
})

describe('the reclaim closes the loop', () => {
  it('winning a stolen record back returns the steal entry and clears it', () => {
    recordWon('pebble-beach', -4, 1000)
    syncLedger(server([['pebble-beach', 'Hank', -6]]), 'Jackson', 2000, '2026-07-20')
    const reclaimed = recordWon('pebble-beach', -7, 4000)
    expect(reclaimed?.by).toBe('Hank')
    expect(chasing('pebble-beach')).toBeNull()
    expect(loadLedger().held['pebble-beach'].toPar).toBe(-7)
    expect(pendingSteals()).toHaveLength(0)
  })

  it('winning a record that was never stolen is not a reclaim', () => {
    expect(recordWon('st-andrews-old', -2, 1000)).toBeNull()
  })
})

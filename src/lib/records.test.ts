// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import {
  chasing,
  chasingSeason,
  defaultChaseBoard,
  dismissSteals,
  loadLedger,
  pendingSteals,
  recordWon,
  seasonRecordWon,
  syncLedger,
  syncSeasonLedger,
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

  it('a stolen record reclaimed under my name on another device clears the steal', () => {
    recordWon('pebble-beach', -4, 1000)
    syncLedger(server([['pebble-beach', 'Hank', -6]]), 'Jackson', 2000, '2026-07-20')
    expect(chasing('pebble-beach')?.by).toBe('Hank')
    // the win posts elsewhere; this device only sees the server flip back to us
    syncLedger(server([['pebble-beach', 'Jackson', -7]]), 'Jackson', 3000, '2026-07-20')
    expect(chasing('pebble-beach')).toBeNull()
    expect(pendingSteals()).toHaveLength(0)
    expect(loadLedger().held['pebble-beach'].toPar).toBe(-7)
  })
})

describe('the season shelf runs the same rivalry, scoped to one season', () => {
  const SUMMER = '2026-q2-summer'
  const FALL = '2026-q3-fall'

  it('a held season record under a new holder becomes a season-scoped steal', () => {
    seasonRecordWon('pebble-beach', -3, SUMMER, 1000)
    syncSeasonLedger(server([['pebble-beach', 'Hank', -5]]), SUMMER, 'Jackson', 2000, '2026-07-20')
    const steals = pendingSteals(loadLedger(), SUMMER)
    expect(steals).toHaveLength(1)
    expect(steals[0]).toMatchObject({ courseSlug: 'pebble-beach', scope: 'season', by: 'Hank' })
    expect(chasingSeason('pebble-beach', SUMMER)?.by).toBe('Hank')
    // the all-time chase is untouched — the ghost keys on it
    expect(chasing('pebble-beach')).toBeNull()
  })

  it('ROLLOVER IS NOT THEFT: held and stolen entries from a past season drop silently', () => {
    seasonRecordWon('pebble-beach', -3, SUMMER, 1000)
    seasonRecordWon('st-andrews-old', -2, SUMMER, 1000)
    syncSeasonLedger(server([['st-andrews-old', 'Hank', -6]]), SUMMER, 'Jackson', 2000, '2026-07-20')
    expect(pendingSteals(loadLedger(), SUMMER)).toHaveLength(1)
    // the summer steal is already invisible from the new season's vantage,
    // BEFORE any sync runs — the offline/failed-fetch case
    expect(pendingSteals(loadLedger(), FALL)).toHaveLength(0)
    // the horn blows; the new season's board opens with a different holder
    syncSeasonLedger(server([['pebble-beach', 'Marge', -4]]), FALL, 'Jackson', 3000, '2026-08-01')
    expect(pendingSteals(loadLedger(), FALL)).toHaveLength(0)
    expect(loadLedger().heldSeason['pebble-beach']).toBeUndefined()
    expect(chasingSeason('st-andrews-old', FALL)).toBeNull()
  })

  it('reclaiming a season record returns the steal only within the same season', () => {
    seasonRecordWon('pebble-beach', -3, SUMMER, 1000)
    syncSeasonLedger(server([['pebble-beach', 'Hank', -5]]), SUMMER, 'Jackson', 2000, '2026-07-20')
    const reclaimed = seasonRecordWon('pebble-beach', -6, SUMMER, 3000)
    expect(reclaimed?.by).toBe('Hank')
    expect(chasingSeason('pebble-beach', SUMMER)).toBeNull()
  })

  it('a stale steal from last season is never a reclaim in the new one', () => {
    seasonRecordWon('pebble-beach', -3, SUMMER, 1000)
    syncSeasonLedger(server([['pebble-beach', 'Hank', -5]]), SUMMER, 'Jackson', 2000, '2026-07-20')
    // no sync ran after rollover; the win itself is the first season event
    expect(seasonRecordWon('pebble-beach', -4, FALL, 3000)).toBeNull()
  })

  it('one round taking both boards from me is ONE steal event, scope both', () => {
    recordWon('pebble-beach', -4, 1000)
    seasonRecordWon('pebble-beach', -4, SUMMER, 1000)
    syncLedger(server([['pebble-beach', 'Hank', -6]]), 'Jackson', 2000, '2026-07-20')
    syncSeasonLedger(server([['pebble-beach', 'Hank', -6]]), SUMMER, 'Jackson', 2000, '2026-07-20')
    const steals = pendingSteals(loadLedger(), SUMMER)
    expect(steals).toHaveLength(1)
    expect(steals[0].scope).toBe('both')
  })

  it('different thieves on the two boards stay two distinct events', () => {
    recordWon('pebble-beach', -8, 1000)
    seasonRecordWon('pebble-beach', -3, SUMMER, 1000)
    // Hank beats the season score but not the legend round
    syncSeasonLedger(server([['pebble-beach', 'Hank', -5]]), SUMMER, 'Jackson', 2000, '2026-07-20')
    syncLedger(server([['pebble-beach', 'Jackson', -8]]), 'Jackson', 2000, '2026-07-20')
    const steals = pendingSteals(loadLedger(), SUMMER)
    expect(steals).toHaveLength(1)
    expect(steals[0].scope).toBe('season')
    expect(chasing('pebble-beach')).toBeNull()
  })

  it('dismissal covers both shelves in one gesture', () => {
    recordWon('pebble-beach', -4, 1000)
    seasonRecordWon('st-andrews-old', -2, SUMMER, 1000)
    syncLedger(server([['pebble-beach', 'Hank', -6]]), 'Jackson', 2000, '2026-07-20')
    syncSeasonLedger(server([['st-andrews-old', 'Marge', -4]]), SUMMER, 'Jackson', 2000, '2026-07-20')
    expect(pendingSteals(loadLedger(), SUMMER)).toHaveLength(2)
    dismissSteals('2026-07-20')
    expect(pendingSteals(loadLedger(), SUMMER)).toHaveLength(0)
  })

  it('the default ghost board races what is being won back', () => {
    // season stolen, all-time not → the season record is the target
    seasonRecordWon('pebble-beach', -3, SUMMER, 1000)
    syncSeasonLedger(server([['pebble-beach', 'Hank', -5]]), SUMMER, 'Jackson', 2000, '2026-07-20')
    expect(defaultChaseBoard('pebble-beach', SUMMER)).toBe('season')
    // nothing stolen → all-time, the status quo
    expect(defaultChaseBoard('st-andrews-old', SUMMER)).toBe('alltime')
    // both stolen → all-time outranks (beating it takes the season back too)
    recordWon('pebble-beach', -4, 3000)
    syncLedger(server([['pebble-beach', 'Hank', -5]]), 'Jackson', 4000, '2026-07-20')
    expect(defaultChaseBoard('pebble-beach', SUMMER)).toBe('alltime')
  })

  it('ROLLOVER NEVER FLASHES: a past-season steal is filtered at read, not just at sync', () => {
    // pendingSteals() is read synchronously at mount, before any fetch. The
    // sync that expires a stale entry needs a network round trip, a clubhouse
    // name and a live server — offline or signed out it never runs. So the
    // read itself has to refuse last season's thefts, or a rollover greets
    // the player with a wave of steals on every open, forever.
    seasonRecordWon('pebble-beach', -3, SUMMER, 1000)
    syncSeasonLedger(server([['pebble-beach', 'Hank', -5]]), SUMMER, 'Jackson', 2000, '2026-07-20')
    expect(pendingSteals(loadLedger(), SUMMER)).toHaveLength(1)
    // no sync has run in the new season, and the entry is still on the shelf
    expect(loadLedger().stolenSeason['pebble-beach']).toBeDefined()
    expect(pendingSteals(loadLedger(), FALL)).toHaveLength(0)
  })

  it('an all-time steal still shows after a rollover — it has no season to expire', () => {
    recordWon('pebble-beach', -4, 1000)
    syncLedger(server([['pebble-beach', 'Hank', -6]]), 'Jackson', 2000, '2026-07-20')
    expect(pendingSteals(loadLedger(), FALL)).toHaveLength(1)
    expect(pendingSteals(loadLedger(), '2027-q1-winter')).toHaveLength(1)
  })

  it('a v1 ledger (pre-season devices) loads with empty season shelves intact', () => {
    localStorage.setItem(
      'dogleg:records:v1',
      JSON.stringify({ v: 1, held: { 'pebble-beach': { toPar: -4, since: 1000 } }, stolen: {} }),
    )
    const ledger = loadLedger()
    expect(ledger.v).toBe(2)
    expect(ledger.held['pebble-beach'].toPar).toBe(-4)
    expect(ledger.heldSeason).toEqual({})
    // and the old data still notices thefts
    syncLedger(server([['pebble-beach', 'Hank', -6]]), 'Jackson', 2000, '2026-07-20')
    expect(pendingSteals()).toHaveLength(1)
  })
})

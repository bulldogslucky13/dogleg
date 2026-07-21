import { describe, expect, it } from 'vitest'
import { clubhouseLine, groupChoices, type TallyRow } from './decisionStats'

/** Build aggregate tally rows for one (hole, stage), one row per choice that
 * has any names, splitting a name list across a leading "capped" row (up to 5
 * names, matching the server's per-choice name cap) and an overflow row that
 * carries the remaining count with no names — mirroring what the aggregate
 * table can actually contain once a choice passes 5 players. */
function rows(hole: number, stage: TallyRow['stage'], counts: Partial<Record<TallyRow['choice'], string[]>>): TallyRow[] {
  const out: TallyRow[] = []
  for (const choice of ['safe', 'normal', 'aggressive'] as const) {
    const names = counts[choice] ?? []
    if (names.length === 0) continue
    const capped = names.slice(0, 5)
    const overflow = names.length - capped.length
    out.push({ hole, stage, choice, count: capped.length, names: capped })
    if (overflow > 0) out.push({ hole, stage, choice, count: overflow, names: [] })
  }
  return out
}

const names = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}${i + 1}`)

describe('groupChoices', () => {
  it('tallies only the rows matching the given hole and stage', () => {
    const all: TallyRow[] = [
      ...rows(3, 'tee', { safe: ['Ann'] }),
      ...rows(3, 'putt', { aggressive: ['Bob'] }), // same hole, other stage
      ...rows(4, 'tee', { aggressive: ['Cara'] }), // other hole, same stage
    ]
    const grouped = groupChoices(all, 3, 'tee')
    expect(grouped.total).toBe(1)
    expect(grouped.byChoice.safe.count).toBe(1)
    expect(grouped.byChoice.safe.names).toEqual(['Ann'])
    expect(grouped.byChoice.aggressive.count).toBe(0)
  })

  it('n === 0 when nothing was recorded for that hole+stage', () => {
    const grouped = groupChoices([], 1, 'tee')
    expect(grouped.total).toBe(0)
  })

  it('sums multiple rows for the same choice and concatenates names', () => {
    const all: TallyRow[] = [
      { hole: 1, stage: 'tee', choice: 'safe', count: 3, names: ['A1', 'A2', 'A3'] },
      { hole: 1, stage: 'tee', choice: 'safe', count: 2, names: [] }, // overflow row, no names
      { hole: 1, stage: 'tee', choice: 'aggressive', count: 1, names: ['B1'] },
    ]
    const grouped = groupChoices(all, 1, 'tee')
    expect(grouped.total).toBe(6)
    expect(grouped.byChoice.safe.count).toBe(5)
    expect(grouped.byChoice.safe.names).toEqual(['A1', 'A2', 'A3'])
    expect(grouped.byChoice.aggressive.count).toBe(1)
  })
})

describe('clubhouseLine thresholds', () => {
  it('n === 0 → null', () => {
    expect(clubhouseLine(groupChoices([], 1, 'tee'), 'tee')).toBeNull()
  })

  it('n === 1 → single named line, no "others"', () => {
    const grouped = groupChoices(rows(1, 'tee', { aggressive: ['HackerMcDuff'] }), 1, 'tee')
    expect(clubhouseLine(grouped, 'tee')).toBe('HackerMcDuff went for it.')
  })

  it('n === 4 (< 5) → named counts with "and N others"', () => {
    const grouped = groupChoices(rows(1, 'tee', { safe: names('Ann', 3), aggressive: ['Dot'] }), 1, 'tee')
    expect(clubhouseLine(grouped, 'tee')).toBe('Ann1 and 2 others laid up.')
  })

  it('boundary: n === 4 stays in the named tier', () => {
    const grouped = groupChoices(rows(1, 'tee', { safe: names('P', 4) }), 1, 'tee')
    const line = clubhouseLine(grouped, 'tee')!
    expect(line).toMatch(/^P1 and 3 others /)
    expect(line).not.toMatch(/of 4|%/)
  })

  it('boundary: n === 5 switches to plain counts', () => {
    const grouped = groupChoices(rows(1, 'tee', { safe: names('P', 3), aggressive: names('Q', 2) }), 1, 'tee')
    expect(clubhouseLine(grouped, 'tee')).toBe('3 of 5 laid up.')
  })

  it('n === 29 (< 30) → plain counts, not percentages', () => {
    const grouped = groupChoices(rows(1, 'tee', { safe: names('P', 20), aggressive: names('Q', 9) }), 1, 'tee')
    expect(clubhouseLine(grouped, 'tee')).toBe('20 of 29 laid up.')
  })

  it('boundary: n === 30 switches to percentages', () => {
    const grouped = groupChoices(rows(1, 'tee', { safe: names('P', 21), aggressive: names('Q', 9) }), 1, 'tee')
    expect(clubhouseLine(grouped, 'tee')).toBe('70% laid up.')
  })

  it('leads with the majority choice regardless of which choice it is', () => {
    const grouped = groupChoices(rows(1, 'tee', { safe: names('P', 4), aggressive: names('Q', 26) }), 1, 'tee')
    expect(clubhouseLine(grouped, 'tee')).toBe('87% went for it.')
  })

  it('putt stage uses putt-specific verbs (charged/lagged), not the tee/second idiom', () => {
    const charged = groupChoices(rows(2, 'putt', { aggressive: names('P', 10), safe: names('Q', 2) }), 2, 'putt')
    expect(clubhouseLine(charged, 'putt')).toBe('10 of 12 charged it.')
    const lagged = groupChoices(rows(2, 'putt', { safe: names('P', 1) }), 2, 'putt')
    expect(clubhouseLine(lagged, 'putt')).toBe('P1 lagged it.')
  })

  it('never mentions dice, RNG, or odds in any tier', () => {
    const forbidden = /dice|rng|odds|random|probability/i
    const cases = [
      groupChoices(rows(1, 'tee', { aggressive: ['A'] }), 1, 'tee'),
      groupChoices(rows(1, 'tee', { safe: names('P', 3), aggressive: ['A'] }), 1, 'tee'),
      groupChoices(rows(1, 'tee', { safe: names('P', 3), aggressive: names('Q', 2) }), 1, 'tee'),
      groupChoices(rows(1, 'tee', { safe: names('P', 21), aggressive: names('Q', 9) }), 1, 'tee'),
    ]
    for (const grouped of cases) {
      const line = clubhouseLine(grouped, 'tee')
      expect(line).not.toBeNull()
      expect(line!).not.toMatch(forbidden)
    }
  })
})

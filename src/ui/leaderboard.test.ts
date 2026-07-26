import { describe, expect, it } from 'vitest'
import { denseRanks } from './Leaderboard'

// The board itself never renders in tests (backendEnabled is false in CI by
// design), so the tie-ranking rule is pinned here as a pure function.
describe('denseRanks — scoreboard ties, dense numbering', () => {
  it("awards ties and steps by one per distinct score (Jackson's example)", () => {
    // Declan -3, Jack Bow -3, Jackson -1, Esfo -1, Chud Ben -1, GY3 +1
    const board = [-3, -3, -1, -1, -1, 1].map((to_par) => ({ to_par }))
    expect(denseRanks(board)).toEqual([1, 1, 2, 2, 2, 3])
  })

  it('handles no ties, all ties, and the empty board', () => {
    expect(denseRanks([-2, 0, 3].map((to_par) => ({ to_par })))).toEqual([1, 2, 3])
    expect(denseRanks([1, 1, 1].map((to_par) => ({ to_par })))).toEqual([1, 1, 1])
    expect(denseRanks([])).toEqual([])
  })
})

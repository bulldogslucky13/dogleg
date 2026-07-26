import { describe, expect, it } from 'vitest'
import { competitionRanks } from './Leaderboard'

// The board itself never renders in tests (backendEnabled is false in CI by
// design), so the tie-ranking rule is pinned here as a pure function.
//
// This was dense numbering (1,1,2,2,2,3) when the board first went broadcast.
// It moved to competition numbering because the referee ranks a submission as
// "players strictly better than you, plus one" (submit-round/index.ts), and the
// wrap screen prints that number directly above this board — dense numbering
// told a player behind a two-way tie "You're 3rd" over a row labelled 2. The
// referee wins: it is the only side that can rank a player who falls outside
// the fetched board. Keep these two conventions in step.
describe('competitionRanks — scoreboard ties, places skipped', () => {
  it('awards ties and skips the places a tie consumed', () => {
    // Declan -3, Jack Bow -3, Jackson -1, Esfo -1, Chud Ben -1, GY3 +1
    const board = [-3, -3, -1, -1, -1, 1].map((to_par) => ({ to_par }))
    expect(competitionRanks(board)).toEqual([1, 1, 3, 3, 3, 6])
  })

  it('agrees with the referee: rank == players strictly better, plus one', () => {
    const board = [-3, -3, -1, -1, -1, 1].map((to_par) => ({ to_par }))
    const ranks = competitionRanks(board)
    board.forEach((row, i) => {
      const better = board.filter((other) => other.to_par < row.to_par).length
      expect(ranks[i]).toBe(better + 1)
    })
  })

  it('handles no ties, all ties, and the empty board', () => {
    expect(competitionRanks([-2, 0, 3].map((to_par) => ({ to_par })))).toEqual([1, 2, 3])
    expect(competitionRanks([1, 1, 1].map((to_par) => ({ to_par })))).toEqual([1, 1, 1])
    expect(competitionRanks([])).toEqual([])
  })

  it('leaves the podium with a gap when a tie eats a medal', () => {
    // two golds, then bronze — no silver. medal-N is driven by rank, so this is
    // the class the third row gets.
    expect(competitionRanks([-3, -3, -1].map((to_par) => ({ to_par })))).toEqual([1, 1, 3])
    // a three-way tie for first pushes the next player clear off the podium
    expect(competitionRanks([-3, -3, -3, -1].map((to_par) => ({ to_par })))).toEqual([1, 1, 1, 4])
  })
})

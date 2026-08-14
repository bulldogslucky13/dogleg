import { describe, expect, it } from 'vitest'
import { competitionRanks, provisionalRank } from './Leaderboard'

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

// The provisional rank an UNNAMED player is shown before they claim a name.
// It exists because the daily wrap used to make the same flat request of a
// player who had just shot the best round of the day and one who had shot
// +12 — and the practice branch, which does say what the round was worth,
// is the one that converts.
//
// The number has to obey the referee's rule ("strictly better, plus one"),
// because it is the same number the player sees again the moment their card
// posts. Off-by-one here and the game contradicts itself in the space of one
// tap.
describe('provisionalRank — what an unclaimed round would be worth', () => {
  const board = [-3, -3, -1, -1, 1].map((to_par) => ({ to_par }))

  it('agrees with competitionRanks for a score already on the board', () => {
    const ranks = competitionRanks(board)
    board.forEach((row, i) => {
      expect(provisionalRank(board, row.to_par)).toBe(ranks[i])
    })
  })

  it('ties take the place, they do not lose it', () => {
    // matching the leaders is 1st, not 3rd — the tie shares the rank
    expect(provisionalRank(board, -3)).toBe(1)
    // matching the -1 pack sits behind the two -3s only
    expect(provisionalRank(board, -1)).toBe(3)
  })

  it('beating the field outright leads, and a bad round sits last', () => {
    expect(provisionalRank(board, -4)).toBe(1)
    expect(provisionalRank(board, 12)).toBe(6)
  })

  it('is 1st on an empty board — the first card posted leads it', () => {
    expect(provisionalRank([], 4)).toBe(1)
  })
})

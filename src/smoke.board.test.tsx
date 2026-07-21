// @vitest-environment jsdom
/**
 * SMOKE TEST (board fallback) — the daily result view must still show the
 * standings when today's card is re-opened after the full round has left
 * memory. The rest of the suite runs with the backend disabled (so CI never
 * touches the network), which means DailyBoardView renders nothing there and
 * can't prove the fallback is wired. This file mocks an *enabled* backend with
 * a stubbed fetch — no real network — so the board actually renders and the
 * assertion fails if ResultScreen stops falling back to DailyBoardView.
 */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

// flip the leaderboard on for this file only, keeping every other backend
// export real (leaderboard.ts reads SUPABASE_URL etc. from here)
vi.mock('./lib/backend', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./lib/backend')>()),
  backendEnabled: true,
}))
// stub the board fetch so the enabled path returns rows without a network call
vi.mock('./lib/leaderboard', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./lib/leaderboard')>()),
  fetchDailyBoard: vi.fn(async () => [
    { player_name: 'Board Tester', character: null, to_par: -2, strokes: 68 },
  ]),
}))

import { dailySetup } from './engine/daily'
import type { HoleResult } from './engine/types'
import { ResultScreen } from './ui/screens'

afterEach(cleanup)

describe('smoke: the daily card falls back to a read-only board', () => {
  it('renders today\'s standings when the full round is gone (boardRound null)', async () => {
    render(
      <ResultScreen
        setup={dailySetup()}
        results={Array<HoleResult>(18).fill('par')}
        toPar={0}
        practice={false}
        recap={null}
        grade={null}
        // the exact state this fix targets: today's card re-opened, but the
        // in-memory round that ScoreBoard needs is no longer available
        boardRound={null}
        history={[]}
        onHome={() => {}}
        onPracticeAgain={() => {}}
      />,
    )
    // the fallback DailyBoardView fetched and rendered the standings — remove
    // the wiring in ResultScreen and this row never appears
    expect(await screen.findByText('Board Tester')).toBeTruthy()
    expect(screen.getByText("Today's board")).toBeTruthy()
  })
})

// @vitest-environment jsdom
/**
 * What the daily wrap says to a player who hasn't claimed a clubhouse name.
 *
 * It used to say one thing, flatly, to everyone: "Put a name on your card and
 * join the daily board." The same sentence to a player who had just shot the
 * best round on the board and to one who had shot +12. The practice branch
 * had always done the opposite — it names what the round was worth ("that
 * round beats Rob's course record") — and that is the branch that converts.
 *
 * Over the fortnight to 2026-08-12, 19% of daily rounds finished by players
 * who have still never claimed a name would have placed in the day's top ten.
 * None of them are on a board.
 *
 * These tests pin the tiering, which is the part with a real failure mode:
 * a record outranks a board place, a board place outranks the plain
 * invitation, and a mid-table round gets no oversell — a prompt that cries
 * wolf on a +12 is not believed on the day it matters.
 *
 * ScoreBoard returns null when `backendEnabled` is false, which it is
 * throughout the normal suite, so this is a focused mount with it faked on.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'

vi.mock('../lib/backend', () => ({
  backendEnabled: true,
  SUPABASE_URL: 'https://example.test',
  SUPABASE_ANON_KEY: 'anon',
}))
vi.mock('../lib/analytics', () => ({ track: vi.fn(), identifyPlayer: vi.fn() }))

const { ScoreBoard } = await import('./Leaderboard')
const { newRound, applyChoice, advanceHole, roundToPar } = await import('../state/store')
const { practiceSetup } = await import('../engine/daily')

/** A genuinely finished round, played through the same store API the UI uses. */
function finishedRound(mode: 'daily' | 'practice') {
  let s = newRound(practiceSetup('pebble-beach', 'claimprompt'), mode, 'dart')
  for (let guard = 0; !s.complete && guard < 500; guard++) {
    if (s.hole?.stage === 'done') {
      s = advanceHole(s)
      continue
    }
    s = applyChoice(s, 'normal')
  }
  return s
}

/** Stub the board fetch with rows placed relative to the round's own score. */
function stubBoard(rows: number[]) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: RequestInfo | URL) => {
      const href = String(url)
      if (href.includes('daily_scores')) {
        return new Response(JSON.stringify(rows.map((to_par) => ({ player_name: 'Rob', character: null, to_par, strokes: 72 }))), { status: 200 })
      }
      // course_records — no standing record, so the record tier never fires
      return new Response(JSON.stringify([]), { status: 200 })
    }),
  )
}

describe('the daily wrap, to a player with no clubhouse name', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('tells them where the round would actually sit', async () => {
    const round = finishedRound('daily')
    const mine = roundToPar(round)
    // two rounds better than theirs, one worse → they'd be 3rd
    stubBoard([mine - 2, mine - 1, mine + 4])
    render(<ScoreBoard round={round} />)
    await waitFor(() => expect(screen.getByText(/would sit 3rd on today's board/i)).toBeTruthy())
  })

  it('says so when the round would lead the day', async () => {
    const round = finishedRound('daily')
    const mine = roundToPar(round)
    stubBoard([mine + 1, mine + 5])
    render(<ScoreBoard round={round} />)
    await waitFor(() => expect(screen.getByText(/would lead today's board/i)).toBeTruthy())
  })

  it('a tie takes the place rather than losing it', async () => {
    const round = finishedRound('daily')
    const mine = roundToPar(round)
    // one better, then a tie with them → 2nd, not 3rd
    stubBoard([mine - 1, mine])
    render(<ScoreBoard round={round} />)
    await waitFor(() => expect(screen.getByText(/would sit 2nd on today's board/i)).toBeTruthy())
  })

  it('does not oversell a round outside the top ten', async () => {
    const round = finishedRound('daily')
    const mine = roundToPar(round)
    stubBoard(Array.from({ length: 12 }, (_, i) => mine - (i + 1)))
    render(<ScoreBoard round={round} />)
    await waitFor(() => expect(screen.getByText(/join the daily board/i)).toBeTruthy())
    expect(screen.queryByText(/would sit/i)).toBeNull()
  })

  it('offers the empty board to the first player of the day, once', async () => {
    const round = finishedRound('daily')
    stubBoard([])
    render(<ScoreBoard round={round} />)
    await waitFor(() => expect(screen.getByText(/you're top of the board/i)).toBeTruthy())
    // the old "be first" line must not double up underneath it
    expect(screen.queryByText(/Nobody's posted yet — be first/i)).toBeNull()
  })

  it('lets a course record outrank the board place', async () => {
    const round = finishedRound('daily')
    const mine = roundToPar(round)
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: RequestInfo | URL) => {
        const href = String(url)
        if (href.includes('daily_scores')) {
          return new Response(JSON.stringify([{ player_name: 'Rob', character: null, to_par: mine - 1, strokes: 72 }]), { status: 200 })
        }
        // a standing record this round beats — the bigger news of the two
        return new Response(JSON.stringify([{ course_slug: round.courseSlug, player_name: 'Rob', character: null, to_par: mine + 1 }]), { status: 200 })
      }),
    )
    render(<ScoreBoard round={round} />)
    await waitFor(() => expect(screen.getByText(/beats Rob's course record/i)).toBeTruthy())
    // exactly one ask, not two stacked
    expect(screen.queryByText(/would sit/i)).toBeNull()
  })
})

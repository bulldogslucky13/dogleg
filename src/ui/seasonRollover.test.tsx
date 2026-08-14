// @vitest-environment jsdom
/**
 * The season rollover, seen from a home screen nobody touched.
 *
 * The clock ticks in its own subtree, so its interval alone can't move the
 * season the screen was rendered with: left open across a rollover, the old
 * arrangement would sit at 0 days 00:00:00 under the finished season's name,
 * with the season board below it still holding last season's holders and no
 * refetch coming. The screen therefore re-derives the season on its own
 * timer. This test leaves a screen open five seconds short of the horn and
 * asserts both halves come back: the clock's name, and the board's key.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { CourseRecord } from '../lib/leaderboard'

vi.mock('../lib/backend', () => ({
  backendEnabled: true,
  SUPABASE_URL: 'https://example.test',
  SUPABASE_ANON_KEY: 'anon',
}))
vi.mock('../lib/analytics', () => ({ track: vi.fn(), identifyPlayer: vi.fn() }))
vi.mock('../lib/auth', () => ({
  supabase: null,
  currentEmail: vi.fn(async () => null),
  sendMagicLink: vi.fn(async () => ({ ok: true })),
  signOut: vi.fn(async () => {}),
  syncAccount: vi.fn(async () => ({ status: 'signedout' })),
}))
vi.mock('../lib/freshness', () => ({ bundleIsStale: vi.fn(async () => false), FRESH_TTL_MS: 600_000 }))

const fetchSeasonRecords = vi.fn<(k: string) => Promise<Map<string, CourseRecord> | null>>(async () => new Map())
const fetchCourseRecords = vi.fn<() => Promise<Map<string, CourseRecord> | null>>(async () => new Map())

vi.mock('../lib/leaderboard', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/leaderboard')>()
  return { ...actual, fetchSeasonRecords, fetchCourseRecords, fetchMyHistory: vi.fn(async () => null) }
})

const { HomeScreen } = await import('./screens')
const { seasonForDate } = await import('../engine/season')

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverStub)

const mount = () =>
  render(
    <HomeScreen
      history={[]}
      activeRound={null}
      playedToday={null}
      onTeeOff={() => {}}
      onResume={() => {}}
      onPractice={() => {}}
      onCup={() => {}}
      onShowResult={() => {}}
      onHowToPlay={() => {}}
      onMyRounds={() => {}}
      onStats={() => {}}
    />,
  )

describe('a home screen left open through the horn', () => {
  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem('dogleg:tutorial:v1', 'done')
    fetchSeasonRecords.mockClear()
    fetchCourseRecords.mockClear()
    vi.useFakeTimers()
  })
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('swaps in the new season — clock and board both', async () => {
    // five seconds short of the Fall/Off rollover, course list open
    const fall = seasonForDate(new Date(Date.UTC(2026, 9, 15)))
    vi.setSystemTime(fall.endsAt - 5_000)
    mount()
    await act(async () => {})
    fireEvent.click(screen.getByText('Play unlimited'))
    // settle the panel's own fetches BEFORE the horn: a board landing late
    // would re-render the screen for its own reasons and recompute the season
    // as a side effect, which is exactly the accident this test must not pass on
    await act(async () => {})

    expect(screen.getByText(`${fall.name} ends in`)).toBeTruthy()
    expect(fetchSeasonRecords).toHaveBeenCalledWith(fall.key)
    const before = fetchSeasonRecords.mock.calls.length

    await act(async () => {
      await vi.advanceTimersByTimeAsync(7_000)
    })

    const off = seasonForDate(new Date(fall.endsAt + 1_000))
    expect(off.key).not.toBe(fall.key)
    expect(screen.getByText(`${off.name} ends in`)).toBeTruthy()
    // and the board went and got the new season's holders
    expect(fetchSeasonRecords.mock.calls.length).toBeGreaterThan(before)
    expect(fetchSeasonRecords).toHaveBeenCalledWith(off.key)
  })

  it('re-arms without refetching when the season has not turned', async () => {
    vi.setSystemTime(Date.UTC(2026, 8, 15))
    const season = seasonForDate(new Date(Date.UTC(2026, 8, 15)))
    mount()
    await act(async () => {})
    const before = fetchSeasonRecords.mock.calls.length

    // a full day of six-hour re-arms: the clamp fires four times, and none of
    // them may cost a query — season.key never moved
    await act(async () => {
      await vi.advanceTimersByTimeAsync(24 * 3_600_000)
    })

    expect(fetchSeasonRecords.mock.calls.length).toBe(before)
    fireEvent.click(screen.getByText('Play unlimited'))
    expect(screen.getByText(`${season.name} ends in`)).toBeTruthy()
  })
})

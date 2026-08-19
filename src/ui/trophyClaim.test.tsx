// @vitest-environment jsdom
/**
 * The unclaimed-trophy card.
 *
 * The feature exists because of a real number: of the eighteen aces and
 * albatrosses the game had produced by 2026-08-12, five belonged to players
 * with no clubhouse name — filed under nobody, on no board, unrecoverable.
 * The old code had nowhere to fix that, because a name could only be claimed
 * by posting a finished card.
 *
 * These tests cover the two things that make it honest rather than merely
 * persuasive: the card only ever appears for players who are actually
 * anonymous, and a name claimed here lands on the identity the round is
 * ALREADY being played under (never a fresh one), so the dice don't change
 * underneath the player mid-round.
 *
 * `backendEnabled` is false throughout the normal suite so CI never touches
 * the network — hence the focused mount with it faked on.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

vi.mock('../lib/backend', () => ({
  backendEnabled: true,
  SUPABASE_URL: 'https://example.test',
  SUPABASE_ANON_KEY: 'anon',
}))

const track = vi.fn()
const identifyPlayer = vi.fn()
vi.mock('../lib/analytics', () => ({ track, identifyPlayer }))

const { TrophyClaim } = await import('./TrophyClaim')
const { claimClubhouseName, loadIdentity, loadPlayer, savePlayerIdentity } = await import('../lib/leaderboard')

const PLAYER_KEY = 'dogleg:player:v1'
const ANON = { id: 'minted-id-1', secret: 'secret-1', name: null }

// typed with the real fetch signature so the assertions below can read back
// the request body — an argless mock types its calls as [] and tsc rejects it
function fetchOnce(status: number, body: unknown) {
  return vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify(body), { status }))
}

describe('the unclaimed-trophy card', () => {
  beforeEach(() => {
    localStorage.clear()
    track.mockClear()
    identifyPlayer.mockClear()
  })
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('names the moment it is asking about, and says whose it currently is', () => {
    savePlayerIdentity(ANON)
    render(<TrophyClaim kind="ace" holeNumber={14} courseName="Pine Valley" mode="daily" onClose={() => {}} />)
    expect(screen.getByText(/filed under nobody/i)).toBeTruthy()
    expect(screen.getByText(/hole 14 at Pine Valley/i)).toBeTruthy()
  })

  it('claims onto the identity the round is already being played under', async () => {
    savePlayerIdentity(ANON)
    const fetchMock = fetchOnce(200, { player: { id: ANON.id, name: 'Jace' } })
    vi.stubGlobal('fetch', fetchMock)

    render(<TrophyClaim kind="ace" holeNumber={14} courseName="Pine Valley" mode="daily" onClose={() => {}} />)
    fireEvent.change(screen.getByLabelText('Clubhouse name'), { target: { value: 'Jace' } })
    fireEvent.click(screen.getByText('Claim it'))

    await waitFor(() => expect(screen.getByText(/It's yours, Jace/)).toBeTruthy())
    // the id sent up is the minted one — a fresh id here would re-salt the
    // dice of the round the player is holding
    const sent = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))
    expect(sent.playerId).toBe(ANON.id)
    expect(sent.playerSecret).toBe(ANON.secret)
    // ...and the device keeps that same id, now named
    expect(loadPlayer()).toEqual({ id: ANON.id, secret: ANON.secret, name: 'Jace' })
    expect(identifyPlayer).toHaveBeenCalledWith(ANON.id, 'Jace')
    expect(track).toHaveBeenCalledWith('clubhouse_name_claimed', expect.objectContaining({ via: 'trophy' }))
  })

  it('surfaces a taken name instead of pretending it worked', async () => {
    savePlayerIdentity(ANON)
    vi.stubGlobal('fetch', fetchOnce(409, { error: 'that name belongs to a synced player — try another' }))

    render(<TrophyClaim kind="albatross" holeNumber={9} courseName="Copper Canyon" mode="practice" onClose={() => {}} />)
    fireEvent.change(screen.getByLabelText('Clubhouse name'), { target: { value: 'Rob' } })
    fireEvent.click(screen.getByText('Claim it'))

    await waitFor(() => expect(screen.getByText('that name belongs to a synced player — try another')).toBeTruthy())
    expect(loadPlayer()).toBeNull()
    expect(track).not.toHaveBeenCalledWith('clubhouse_name_claimed', expect.anything())
  })

  it('never promises a practice moment a place on the daily board', async () => {
    savePlayerIdentity(ANON)
    vi.stubGlobal('fetch', fetchOnce(200, { player: { id: ANON.id, name: 'Beach' } }))

    render(<TrophyClaim kind="albatross" holeNumber={9} courseName="Erin Hills" mode="practice" onClose={() => {}} />)
    fireEvent.change(screen.getByLabelText('Clubhouse name'), { target: { value: 'Beach' } })
    fireEvent.click(screen.getByText('Claim it'))

    await waitFor(() => expect(screen.getByText(/It's yours, Beach/)).toBeTruthy())
    // a practice round never reaches daily_scores, so "post your card" would
    // be a lie here — it gets the course-records line instead
    expect(screen.getByText(/stay off the daily board/i)).toBeTruthy()
    expect(screen.queryByText(/post your card/i)).toBeNull()
  })

  it('tells a daily player to finish and post, because that one can reach a board', async () => {
    savePlayerIdentity(ANON)
    vi.stubGlobal('fetch', fetchOnce(200, { player: { id: ANON.id, name: 'Jace' } }))

    render(<TrophyClaim kind="ace" holeNumber={14} courseName="Pine Valley" mode="daily" onClose={() => {}} />)
    fireEvent.change(screen.getByLabelText('Clubhouse name'), { target: { value: 'Jace' } })
    fireEvent.click(screen.getByText('Claim it'))

    await waitFor(() => expect(screen.getByText(/post your card/i)).toBeTruthy())
  })

  it('leaves the round alone when dismissed', () => {
    savePlayerIdentity(ANON)
    const onClose = vi.fn()
    render(<TrophyClaim kind="ace" holeNumber={3} courseName="Cobblestone Creek" mode="daily" onClose={onClose} />)
    fireEvent.click(screen.getByText('Not now'))
    expect(onClose).toHaveBeenCalled()
    expect(loadPlayer()).toBeNull()
    expect(loadIdentity()?.id).toBe(ANON.id) // still playing, still the same dice
    expect(track).toHaveBeenCalledWith('trophy_claim_dismissed', expect.anything())
  })

  it('cannot be dismissed out from under a claim that is already in flight', async () => {
    savePlayerIdentity(ANON)
    const onClose = vi.fn()
    // a claim that has left the device but not yet come back — the window the
    // dismissal must not be allowed to race
    let land!: (res: Response) => void
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>((resolve) => (land = resolve))),
    )

    render(<TrophyClaim kind="ace" holeNumber={7} courseName="Pine Valley" mode="daily" onClose={onClose} />)
    fireEvent.change(screen.getByLabelText('Clubhouse name'), { target: { value: 'Jace' } })
    fireEvent.click(screen.getByText('Claim it'))
    await waitFor(() => expect(screen.getByText('Claiming…')).toBeTruthy())

    // the write is one-way, so closing here would name the player permanently
    // without ever showing them it happened — "not now" would be a lie
    const skip = screen.getByText('Not now') as HTMLButtonElement
    expect(skip.disabled).toBe(true)
    fireEvent.click(skip)
    expect(onClose).not.toHaveBeenCalled()
    expect(track).not.toHaveBeenCalledWith('trophy_claim_dismissed', expect.anything())

    land(new Response(JSON.stringify({ player: { id: ANON.id, name: 'Jace' } }), { status: 200 }))
    await waitFor(() => expect(screen.getByText(/It's yours, Jace/)).toBeTruthy())
  })

  it('gives the door back when the claim fails, so a refusal is not a trap', async () => {
    savePlayerIdentity(ANON)
    const onClose = vi.fn()
    vi.stubGlobal('fetch', fetchOnce(409, { error: 'that name belongs to a synced player — try another' }))

    render(<TrophyClaim kind="ace" holeNumber={7} courseName="Pine Valley" mode="daily" onClose={onClose} />)
    fireEvent.change(screen.getByLabelText('Clubhouse name'), { target: { value: 'Jace' } })
    fireEvent.click(screen.getByText('Claim it'))

    await waitFor(() => expect(screen.getByText('that name belongs to a synced player — try another')).toBeTruthy())
    expect((screen.getByText('Not now') as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(screen.getByText('Not now'))
    expect(onClose).toHaveBeenCalled()
    expect(loadPlayer()).toBeNull()
  })
})

describe('claimClubhouseName', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => vi.unstubAllGlobals())

  it('refuses to claim without an identity to claim onto', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const out = await claimClubhouseName('Nobody')
    expect(out.ok).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('is idempotent for an already-named device', async () => {
    savePlayerIdentity({ id: 'a', secret: 'b', name: 'Jackson' })
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const out = await claimClubhouseName('SomethingElse')
    expect(out).toEqual({ ok: true, player: { id: 'a', secret: 'b', name: 'Jackson' } })
    // a claimed name is permanent through this door, as through the other two
    expect(fetchMock).not.toHaveBeenCalled()
    expect(localStorage.getItem(PLAYER_KEY)).toContain('Jackson')
  })

  it('gives the request a deadline, because the card has no exit while it runs', async () => {
    savePlayerIdentity(ANON)
    const fetchMock = fetchOnce(200, { player: { id: ANON.id, name: 'Jace' } })
    vi.stubGlobal('fetch', fetchMock)
    await claimClubhouseName('Jace')
    // TrophyClaim disables "not now" for the duration of this call, so an
    // unbounded one would be a modal with no way out
    const signal = fetchMock.mock.calls[0]?.[1]?.signal
    expect(signal).toBeInstanceOf(AbortSignal)
  })

  it('reports a network failure as retryable rather than claiming it worked', async () => {
    savePlayerIdentity(ANON)
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new DOMException('timed out', 'TimeoutError')
      }),
    )
    const out = await claimClubhouseName('Jace')
    expect(out.ok).toBe(false)
    // the claim may still have landed server-side; retrying is safe because
    // claim-name answers an already-named row with the name that took
    expect(loadPlayer()).toBeNull()
  })
})

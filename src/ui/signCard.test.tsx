// @vitest-environment jsdom
/**
 * The card-signing gate at the tee.
 *
 * Two things are being protected here, and they pull in opposite directions:
 *
 *  1. Anyone who CAN name themselves must, before they tee off. That is the
 *     whole point — an unnamed player returns at 21.5% against ~100% for a
 *     named one, and the name used to require finishing and posting a round.
 *  2. Anyone who CANNOT name themselves must still be able to play. DogLeg
 *     runs with no backend at all, so gating the round on a server round-trip
 *     would turn a game playable on a plane into one that needs signal.
 *
 * The gate lives on the `pick` view rather than on the five call sites that
 * navigate to it, so every entrance (daily, unlimited, rematch, challenge
 * accept) is covered by one check and a sixth entrance cannot route around it.
 * It also means the ask lands strictly after "Tee off" — never stacked on the
 * first-visit tutorial, which is where it would cost us the bounce.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'

vi.mock('../lib/backend', () => ({
  backendEnabled: true,
  SUPABASE_URL: 'https://example.test',
  SUPABASE_ANON_KEY: 'anon',
}))
vi.mock('../lib/analytics', () => ({ track: vi.fn(), identifyPlayer: vi.fn(), initAnalytics: vi.fn() }))

const { default: App } = await import('../App')
const { SignCardScreen } = await import('./SignCard')
const { seasonForDate } = await import('../engine/season')
const { WHATS_NEW_VERSION } = await import('../state/whatsNew')
const { dailySetup } = await import('../engine/daily')
const { track } = await import('../lib/analytics')

const ID = '00000000-1111-2222-3333-444444444444'

/** An anonymous device that HAS a server-minted identity — the gated case. */
function seedAnonymousIdentity() {
  localStorage.setItem('dogleg:player:v1', JSON.stringify({ id: ID, secret: 'sekrit', name: null }))
}

/** Answer claim-name however the test needs; everything else gets an empty list. */
function stubClaim(reply: (name: string) => Response) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: RequestInfo | URL, opts?: RequestInit) => {
      const href = String(url)
      if (href.includes('claim-name')) {
        const body = JSON.parse(String(opts?.body ?? '{}')) as { name: string }
        return reply(body.name)
      }
      return new Response('[]', { status: 200 })
    }),
  )
}

const okReply = (name: string) => new Response(JSON.stringify({ player: { id: ID, name } }), { status: 200 })

describe('Sign your scorecard', () => {
  beforeEach(() => {
    localStorage.clear()
    seedAnonymousIdentity()
  })
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  const mount = (over: Partial<Parameters<typeof SignCardScreen>[0]> = {}) => {
    const props = {
      setup: dailySetup(),
      practice: false,
      onSigned: vi.fn(),
      onPlayUnsigned: vi.fn(),
      onBack: vi.fn(),
      ...over,
    }
    render(<SignCardScreen {...props} />)
    return props
  }

  it('prints the whole card — venue, both nines, and the signature line', () => {
    const setup = dailySetup()
    const { holes } = setup.course
    mount({ setup })

    // masthead
    expect(screen.getByText(setup.course.name)).toBeTruthy()
    expect(screen.getByText(setup.course.location)).toBeTruthy()
    expect(screen.getByText(String(holes.reduce((t, h) => t + h.par, 0)))).toBeTruthy()

    // ALL EIGHTEEN holes, not just the front nine — a card that stops at the
    // turn is not a scorecard, and this is the assertion that says so
    const grid = document.querySelector('.signcard')!
    holes.forEach((h) => {
      expect(within(grid as HTMLElement).getAllByText(String(h.number)).length).toBeGreaterThan(0)
    })
    // two nines, each with its own Hole and Par rows. Scoped to .sc-nine
    // because the masthead carries a "Par" of its own (the total bug).
    const nines = [...document.querySelectorAll<HTMLElement>('.sc-nine')]
    expect(nines).toHaveLength(2)
    nines.forEach((nine) => {
      expect(within(nine).getByText('Hole')).toBeTruthy()
      expect(within(nine).getByText('Par')).toBeTruthy()
    })

    // both turns are totalled, the way a real card breaks
    expect(screen.getByText('Out')).toBeTruthy()
    expect(screen.getByText('In')).toBeTruthy()
    const out = holes.slice(0, 9).reduce((t, h) => t + h.par, 0)
    const back = holes.slice(9).reduce((t, h) => t + h.par, 0)
    expect(within(grid as HTMLElement).getAllByText(String(out)).length).toBeGreaterThan(0)
    expect(within(grid as HTMLElement).getAllByText(String(back)).length).toBeGreaterThan(0)

    expect(screen.getByText('Player')).toBeTruthy()
  })

  it('claims the name onto the identity this device already holds', async () => {
    stubClaim(okReply)
    const props = mount()
    fireEvent.change(screen.getByLabelText('Clubhouse name'), { target: { value: 'Doral Dan' } })
    fireEvent.click(screen.getByRole('button', { name: /sign and tee off/i }))
    await waitFor(() => expect(props.onSigned).toHaveBeenCalled())
    // the id is what salts the daily dice — it must survive the claim untouched
    const stored = JSON.parse(localStorage.getItem('dogleg:player:v1')!) as { id: string; secret: string; name: string }
    expect(stored).toEqual({ id: ID, secret: 'sekrit', name: 'Doral Dan' })
    expect(track).toHaveBeenCalledWith('clubhouse_name_claimed', expect.objectContaining({ via: 'scorecard' }))
  })

  it('will not sign a name shorter than two characters', async () => {
    stubClaim(okReply)
    mount()
    fireEvent.change(screen.getByLabelText('Clubhouse name'), { target: { value: 'J' } })
    expect(screen.getByRole('button', { name: /sign and tee off/i })).toHaveProperty('disabled', true)
  })

  it('a taken name is retryable, and offers no way past the gate', async () => {
    stubClaim(() => new Response(JSON.stringify({ error: 'that name is taken' }), { status: 409 }))
    const props = mount()
    fireEvent.change(screen.getByLabelText('Clubhouse name'), { target: { value: 'Rob' } })
    fireEvent.click(screen.getByRole('button', { name: /sign and tee off/i }))
    await waitFor(() => expect(screen.getByText(/that name is taken/i)).toBeTruthy())
    expect(props.onSigned).not.toHaveBeenCalled()
    // crucially NOT an escape hatch — the player can simply pick another name
    expect(screen.queryByRole('button', { name: /without signing/i })).toBeNull()
  })

  it('fails open when the wire fails — the round is not held hostage', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    const props = mount()
    fireEvent.change(screen.getByLabelText('Clubhouse name'), { target: { value: 'Doral Dan' } })
    fireEvent.click(screen.getByRole('button', { name: /sign and tee off/i }))
    const out = await screen.findByRole('button', { name: /without signing/i })
    expect(props.onSigned).not.toHaveBeenCalled()
    fireEvent.click(out)
    expect(props.onPlayUnsigned).toHaveBeenCalled()
    // and nothing was written — they are still anonymous, not half-named
    expect(JSON.parse(localStorage.getItem('dogleg:player:v1')!).name).toBeNull()
  })
})

/**
 * The gate itself, through the real <App />. These are the assertions that
 * matter most: the screen above is only correct if it appears exactly when it
 * should and never when it shouldn't.
 */
describe('the gate, mounted through the real App', () => {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }

  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', ResizeObserverStub)
    localStorage.clear()
    // land on an interactive home screen: no tutorial, no splashes
    localStorage.setItem('dogleg:tutorial:v1', 'done')
    localStorage.setItem('dogleg:season-ack:v1', seasonForDate().key)
    localStorage.setItem('dogleg:whatsnew-ack:v1', WHATS_NEW_VERSION)
    stubClaim(okReply)
  })

  // the outer describe's cleanup does not reach in here — without this every
  // mounted App stays in the document and the queries match across tests
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  const teeOff = async () => {
    render(<App />)
    fireEvent.click(screen.getByText('Tee off'))
  }

  it('asks an unnamed player to sign, instead of letting them pick a player', async () => {
    seedAnonymousIdentity()
    await teeOff()
    await waitFor(() => expect(screen.getByText('Sign your scorecard')).toBeTruthy())
    expect(screen.queryByText('Pick your player')).toBeNull()
  })

  it('lets them through to the pick screen once signed', async () => {
    seedAnonymousIdentity()
    await teeOff()
    fireEvent.change(await screen.findByLabelText('Clubhouse name'), { target: { value: 'Doral Dan' } })
    fireEvent.click(screen.getByRole('button', { name: /sign and tee off/i }))
    await waitFor(() => expect(screen.getByText('Pick your player')).toBeTruthy())
    expect(screen.queryByText('Sign your scorecard')).toBeNull()
  })

  it('never asks a player who already has a clubhouse name', async () => {
    localStorage.setItem('dogleg:player:v1', JSON.stringify({ id: ID, secret: 'sekrit', name: 'Rob' }))
    await teeOff()
    await waitFor(() => expect(screen.getByText('Pick your player')).toBeTruthy())
    expect(screen.queryByText('Sign your scorecard')).toBeNull()
  })

  it('never asks a device with no minted identity — offline players still play', async () => {
    // ensureIdentity could not reach the server, so there is no row to claim a
    // name onto. Gating here would lock someone out of a playable round.
    await teeOff()
    await waitFor(() => expect(screen.getByText('Pick your player')).toBeTruthy())
    expect(screen.queryByText('Sign your scorecard')).toBeNull()
  })
})

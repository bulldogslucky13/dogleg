// @vitest-environment jsdom
/**
 * The re-link prompt — the user-facing half of the one thing the cross-origin
 * handoff deliberately cannot carry.
 *
 * A player who linked an email arrives from the old domain with their whole
 * clubhouse intact and no session, because the session is a refresh token and
 * the handoff will not put one in a URL (see lib/handoff.ts). Unexplained,
 * that reads as the move having eaten their account — so the explanation is
 * the feature, and these tests are about whether a real person is actually
 * shown it.
 *
 * AccountPanel returns null when `backendEnabled` is false, which it is
 * throughout the normal suite (CI never touches the network), so the panel is
 * unreachable through <App />. Hence a focused mount with the backend faked on.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

vi.mock('../lib/backend', () => ({
  backendEnabled: true,
  SUPABASE_URL: 'https://example.test',
  SUPABASE_ANON_KEY: 'anon',
}))

vi.mock('../lib/auth', () => ({
  supabase: null,
  currentEmail: vi.fn(async () => null),
  sendMagicLink: vi.fn(async () => ({ ok: true })),
  signOut: vi.fn(async () => {}),
  syncAccount: vi.fn(async () => ({ status: 'signedout' as const })),
}))

vi.mock('../lib/analytics', () => ({ track: vi.fn(), identifyPlayer: vi.fn() }))

const { AccountPanel } = await import('./AccountPanel')
const { needsRelink } = await import('../lib/handoff')
const RELINK = 'dogleg:handoff-relink:v1'

describe('the re-link prompt after a domain handoff', () => {
  beforeEach(() => localStorage.clear())
  afterEach(cleanup)

  it('opens itself and explains, without being asked', async () => {
    localStorage.setItem(RELINK, '1')
    localStorage.setItem('dogleg:player:v1', JSON.stringify({ id: 'p1', secret: 's', name: 'Bogey Merchant' }))
    render(<AccountPanel />)

    // the panel is normally collapsed; a migrated player should not have to
    // go looking for the answer to "why am I signed out"
    expect(await screen.findByText(/Your clubhouse made the move/)).toBeTruthy()
    expect(screen.getByText(/Bogey Merchant/)).toBeTruthy()
    expect(screen.getByText(/Nothing was lost/)).toBeTruthy()
    // and the summary line says what to do rather than offering a fresh setup
    expect(screen.getByRole('button', { name: /Sign in again to re-sync/ })).toBeTruthy()
  })

  it('takes no for an answer, once and for all', async () => {
    localStorage.setItem(RELINK, '1')
    render(<AccountPanel />)
    fireEvent.click(await screen.findByRole('button', { name: /didn’t use email sync/ }))

    expect(screen.queryByText(/Your clubhouse made the move/)).toBeNull()
    // cleared from storage too, so a reload doesn't ask again
    expect(needsRelink()).toBe(false)
    expect(localStorage.getItem(RELINK)).toBeNull()
  })

  it('says nothing to a player who simply never linked an email', async () => {
    render(<AccountPanel />)
    expect(screen.getByRole('button', { name: /Sync across devices/ })).toBeTruthy()
    expect(screen.queryByText(/Your clubhouse made the move/)).toBeNull()
  })

  it('clears itself when the player turns out to already be signed in', async () => {
    // e.g. they signed in on this origin between arriving and opening the panel
    const auth = await import('../lib/auth')
    vi.mocked(auth.currentEmail).mockResolvedValueOnce('player@example.test')
    localStorage.setItem(RELINK, '1')
    render(<AccountPanel />)

    expect(await screen.findByRole('button', { name: /Synced/ })).toBeTruthy()
    expect(needsRelink()).toBe(false)
  })
})

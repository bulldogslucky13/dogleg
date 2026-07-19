// @vitest-environment jsdom
/**
 * SMOKE TESTS (UI) — mounts the real <App /> in jsdom and clicks through the
 * core flow: home screen → tee off → pick a player → first tee → commit a
 * shot. Runs in CI on every pull request.
 *
 * This is the only test that renders the full component tree, so a crash in
 * any screen, map, or panel on the happy path fails here. If you add or
 * rename a screen, button, or flow step, update this walkthrough to match.
 * See CLAUDE.md § Smoke tests.
 */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { CHARACTERS } from './engine/characters'

// jsdom has no ResizeObserver; the map measures itself with one
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverStub)

beforeEach(() => {
  localStorage.clear()
  // skip the first-run tutorial overlay so the home screen is interactive
  localStorage.setItem('dogleg:tutorial:v1', 'done')
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('smoke: the app boots and the daily flow works end to end', () => {
  it('renders the home screen with a way to tee off', () => {
    render(<App />)
    expect(screen.getByText('Tee off')).toBeTruthy()
    expect(screen.getByText('How to play')).toBeTruthy()
  })

  it('shows the tutorial to a first-time visitor', () => {
    localStorage.removeItem('dogleg:tutorial:v1')
    render(<App />)
    expect(screen.getByText('One round, one goal')).toBeTruthy()
  })

  it('walks home → pick → play and commits a real shot', () => {
    vi.useFakeTimers() // the shot animation uses setTimeout; keep the test synchronous
    render(<App />)

    fireEvent.click(screen.getByText('Tee off'))
    expect(screen.getByText('Pick your player')).toBeTruthy()

    // all three playstyles are offered; pick the first
    for (const c of CHARACTERS) expect(screen.getByText(c.name)).toBeTruthy()
    fireEvent.click(screen.getByText(CHARACTERS[0].name))

    // first tee: hole header, map, and the three choice cards are up
    expect(screen.getByText(/Par \d · SI \d+/)).toBeTruthy()
    expect(screen.getByText(/\d+ yards/)).toBeTruthy()
    // choice cards commit on the second tap of the selected card
    const safeCard = screen.getByText('Safe').closest('button')!
    fireEvent.click(safeCard)
    expect(within(safeCard).getByText('Tap again to hit it')).toBeTruthy()
    fireEvent.click(safeCard)

    // the shot resolved: a save exists and the round consumed rng rolls
    const save = JSON.parse(localStorage.getItem('dogleg:round:v1') ?? 'null')
    expect(save).not.toBeNull()
    expect(save.rolls).toBeGreaterThan(0)
    expect(save.hole.strokes).toBeGreaterThanOrEqual(1)
  })

  it('resumes an in-progress round from storage straight into play', () => {
    vi.useFakeTimers()
    const first = render(<App />)
    fireEvent.click(screen.getByText('Tee off'))
    fireEvent.click(screen.getByText(CHARACTERS[1].name))
    first.unmount()

    // a fresh mount (new tab / reload) lands back on the live hole
    render(<App />)
    expect(screen.getByText(/Par \d · SI \d+/)).toBeTruthy()
    expect(screen.getByText(CHARACTERS[1].name)).toBeTruthy()
  })

  it('toggles between modern and classic views mid-round', () => {
    vi.useFakeTimers()
    render(<App />)
    fireEvent.click(screen.getByText('Tee off'))
    fireEvent.click(screen.getByText(CHARACTERS[2].name))

    fireEvent.click(screen.getByText(/Modern view/))
    expect(screen.getByText(/Classic view/)).toBeTruthy()
    expect(localStorage.getItem('dogleg:uimode')).toBe('classic')
  })
})

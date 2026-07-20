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
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { CHARACTERS } from './engine/characters'
import { setupFromSeed } from './engine/replay'
import { loadIdentity, loadPlayer } from './lib/leaderboard'

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

  it('offers a fresh character pick on "play another practice round"', () => {
    vi.useFakeTimers()
    render(<App />)

    // start a practice round as one character… (the course also headlines the
    // today-card when it's the daily, so click the browse-list button variant)
    fireEvent.click(screen.getByText(/Play unlimited/))
    const courseButton = screen
      .getAllByText('Pebble Beach Links')
      .map((el) => el.closest('button'))
      .find((b): b is HTMLButtonElement => b !== null)!
    fireEvent.click(courseButton)
    fireEvent.click(screen.getByText(CHARACTERS[0].name))

    // …play it to the clubhouse (bounded loop; a round is ~40-90 decisions).
    // Click whichever left-most choice card the stage offers (labels differ per
    // stage: Safe/Lag/Punch…), and advance timers inside act() so the commit
    // animation lock actually clears between decisions.
    for (let guard = 0; guard < 400; guard++) {
      if (screen.queryByText('Play another practice round')) break
      const advance = screen.queryByText('Next hole') ?? screen.queryByText('Sign the card')
      if (advance) {
        fireEvent.click(advance)
        continue
      }
      const card = document.querySelector<HTMLButtonElement>('button.choice')!
      fireEvent.click(card)
      fireEvent.click(card)
      act(() => {
        vi.advanceTimersByTime(1500)
      })
    }

    // play again must route through the pick screen, not lock in the old player
    fireEvent.click(screen.getByText('Play another practice round'))
    expect(screen.getByText('Pick your player')).toBeTruthy()
    fireEvent.click(screen.getByText(CHARACTERS[2].name))

    // fresh round on the same course with the newly picked character
    expect(screen.getAllByText(/Pebble Beach Links · Practice/).length).toBeGreaterThan(0)
    expect(screen.getByText(CHARACTERS[2].name)).toBeTruthy()
    const save = JSON.parse(localStorage.getItem('dogleg:round:v1') ?? 'null')
    expect(save.character).toBe(CHARACTERS[2].id)
    expect(save.currentHole).toBe(0)
  })

  it('opens a #watch= replay link straight into the viewer', async () => {
    // build a real finished round through the store, encode it like a share link
    const { newRound, applyChoice, advanceHole } = await import('./state/store')
    const { practiceSetup } = await import('./engine/daily')
    const { decisionsFromScores, encodeReplay } = await import('./engine/replay')
    let s = newRound(practiceSetup('pebble-beach', 'smokewatch'), 'practice', 'dart')
    let guard = 0
    while (!s.complete && guard++ < 500) {
      if (s.hole?.stage === 'done') {
        s = advanceHole(s)
        continue
      }
      const next = applyChoice(s, 'normal')
      s = next === s ? applyChoice(s, 'safe') : next
    }
    const code = encodeReplay({
      seed: s.seed,
      character: 'dart',
      decisions: decisionsFromScores(s.scores)!,
      name: 'Smoke Watcher',
    })
    window.location.hash = `#watch=${code}`
    localStorage.clear()
    localStorage.setItem('dogleg:tutorial:v1', 'done')

    render(<App />)
    expect(screen.getByText('‹ Exit replay')).toBeTruthy()
    expect(screen.getByText(/Smoke Watcher's round/)).toBeTruthy()
    // stepping forward shows shot state, loudly labeled with the choice made
    fireEvent.click(screen.getByText('Next ›'))
    expect(screen.getByText(/1 stroke/)).toBeTruthy()
    expect(screen.getByText(/Went (safe|normal|aggressive)/)).toBeTruthy()
    // the hole strip jumps anywhere in the round
    fireEvent.click(screen.getByLabelText('Jump to hole 14'))
    expect(screen.getByText('Hole 14 of 18')).toBeTruthy()
    // exiting cleans the hash and lands home
    fireEvent.click(screen.getByText('‹ Exit replay'))
    expect(screen.getByText('Tee off')).toBeTruthy()
    window.location.hash = ''
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

describe('smoke: anonymous identity and per-player daily dice', () => {
  it('a stored identity (named or not) salts the daily seed; none means the canonical seed', () => {
    // an anonymous minted identity — no name yet — still gets its own dice
    localStorage.setItem(
      'dogleg:player:v1',
      JSON.stringify({ id: 'a3f1c2d4-0000-4000-8000-abcdefabcdef', secret: 's3cret', name: null }),
    )
    expect(loadPlayer()).toBeNull() // nameless: the boards don't know them yet
    expect(loadIdentity()?.id).toBe('a3f1c2d4-0000-4000-8000-abcdefabcdef')

    vi.useFakeTimers()
    render(<App />)
    fireEvent.click(screen.getByText('Tee off'))
    fireEvent.click(screen.getByText(CHARACTERS[0].name))
    const salted = JSON.parse(localStorage.getItem('dogleg:round:v1') ?? 'null')
    expect(setupFromSeed(salted.seed)!.salt).toBeTruthy()
    cleanup()

    // no identity at all (mint never landed): the unsalted canonical seed
    localStorage.removeItem('dogleg:player:v1')
    localStorage.removeItem('dogleg:round:v1')
    render(<App />)
    fireEvent.click(screen.getByText('Tee off'))
    fireEvent.click(screen.getByText(CHARACTERS[0].name))
    const plain = JSON.parse(localStorage.getItem('dogleg:round:v1') ?? 'null')
    expect(setupFromSeed(plain.seed)!.salt).toBeUndefined()
  })
})

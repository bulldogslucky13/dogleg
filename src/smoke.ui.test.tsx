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

  it('How to Play ends on Fortunes, whose sync line opens the account flow', () => {
    render(<App />)
    fireEvent.click(screen.getByText('How to play'))
    // walk to the last step — Fortunes
    while (screen.queryByText('Next')) fireEvent.click(screen.getByText('Next'))
    expect(screen.getByText('Fortunes')).toBeTruthy()
    // (the phrase also lives in the home streak note behind the overlay)
    expect(screen.getAllByText(/golf gods reward the faithful/).length).toBeGreaterThan(0)
    // no numbers anywhere: the multiplier and the ramp stay under the hood
    expect(screen.queryByText(/[0-9]+(x|×|%)/)).toBeNull()
    // the one quiet sync line routes to the same account flow as the locker CTA
    // tapping it lands in the locker with the account panel slot open
    // (AccountPanel itself renders null in tests — backend is off in CI)
    fireEvent.click(screen.getByText(/Playing on more than one device/))
    expect(screen.getByText('My rounds')).toBeTruthy()
  })

  it('the streak display carries the fortune disclosure note', () => {
    render(<App />)
    expect(screen.getByText(/golf gods reward the faithful/)).toBeTruthy()
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
      // practice seeds are time-based, so a natural ace/albatross can fire on
      // any run — wait out the splash's 5s advance lock like a player would,
      // then tap it away and keep going
      const splash = screen.queryByText('HOLE IN ONE') ?? screen.queryByText('ALBATROSS')
      if (splash) {
        act(() => {
          vi.advanceTimersByTime(5100)
        })
        fireEvent.click(splash)
        continue
      }
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

  it('a destiny ace fires the HOLE IN ONE splash, which dismisses on tap', () => {
    vi.useFakeTimers()
    // a due ace counter → the round's first par-3 tee shot holes out
    localStorage.setItem(
      'dogleg:fortune:v1',
      JSON.stringify({ p: { ace: 999, aceK: 0, alb: 0, albK: 0 }, d: { ace: 0, alb: 0 } }),
    )
    render(<App />)
    fireEvent.click(screen.getByText(/Play unlimited/))
    const courseButton = screen
      .getAllByText('Pebble Beach Links')
      .map((el) => el.closest('button'))
      .find((b): b is HTMLButtonElement => b !== null)!
    fireEvent.click(courseButton)
    fireEvent.click(screen.getByText(CHARACTERS[0].name))

    for (let guard = 0; guard < 200; guard++) {
      if (screen.queryByText('HOLE IN ONE')) break
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
    expect(screen.getByText('HOLE IN ONE')).toBeTruthy()
    // the Share button is live immediately…
    expect(screen.getByText('📸 Share')).toBeTruthy()
    // …but for five seconds every other tap is swallowed (no accidental skip)
    fireEvent.click(screen.getByText('HOLE IN ONE'))
    expect(screen.getByText('HOLE IN ONE')).toBeTruthy()
    expect(screen.queryByText(/tap to continue playing/)).toBeNull()
    act(() => {
      vi.advanceTimersByTime(5100)
    })
    // the quiet continue prompt has faded in; now a tap outside Share resumes
    expect(screen.getByText(/tap to continue playing/)).toBeTruthy()
    fireEvent.click(screen.getByText('HOLE IN ONE'))
    expect(screen.queryByText('HOLE IN ONE')).toBeNull()
    // the hole card behind it calls it what it is — not "Eagle"
    expect(screen.getByText('Hole in One')).toBeTruthy()
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

  it('a replay link opened while the app is mounted still enters the viewer (hashchange)', async () => {
    const { newRound, applyChoice, advanceHole } = await import('./state/store')
    const { practiceSetup } = await import('./engine/daily')
    const { decisionsFromScores, encodeReplay } = await import('./engine/replay')
    let s = newRound(practiceSetup('pebble-beach', 'smokehash'), 'practice', 'dart')
    let guard = 0
    while (!s.complete && guard++ < 500) {
      if (s.hole?.stage === 'done') {
        s = advanceHole(s)
        continue
      }
      const next = applyChoice(s, 'normal')
      s = next === s ? applyChoice(s, 'safe') : next
    }
    const code = encodeReplay({ seed: s.seed, character: 'dart', decisions: decisionsFromScores(s.scores)! })
    let s2 = newRound(practiceSetup('st-andrews-old', 'smokehash2'), 'practice', 'greens')
    guard = 0
    while (!s2.complete && guard++ < 500) {
      if (s2.hole?.stage === 'done') {
        s2 = advanceHole(s2)
        continue
      }
      const next = applyChoice(s2, 'normal')
      s2 = next === s2 ? applyChoice(s2, 'safe') : next
    }
    const code2 = encodeReplay({ seed: s2.seed, character: 'greens', decisions: decisionsFromScores(s2.scores)! })
    localStorage.clear()
    localStorage.setItem('dogleg:tutorial:v1', 'done')

    // app is already sitting on the home screen when the hash arrives
    render(<App />)
    expect(screen.getByText('Tee off')).toBeTruthy()
    act(() => {
      window.location.hash = `#watch=${code}`
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    expect(screen.getByText('‹ Exit replay')).toBeTruthy()

    // a SECOND link while deep in this one restarts cleanly at frame 0 —
    // the index from the long replay must not read past a shorter one
    fireEvent.click(screen.getByLabelText('Jump to hole 14'))
    expect(screen.getByText('Hole 14 of 18')).toBeTruthy()
    act(() => {
      window.location.hash = `#watch=${code2}`
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    expect(screen.getByText('Hole 1 of 18')).toBeTruthy()

    // the browser Back button strips the hash — the app must leave the
    // replay too, not stay stuck on a URL that no longer says #watch
    act(() => {
      window.location.hash = ''
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    expect(screen.getByText('Tee off')).toBeTruthy()
  })

  it('a truncated replay link shows the friendly error, not the home screen', () => {
    window.location.hash = '#watch=not-a-real-code'
    render(<App />)
    expect(screen.getByText(/That replay link doesn't parse/)).toBeTruthy()
    fireEvent.click(screen.getByText('Clubhouse'))
    expect(screen.getByText('Tee off')).toBeTruthy()
    window.location.hash = ''
  })

  it('the locker lists archived rounds and its Watch button opens the viewer', async () => {
    const { newRound, applyChoice, advanceHole, archiveRound } = await import('./state/store')
    const { practiceSetup } = await import('./engine/daily')
    let s = newRound(practiceSetup('st-andrews-old', 'smokelocker'), 'practice', 'greens')
    let guard = 0
    while (!s.complete && guard++ < 500) {
      if (s.hole?.stage === 'done') {
        s = advanceHole(s)
        continue
      }
      const next = applyChoice(s, 'normal')
      s = next === s ? applyChoice(s, 'safe') : next
    }
    archiveRound(s)

    render(<App />)
    fireEvent.click(screen.getByText(/My rounds/))

    // the trophy shelf sits on top — empty but visible: the zero IS the goal
    expect(screen.getByText('Lifetime Hole in One')).toBeTruthy()
    expect(screen.getByText('Lifetime Albatross')).toBeTruthy()
    // anonymous player → the sync CTA shows (backend is off in tests, no session)
    expect(screen.getByText('Sync account to save player stats')).toBeTruthy()
    // the lifetime headline is tappable into the stats view
    expect(screen.getByText(/Lifetime rounds played/)).toBeTruthy()

    // Recent is the default tab; every row offers Scorecard (+ Replay while archived)
    expect(screen.getByText(/Last 1 round/)).toBeTruthy()
    expect(screen.getByText(/St Andrews/)).toBeTruthy()
    fireEvent.click(screen.getByText(/Records · 1/))
    expect(screen.getByText('Personal bests')).toBeTruthy()

    // the universal scorecard opens from any row, with Replay beside it
    fireEvent.click(screen.getAllByText('Scorecard')[0])
    expect(screen.getByText('Out')).toBeTruthy()
    expect(screen.getByText('In')).toBeTruthy()
    fireEvent.click(screen.getByText('Close'))
    expect(screen.queryByText('Out')).toBeNull()

    fireEvent.click(screen.getAllByText('▶ Replay')[0])
    expect(screen.getByText('‹ Exit replay')).toBeTruthy()
  })

  it('the stats view computes the handicap countdown and opens the lowest round scorecard', async () => {
    const { newRound, applyChoice, advanceHole, archiveRound } = await import('./state/store')
    const { logRound } = await import('./state/stats')
    const { practiceSetup } = await import('./engine/daily')
    let s = newRound(practiceSetup('st-andrews-old', 'smokestats'), 'practice', 'greens')
    let guard = 0
    while (!s.complete && guard++ < 500) {
      if (s.hole?.stage === 'done') {
        s = advanceHole(s)
        continue
      }
      const next = applyChoice(s, 'normal')
      s = next === s ? applyChoice(s, 'safe') : next
    }
    archiveRound(s)
    logRound(s)

    render(<App />)
    fireEvent.click(screen.getByText(/My rounds/))
    fireEvent.click(screen.getByText(/Lifetime rounds played/))

    // one round in the book: no handicap yet, countdown says how far to go
    expect(screen.getByText('Handicap: Not yet established')).toBeTruthy()
    expect(screen.getByText(/Play 9 more rounds to establish your handicap/)).toBeTruthy()
    // the score distribution renders from the log
    expect(screen.getByText('Pars')).toBeTruthy()
    expect(screen.getByText('Birdies')).toBeTruthy()
    // the lowest round is listed and opens its scorecard
    expect(screen.getByText(/Lowest round/)).toBeTruthy()
    fireEvent.click(screen.getAllByText('Scorecard')[0])
    expect(screen.getByText('Out')).toBeTruthy()
  })

  it('an ace round shows on the trophy shelf and its list opens the scorecard', () => {
    // an archived round whose results hold a par-3 eagle — that IS an ace
    const results = Array(18).fill('par')
    results[7] = 'eagle' // St Andrews hole 8 is a par 3
    localStorage.setItem(
      'dogleg:archive:v1',
      JSON.stringify([
        {
          seed: 'practice:st-andrews-old:acetest',
          mode: 'practice',
          courseSlug: 'st-andrews-old',
          character: 'dart',
          dateKey: '2026-07-20',
          toPar: -2,
          strokes: 70,
          results,
          decisions: Array(18).fill(['normal']),
          playedAt: 1000,
        },
      ]),
    )

    render(<App />)
    fireEvent.click(screen.getByText(/My rounds/))
    // the ace trophy counted it from stored results alone
    const aceTrophy = screen.getByText('Lifetime Hole in One').closest('button')!
    expect(within(aceTrophy).getByText('1')).toBeTruthy()
    fireEvent.click(aceTrophy)
    expect(screen.getByText(/Every hole in one/)).toBeTruthy()
    expect(screen.getByText(/Hole 8/)).toBeTruthy()
    // its scorecard flags the ace on the hole it happened
    fireEvent.click(screen.getByText('Scorecard'))
    expect(screen.getByText('ACE')).toBeTruthy()
  })

  it('a destiny ace fires the HOLE IN ONE splash, which dismisses on tap', () => {
    vi.useFakeTimers()
    // a due ace counter → the round's first par-3 tee shot holes out
    localStorage.setItem(
      'dogleg:fortune:v1',
      JSON.stringify({ p: { ace: 999, aceK: 0, alb: 0, albK: 0 }, d: { ace: 0, alb: 0 } }),
    )
    render(<App />)
    fireEvent.click(screen.getByText(/Play unlimited/))
    const courseButton = screen
      .getAllByText('Pebble Beach Links')
      .map((el) => el.closest('button'))
      .find((b): b is HTMLButtonElement => b !== null)!
    fireEvent.click(courseButton)
    fireEvent.click(screen.getByText(CHARACTERS[0].name))

    for (let guard = 0; guard < 200; guard++) {
      if (screen.queryByText('HOLE IN ONE')) break
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
    expect(screen.getByText('HOLE IN ONE')).toBeTruthy()
    // the Share button is live immediately…
    expect(screen.getByText('📸 Share')).toBeTruthy()
    // …but for five seconds every other tap is swallowed (no accidental skip)
    fireEvent.click(screen.getByText('HOLE IN ONE'))
    expect(screen.getByText('HOLE IN ONE')).toBeTruthy()
    expect(screen.queryByText(/tap to continue playing/)).toBeNull()
    act(() => {
      vi.advanceTimersByTime(5100)
    })
    // the quiet continue prompt has faded in; now a tap outside Share resumes
    expect(screen.getByText(/tap to continue playing/)).toBeTruthy()
    fireEvent.click(screen.getByText('HOLE IN ONE'))
    expect(screen.queryByText('HOLE IN ONE')).toBeNull()
    // the hole card behind it calls it what it is — not "Eagle"
    expect(screen.getByText('Hole in One')).toBeTruthy()
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

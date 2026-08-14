// @vitest-environment jsdom
/**
 * The hunt card — the Teebox's pointer at season records within reach.
 *
 * `seasonHunt` counting right is `lib/hunt.test.ts`'s job. This file is about
 * the promise the card makes: it advertises a number of targets, so the view
 * it opens has to be the view that contains them. A saved browse
 * configuration ("I hold it", favorites only, a difficulty band) or the Par 3
 * tab left active from an earlier open would otherwise hand back an empty or
 * unrelated list under a headline that just finished counting.
 *
 * The card only renders when the season board is KNOWN, and the board is
 * never fetched with `backendEnabled` false (which it is for the rest of the
 * suite — CI never touches the network). Hence the focused mount with the
 * backend faked on and the fetches stubbed.
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
// the account panel is the screen's other half here: it is the only thing
// that learns this device just adopted a clubhouse. Its own behaviour has its
// own tests; these stubs are the two calls its mount reconcile makes.
const currentEmail = vi.fn<() => Promise<string | null>>(async () => null)
const syncAccount = vi.fn<() => Promise<{ status: string; player?: { id: string; secret: string; name: string } }>>(
  async () => ({ status: 'signedout' }),
)
vi.mock('../lib/auth', () => ({
  supabase: null,
  currentEmail,
  sendMagicLink: vi.fn(async () => ({ ok: true })),
  signOut: vi.fn(async () => {}),
  syncAccount,
}))
// no version.json to fetch in jsdom — the staleness banner is not this test
vi.mock('../lib/freshness', () => ({ bundleIsStale: vi.fn(async () => false), FRESH_TTL_MS: 600_000 }))

const fetchSeasonRecords = vi.fn<(k: string) => Promise<Map<string, CourseRecord> | null>>()
const fetchCourseRecords = vi.fn<() => Promise<Map<string, CourseRecord> | null>>(async () => null)
const fetchMyHistory = vi.fn(async () => null)

vi.mock('../lib/leaderboard', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/leaderboard')>()
  return { ...actual, fetchSeasonRecords, fetchCourseRecords, fetchMyHistory }
})

const { HomeScreen } = await import('./screens')
const { COURSES } = await import('../engine/courses')

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverStub)

const record = (slug: string, player: string, toPar: number): CourseRecord => ({
  course_slug: slug,
  player_name: player,
  character: null,
  to_par: toPar,
  mode: 'practice',
})

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

/** the browse view a returning grinder left behind: every one of these can
 * hide a hunt target, and "mine" hides every one of them by definition */
const HOSTILE_PREFS = {
  recType: 'alltime',
  played: 'played',
  rating: 'hard',
  record: 'mine',
  favsOnly: true,
  sort: 'easiest',
}

describe('the hunt card opens the hunt it advertised', () => {
  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem('dogleg:tutorial:v1', 'done')
    fetchSeasonRecords.mockReset()
    fetchCourseRecords.mockReset().mockResolvedValue(null)
  })
  afterEach(cleanup)

  it('counts the takeable records under the unlimited CTA', async () => {
    // one soft standing record, everything else open
    fetchSeasonRecords.mockResolvedValue(new Map([[COURSES[0].slug, record(COURSES[0].slug, 'Hank', 2)]]))
    mount()

    expect(await screen.findByText(/season records within reach/)).toBeTruthy()
    expect(screen.getByText(/softest number standing is \+2/)).toBeTruthy()
  })

  it('clears a saved view that would hide the targets it just counted', async () => {
    localStorage.setItem('dogleg:course-browse:v1', JSON.stringify(HOSTILE_PREFS))
    fetchSeasonRecords.mockResolvedValue(new Map())
    mount()

    fireEvent.click(await screen.findByText(/season records within reach/))

    // the list is open, on the season board, showing courses rather than the
    // "no courses match your saved filters" dead end the old view produced
    expect(screen.queryByText(/No courses match your saved filters/)).toBeNull()
    expect(screen.getByRole('button', { name: /^View Season Records/ }).className).toContain('on')
    expect(screen.getByText(COURSES[0].name)).toBeTruthy()
  })

  it('comes back to the Courses tab even when Par 3 was left showing', async () => {
    fetchSeasonRecords.mockResolvedValue(new Map())
    mount()
    await screen.findByText(/season records within reach/)

    // open the list, wander onto Par 3, close it again — the tab is sticky
    // for the life of the screen, so the next open inherits it
    const cta = screen.getByText('Play unlimited')
    fireEvent.click(cta)
    fireEvent.click(screen.getByRole('tab', { name: 'Par 3 Courses' }))
    fireEvent.click(cta)

    fireEvent.click(screen.getByText(/season records within reach/))
    expect(screen.getByRole('tab', { name: 'Courses' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByText(COURSES[0].name)).toBeTruthy()
  })

  it('sorts the list weakest-record-first, which is the hunt order', async () => {
    const [soft, strong] = [COURSES[0], COURSES[1]]
    fetchSeasonRecords.mockResolvedValue(
      new Map([
        [soft.slug, record(soft.slug, 'Hank', 3)],
        [strong.slug, record(strong.slug, 'Marge', -9)],
      ]),
    )
    mount()

    fireEvent.click(await screen.findByText(/season records within reach/))
    const rows = screen.getAllByText(/^Season (\+|-|E)/).map((e) => e.textContent ?? '')
    // the -9 wall sits below the +3 invitation, wherever tour order had them
    expect(rows.findIndex((r) => r.includes('+3'))).toBeLessThan(rows.findIndex((r) => r.includes('-9')))
  })

  it('stays away when the board is unreachable — it must not pretend to know', async () => {
    fetchSeasonRecords.mockResolvedValue(null)
    mount()

    expect(await screen.findByText('Play unlimited')).toBeTruthy()
    expect(screen.queryByText(/within reach/)).toBeNull()
  })
})

describe('a season board that failed to load is still gettable', () => {
  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem('dogleg:tutorial:v1', 'done')
    fetchSeasonRecords.mockReset()
    fetchCourseRecords.mockReset().mockResolvedValue(null)
  })
  afterEach(cleanup)

  it('retries on the next open instead of sitting out the whole visit', async () => {
    // briefly offline at mount: no board, so no card — the never-pretend rule
    fetchSeasonRecords.mockResolvedValueOnce(null)
    mount()

    const cta = await screen.findByText('Play unlimited')
    expect(screen.queryByText(/within reach/)).toBeNull()

    // ...and back online. Opening the list is the interaction that retries;
    // the failed attempt must not have claimed the season key on its way out
    fetchSeasonRecords.mockResolvedValue(new Map())
    fireEvent.click(cta)

    expect(await screen.findByText(/season records within reach/)).toBeTruthy()
    expect(screen.queryByText(/records loading…/)).toBeNull()
  })

  it('does not re-read a board it already has', async () => {
    fetchSeasonRecords.mockResolvedValue(new Map())
    mount()
    await screen.findByText(/season records within reach/)

    // the retry deps fire on every open and toggle; a loaded board is done
    const cta = screen.getByText('Play unlimited')
    fireEvent.click(cta)
    fireEvent.click(screen.getByRole('button', { name: /^View All-Time Records/ }))
    fireEvent.click(cta)
    expect(fetchSeasonRecords).toHaveBeenCalledTimes(1)
  })

  it('does not stack reads while the first one is still out', async () => {
    // a board slow enough that the panel opens before it lands
    let land: (m: Map<string, CourseRecord>) => void = () => {}
    fetchSeasonRecords.mockReturnValue(new Promise((r) => (land = r)))
    mount()

    fireEvent.click(await screen.findByText('Play unlimited'))
    fireEvent.click(screen.getByRole('button', { name: /^View All-Time Records/ }))
    expect(fetchSeasonRecords).toHaveBeenCalledTimes(1)

    await act(async () => land(new Map()))
    expect(fetchSeasonRecords).toHaveBeenCalledTimes(1)
  })
})

describe('adopting a clubhouse mid-screen stops hunting your own records', () => {
  const HOLDER = { id: 'p9', secret: 's9', name: 'Bogey Merchant' }

  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem('dogleg:tutorial:v1', 'done')
    fetchCourseRecords.mockReset().mockResolvedValue(null)
    fetchSeasonRecords.mockReset()
    currentEmail.mockReset().mockResolvedValue(null)
    syncAccount.mockReset().mockResolvedValue({ status: 'signedout' })
  })
  afterEach(cleanup)

  it('recounts when a fresh device turns out to be the record holder', async () => {
    // one standing record, soft enough to hunt
    fetchSeasonRecords.mockResolvedValue(new Map([[COURSES[0].slug, record(COURSES[0].slug, HOLDER.name, 2)]]))
    // the session is held open so the board lands FIRST: the bug is a card
    // that already counted, then never recounted. An adoption that beats the
    // board home is the easy case — the first count is simply correct.
    let signIn: (addr: string) => void = () => {}
    currentEmail.mockReturnValue(new Promise((r) => (signIn = r)))
    // note this account has no submitted dailies — fetchMyHistory returns
    // null, so the history-sync path tells the screen nothing. A
    // practice-only record holder is exactly who this has to work for.
    syncAccount.mockResolvedValue({ status: 'adopted', player: HOLDER })

    mount()
    // this device knows nobody, so the holder's own record reads as a target
    const before = (await screen.findByText(/season records within reach/)).textContent ?? ''
    const target = Number(before.match(/(\d+) season record/)?.[1])
    expect(screen.getByText(/softest number standing is \+2/)).toBeTruthy()

    // ...and now the magic-link session says this device IS that holder
    await act(async () => signIn('holder@example.test'))
    await screen.findByText(/Synced · Bogey Merchant/)

    // their record is a trophy now, not a target — and it was the only
    // standing number, so the softest-standing line goes with it
    const after = (await screen.findByText(/season records within reach/)).textContent ?? ''
    expect(Number(after.match(/(\d+) season record/)?.[1])).toBe(target - 1)
    expect(screen.queryByText(/softest number standing/)).toBeNull()
  })
})

describe('one season read serves both the card and the ledger', () => {
  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem('dogleg:tutorial:v1', 'done')
    localStorage.setItem('dogleg:player:v1', JSON.stringify({ id: 'p1', secret: 's', name: 'Bogey Merchant' }))
    fetchSeasonRecords.mockReset().mockResolvedValue(new Map())
    fetchCourseRecords.mockReset().mockResolvedValue(null)
  })
  afterEach(cleanup)

  it('queries the season board once per home visit, not once per reader', async () => {
    mount()
    await screen.findByText(/season records within reach/)
    // the hunt card and the record-stolen reconcile read the SAME snapshot —
    // two reads could disagree about who holds what, and cost a query saying so
    expect(fetchSeasonRecords).toHaveBeenCalledTimes(1)
  })
})

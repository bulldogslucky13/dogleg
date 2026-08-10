/**
 * THE SANDBOX (dev only, /_sandbox.html) — the whole game, nobody watching.
 *
 * Mounts the REAL <App /> with three shims so every surface is live at once
 * and nothing ever touches prod:
 *
 *  1. THE CLOCK moves inside Championship week (The DogLeg, Aug 27–30 2026),
 *     so the Cup card, the event, and the course are simply ON. The toolbar
 *     jumps between round days — and to the Monday after, for the podium.
 *  2. THE NETWORK is intercepted at window.fetch: every Supabase read gets a
 *     demo field (familiar clubhouse names), and submit-round is replayed by
 *     a LOCAL referee — the same replayRound the real one runs — so posting,
 *     ranks, duplicates, and record breaks all behave, offline.
 *  3. THE PROFILE is pre-seeded through the real store: a daily streak,
 *     archived practice rounds (including a destiny ace AND albatross, so
 *     the Clubhouse trophy shelf is populated), achievements backfilled by
 *     the normal app-start reconcile, and one course record freshly stolen
 *     by Rob so the rivalry card is waiting on the Teebox.
 *
 * Nothing here is imported by the app; the page is dev-only like
 * /_splashes.html and /_emails.html.
 */
import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
// type-only: erased at compile, so nothing executes before the clock shim
import type { RoundState } from './state/store'
import '@fontsource-variable/archivo/wdth.css'
import '@fontsource/barlow/400.css'
import '@fontsource/barlow/500.css'
import '@fontsource/barlow/600.css'
import '@fontsource/barlow/700.css'
import '@fontsource/barlow/800.css'
import '@fontsource/barlow/900.css'
import './styles.css'
import './ui/theme.css'
import './ui/broadcast.css'

// ---------------------------------------------------------------------------
// 1. THE CLOCK — pick the sandbox day before anything else reads Date
// ---------------------------------------------------------------------------

const DATE_KEY = 'sandbox:date'
const DEFAULT_DATE = '2026-08-28' // Friday — Round 2 of the Championship

const sandboxDate = localStorage.getItem(DATE_KEY) ?? DEFAULT_DATE

const RealDate = Date
const [sy, sm, sd] = sandboxDate.split('-').map(Number)
// noon local on the chosen day, well clear of both midnights
const CLOCK_OFFSET = new RealDate(sy, sm - 1, sd, 12, 0, 0).getTime() - RealDate.now()

class SandboxDateClass extends RealDate {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(...args: any[]) {
    if (args.length === 0) super(RealDate.now() + CLOCK_OFFSET)
    else super(...(args as [number]))
  }
  static now(): number {
    return RealDate.now() + CLOCK_OFFSET
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(window as any).Date = SandboxDateClass

// everything below imports AFTER the clock is shimmed
const { localDateKey } = await import('./engine/daily')
const { activeEvent, dayOfEvent, eventForKey } = await import('./engine/events')
const { replayRound } = await import('./engine/replay')
const { SUPABASE_URL } = await import('./lib/backend')
const { recordWon } = await import('./lib/records')
const { recordPostedCupRound } = await import('./lib/cup')
const store = await import('./state/store')

// ---------------------------------------------------------------------------
// 2. THE NETWORK — a demo field and a local referee
// ---------------------------------------------------------------------------

const FIELD = ['Rob', 'Jack Bow', 'Mike', 'Andres', 'Him Nantz', 'Tigers driver', 'KMAN', 'Mshea55', 'T dawg', 'WGT']
const CHARS = ['fairway', 'dart', 'greens', null] as const

/** deterministic pseudo-random per (name, n) so boards are stable across reloads */
function jitter(name: string, n: number, span: number): number {
  let h = 2166136261
  for (const c of `${name}:${n}`) h = ((h ^ c.charCodeAt(0)) * 16777619) >>> 0
  return (h % (span * 2 + 1)) - span
}

function demoEventRows(eventKey: string): unknown[] {
  const event = eventForKey(eventKey)
  if (!event) return []
  const today = localDateKey()
  const liveDay = dayOfEvent(event, today)
  // days fully in the books, plus a partial field for the live day
  const doneDays = liveDay ? liveDay - 1 : today > event.start ? 4 : 0
  const rows: unknown[] = []
  FIELD.forEach((name, i) => {
    // a couple of players skip days — the "N of 3" grey rows need showing
    const skips = new Set(i % 4 === 1 ? [2] : i % 4 === 3 ? [1, 3] : [])
    for (let day = 1; day <= doneDays; day++) {
      if (skips.has(day)) continue
      const toPar = Math.max(-6, Math.min(9, jitter(name, day, 4) + (day >= 3 ? 1 : 0)))
      rows.push({
        event_key: eventKey,
        day,
        player_id: `demo-${name}`,
        player_name: name,
        character: CHARS[i % CHARS.length],
        to_par: toPar,
        strokes: 72 + toPar,
        results: [],
      })
    }
    // the live day: roughly half the field has already posted
    if (liveDay && i % 2 === 0 && !skips.has(liveDay)) {
      const toPar = Math.max(-5, Math.min(9, jitter(name, liveDay * 7, 4) + (liveDay >= 3 ? 1 : 0)))
      rows.push({
        event_key: eventKey,
        day: liveDay,
        player_id: `demo-${name}`,
        player_name: name,
        character: CHARS[i % CHARS.length],
        to_par: toPar,
        strokes: 72 + toPar,
        results: [],
      })
    }
  })
  return rows
}

function demoDailyBoard(): unknown[] {
  return FIELD.slice(0, 8)
    .map((name, i) => ({ player_name: name, character: CHARS[i % CHARS.length], to_par: jitter(name, 99, 4) }))
    .sort((a, b) => (a.to_par as number) - (b.to_par as number))
}

const DEMO_RECORDS: Record<string, { player_name: string; to_par: number; character: string | null }> = {
  // Rob just took Pebble from the seeded ledger below — the steal card's fuel
  'pebble-beach': { player_name: 'Rob', to_par: -6, character: 'dart' },
  'st-andrews-old': { player_name: 'Jack Bow', to_par: -5, character: 'fairway' },
  'oakmont': { player_name: 'Mike', to_par: -2, character: 'greens' },
  'augusta-national': { player_name: 'Andres', to_par: -4, character: 'dart' },
  'harbour-town': { player_name: 'Jackson', to_par: -3, character: 'fairway' },
}

const json = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })

/** the seeds this page has already accepted — duplicate detection */
const submitted = new Set<string>()

function localReferee(body: {
  seed: string
  character?: 'fairway' | 'dart' | 'greens'
  decisions: ('safe' | 'normal' | 'aggressive')[][]
  name?: string
}): Response {
  const replay = replayRound(body.seed, body.character, body.decisions)
  if (!replay.ok) return json({ error: `round rejected: ${replay.error}` })
  const info = replay.info
  const duplicate = submitted.has(body.seed)
  submitted.add(body.seed)
  const player = { id: 'sandbox-jackson-id', name: 'Jackson' }
  if (info.mode === 'major') {
    const field = demoEventRows(info.eventKey!) as { day: number; to_par: number }[]
    const todays = field.filter((r) => r.day === info.eventDay)
    const better = todays.filter((r) => r.to_par < replay.toPar).length
    return json({
      mode: 'major',
      eventKey: info.eventKey,
      day: info.eventDay,
      toPar: replay.toPar,
      strokes: replay.strokes,
      rank: better + 1,
      total: todays.length + 1,
      duplicate,
      player,
    })
  }
  if (info.mode === 'daily') {
    const board = demoDailyBoard() as { to_par: number }[]
    const better = board.filter((r) => r.to_par < replay.toPar).length
    return json({
      mode: 'daily',
      toPar: replay.toPar,
      strokes: replay.strokes,
      rank: better + 1,
      total: board.length + 1,
      duplicate,
      player,
    })
  }
  // practice: contend for the demo record boards — beat one and the full
  // record celebration stack fires, exactly like prod
  const rec = DEMO_RECORDS[info.course.slug]
  const broken = !rec || replay.toPar < rec.to_par
  return json({
    mode: 'practice',
    toPar: replay.toPar,
    strokes: replay.strokes,
    duplicate,
    record: broken
      ? { broken: true, toPar: replay.toPar, holder: 'Jackson', character: body.character ?? null }
      : { broken: false, toPar: rec.to_par, holder: rec.player_name, character: rec.character },
    seasonRecord: broken
      ? { broken: true, toPar: replay.toPar, holder: 'Jackson', character: body.character ?? null, seasonKey: '2026-q3-fall' }
      : undefined,
    player,
  })
}

const realFetch = window.fetch.bind(window)
window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  if (!url.startsWith(SUPABASE_URL)) return realFetch(input, init)

  if (url.includes('/functions/v1/submit-round')) {
    const body = JSON.parse((init?.body as string) ?? '{}')
    return localReferee(body)
  }
  if (url.includes('/functions/v1/mint-player')) {
    return json({ id: 'sandbox-jackson-id', secret: 'sandbox-secret', name: 'Jackson' })
  }
  if (url.includes('/rest/v1/event_scores')) {
    const eq = /event_key=eq\.([a-z0-9-]+)/.exec(url)
    if (eq) return json(demoEventRows(eq[1]))
    const inList = /event_key=in\.\(([^)]*)\)/.exec(url)
    if (inList) return json(decodeURIComponent(inList[1]).split(',').filter(Boolean).flatMap(demoEventRows))
    return json([])
  }
  if (url.includes('/rest/v1/daily_scores')) {
    if (url.includes('player_id=eq.')) return json([]) // account history sync
    return json(demoDailyBoard())
  }
  if (url.includes('/rest/v1/course_records')) {
    if (url.includes('course_slug=eq.')) return json([]) // no stored ghost round
    return json(Object.entries(DEMO_RECORDS).map(([course_slug, r]) => ({ course_slug, ...r })))
  }
  if (url.includes('/rest/v1/season_records')) {
    return json(
      Object.entries(DEMO_RECORDS)
        .slice(0, 3)
        .map(([course_slug, r]) => ({ course_slug, scope: 'global', season_key: '2026-q3-fall', ...r })),
    )
  }
  if (url.includes('/rest/v1/daily_choice_tallies')) {
    const hole = Number(/hole=eq\.(\d+)/.exec(url)?.[1] ?? 1)
    return json([
      { hole, stage: 'tee', choice: 'safe', count: 4, names: ['Mike', 'T dawg'] },
      { hole, stage: 'tee', choice: 'normal', count: 9, names: ['Rob', 'Jack Bow', 'KMAN'] },
      { hole, stage: 'tee', choice: 'aggressive', count: 3, names: ['Andres'] },
      { hole, stage: 'approach', choice: 'normal', count: 8, names: ['Rob', 'Mike'] },
      { hole, stage: 'putt', choice: 'normal', count: 12, names: ['Jack Bow'] },
    ])
  }
  return json([]) // any other Supabase read: empty, never prod
}

// ---------------------------------------------------------------------------
// 3. THE PROFILE — seeded once, through the real store
// ---------------------------------------------------------------------------

const SEEDED_KEY = 'sandbox:seeded:v2'

function dateKeyDaysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return localDateKey(d)
}

function playRound(state: RoundState, pick: (s: RoundState) => 'safe' | 'normal' | 'aggressive') {
  let s = state
  let guard = 0
  while (!s.complete && guard++ < 500) {
    s = s.hole?.stage === 'done' ? store.advanceHole(s) : store.applyChoice(s, pick(s))
  }
  return s
}

async function seedProfile(): Promise<void> {
  if (localStorage.getItem(SEEDED_KEY)) return
  const { practiceSetup } = await import('./engine/daily')
  const { logRound } = await import('./state/stats')

  // the named identity every surface keys off
  localStorage.setItem(
    'dogleg:player:v1',
    JSON.stringify({ id: 'sandbox-jackson-id', secret: 'sandbox-secret', name: 'Jackson' }),
  )
  // seen-the-basics flags: tutorial done, season splash acked; What's New is
  // left LIVE on purpose — the Cup announcement greets the first landing
  localStorage.setItem('dogleg:tutorial:v1', 'done')
  const { seasonForDate } = await import('./engine/season')
  localStorage.setItem('dogleg:season-ack:v1', seasonForDate().key)

  // a five-day streak of posted dailies ending yesterday
  const history = [5, 4, 3, 2, 1].map((n) => ({
    dateKey: dateKeyDaysAgo(n),
    puzzleNumber: 30 + (5 - n),
    courseSlug: ['pebble-beach', 'oakmont', 'st-andrews-old', 'riviera', 'quail-hollow'][n - 1],
    toPar: [2, -1, 3, 0, 1][n - 1],
    results: Array(18).fill('par'),
    character: (['fairway', 'dart', 'greens', 'dart', 'fairway'] as const)[n - 1],
  }))
  localStorage.setItem('dogleg:history:v1', JSON.stringify(history))
  localStorage.setItem('dogleg:posted:v1', JSON.stringify(history.map((h) => h.dateKey)))

  // TROPHIES: force both destinies due, then play a real practice round —
  // the ace and the albatross land through the genuine machinery, so the
  // Clubhouse shelf, the round log, and the achievements all agree
  localStorage.setItem('dogleg:fortune:v1', JSON.stringify({ p: { ace: 600, aceK: 0, alb: 600, albK: 0 } }))
  const destiny = playRound(
    store.newRound(practiceSetup('augusta-national', 'sandbox-destiny'), 'practice', 'dart'),
    (s) => (s.hole?.stage === 'second' && s.aggressiveLeft > 0 ? 'aggressive' : 'normal'),
  )
  store.recordResult(destiny)
  store.archiveRound(destiny)
  logRound(destiny)
  // two ordinary rounds so the log isn't all fireworks
  for (const [slug, extra] of [
    ['harbour-town', 'sandbox-a'],
    ['carnoustie', 'sandbox-b'],
  ] as const) {
    const r = playRound(store.newRound(practiceSetup(slug, extra), 'practice', 'greens'), () => 'normal')
    store.recordResult(r)
    store.archiveRound(r)
    logRound(r)
  }

  // the rivalry: this device held Pebble at -4… and the demo server says Rob
  // has it at -6 now. The Teebox steal card lights up on first sync.
  recordWon('pebble-beach', -4, Date.now() - 5 * 86_400_000)
  recordWon('harbour-town', -3, Date.now() - 3 * 86_400_000) // still held — Name on the Wall

  localStorage.setItem(SEEDED_KEY, 'done')
}

// ---------------------------------------------------------------------------
// The toolbar — jump days, force splashes, reset
// ---------------------------------------------------------------------------

const DAYS: Array<{ key: string; label: string }> = [
  { key: '2026-08-27', label: 'Thu · Rd 1' },
  { key: '2026-08-28', label: 'Fri · Rd 2' },
  { key: '2026-08-29', label: 'Sat · Rd 3' },
  { key: '2026-08-30', label: 'Sun · Rd 4' },
  { key: '2026-08-31', label: 'Mon · podium' },
]

function setDay(key: string): void {
  // the podium needs at least one posted Cup round to feel owed
  if (key === '2026-08-31') recordPostedCupRound('the-dogleg-2026', 1)
  localStorage.setItem(DATE_KEY, key)
  // the live round slot belongs to the day it was dealt — clear it on jump
  localStorage.removeItem('dogleg:round:v1')
  location.reload()
}

function SandboxBar() {
  const [open, setOpen] = useState(false)
  const live = activeEvent(localDateKey())
  const s: Record<string, React.CSSProperties> = {
    fab: {
      position: 'fixed',
      right: 10,
      bottom: 10,
      zIndex: 99999,
      background: '#c9a13b',
      color: '#1c2b1e',
      border: 'none',
      borderRadius: 20,
      padding: '6px 12px',
      fontWeight: 800,
      fontSize: 12,
      cursor: 'pointer',
      boxShadow: '0 2px 10px rgba(0,0,0,.4)',
    },
    panel: {
      position: 'fixed',
      right: 10,
      bottom: 44,
      zIndex: 99999,
      background: '#12211a',
      color: '#e8e4d5',
      border: '1px solid #c9a13b',
      borderRadius: 10,
      padding: 10,
      width: 230,
      fontSize: 12,
      display: 'grid',
      gap: 6,
    },
    btn: {
      background: '#1e3327',
      color: '#e8e4d5',
      border: '1px solid #3a5243',
      borderRadius: 6,
      padding: '5px 8px',
      fontSize: 12,
      cursor: 'pointer',
      textAlign: 'left' as const,
    },
    on: { borderColor: '#c9a13b', color: '#c9a13b', fontWeight: 700 },
    head: { fontWeight: 800, letterSpacing: '.06em', fontSize: 10, opacity: 0.8, textTransform: 'uppercase' as const },
  }
  return (
    <>
      <button style={s.fab} onClick={() => setOpen((v) => !v)}>
        🧪 SANDBOX · {sandboxDate.slice(5)}
      </button>
      {open && (
        <div style={s.panel}>
          <span style={s.head}>Championship week — {live ? `Round ${live.day} live` : 'event over'}</span>
          {DAYS.map((d) => (
            <button key={d.key} style={{ ...s.btn, ...(d.key === sandboxDate ? s.on : {}) }} onClick={() => setDay(d.key)}>
              {d.label}
            </button>
          ))}
          <span style={s.head}>Splashes</span>
          <button
            style={s.btn}
            onClick={() => {
              localStorage.removeItem('dogleg:season-ack:v1')
              location.reload()
            }}
          >
            Season splash
          </button>
          <button
            style={s.btn}
            onClick={() => {
              localStorage.removeItem('dogleg:whatsnew-ack:v1')
              location.reload()
            }}
          >
            What's New
          </button>
          <button
            style={s.btn}
            onClick={() => {
              localStorage.removeItem('dogleg:tutorial:v1')
              location.reload()
            }}
          >
            How to Play (first-run)
          </button>
          <button style={s.btn} onClick={() => (location.href = '/_splashes.html')}>
            Splash gallery ›
          </button>
          <span style={s.head}>Danger</span>
          <button
            style={{ ...s.btn, borderColor: '#a24936' }}
            onClick={() => {
              localStorage.clear()
              location.reload()
            }}
          >
            Reset everything
          </button>
        </div>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------

await seedProfile()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <SandboxBar />
  </StrictMode>,
)

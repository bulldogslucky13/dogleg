/**
 * DEV-ONLY splash gallery — mounted by /_splashes.html, never by the app.
 *
 * These celebration surfaces are the hardest things in the game to reach by
 * playing (you need to actually break a course record, ace a hole, or sit
 * through a season rollover), which is exactly why the re-skin restyled them
 * blind. This renders each one on demand with representative props so they can
 * be looked at. Temporary scaffolding for the re-skin verification pass.
 */
import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { AllTimeSplash } from './ui/AllTimeSplash'
import { MomentSplash } from './ui/MomentSplash'
import { RecordSplash } from './ui/RecordSplash'
import { SeasonSplash } from './ui/SeasonSplash'
import { seasonForDate } from './engine/season'
import '@fontsource-variable/archivo/wdth.css'
import '@fontsource/barlow/400.css'
import '@fontsource/barlow/500.css'
import '@fontsource/barlow/600.css'
import '@fontsource/barlow/700.css'
import './styles.css'
import './ui/theme.css'
import './ui/broadcast.css'

// Serve the season board synthetically so the podium/recap path can be seen —
// season_records only just started accumulating in prod, so the real fetch
// returns nothing and the populated layout would never render.
const realFetch = window.fetch.bind(window)
window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  if (/season_records/.test(url)) {
    const rows = [
      { course_slug: 'pebble-beach', player_name: 'Scrambler_Sue', to_par: -7, character: 'dart', set_at: '2026-06-02T12:00:00Z' },
      { course_slug: 'st-andrews', player_name: 'BigDog_Duffer', to_par: -5, character: 'fairway', set_at: '2026-05-11T12:00:00Z' },
      { course_slug: 'oakmont', player_name: 'Scrambler_Sue', to_par: -4, character: 'greens', set_at: '2026-04-20T12:00:00Z' },
      { course_slug: 'carnoustie', player_name: 'MulliganMike', to_par: -3, character: 'dart', set_at: '2026-06-18T12:00:00Z' },
      { course_slug: 'royal-portrush', player_name: 'Jackson_C', to_par: -2, character: 'greens', set_at: '2026-05-30T12:00:00Z' },
      { course_slug: 'harbour-town', player_name: 'PuttPuttPam', to_par: -1, character: 'fairway', set_at: '2026-04-02T12:00:00Z' },
    ]
    return Promise.resolve(
      new Response(JSON.stringify(rows), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    )
  }
  // everything else: block writes, allow reads
  const method = (init?.method ?? 'GET').toUpperCase()
  if (/supabase\.co/.test(url) && method !== 'GET') {
    return Promise.resolve(new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }))
  }
  return realFetch(input, init)
}

const season = seasonForDate()
const COMMON = { courseName: 'Royal Portrush — Dunluce Links', courseSlug: 'royal-portrush', dateKey: '2026-07-26', toPar: -6 }

const CASES: Record<string, (close: () => void) => React.ReactNode> = {
  'moment · ace': (close) => (
    <MomentSplash kind="ace" holeNumber={7} courseName={COMMON.courseName} dateKey={COMMON.dateKey} toPar={-4} character="dart" streak={6} onClose={close} />
  ),
  'moment · mis-fortune': (close) => (
    <MomentSplash
      kind="misfortune"
      holeNumber={11}
      courseName={COMMON.courseName}
      dateKey="2026-07-29"
      toPar={2}
      character="greens"
      mode="daily"
      seed="round:2026-07-29:royal-portrush:demo"
      par={4}
      onClose={close}
    />
  ),
  'moment · albatross': (close) => (
    <MomentSplash kind="albatross" holeNumber={13} courseName={COMMON.courseName} dateKey={COMMON.dateKey} toPar={-6} character="fairway" streak={12} onClose={close} />
  ),
  'record · fresh': (close) => <RecordSplash {...COMMON} character="greens" onClose={close} />,
  'record · reclaimed': (close) => <RecordSplash {...COMMON} character="dart" takenFrom="BigDog_Duffer" onClose={close} />,
  'record · season': (close) => <RecordSplash {...COMMON} character="dart" season={season} onClose={close} />,
  'all-time': (close) => (
    <AllTimeSplash {...COMMON} character="greens" season={season} previousHolder="Scrambler_Sue" tookSeason onClose={close} />
  ),
  'all-time · first ever': (close) => (
    <AllTimeSplash {...COMMON} character="fairway" season={season} onClose={close} />
  ),
  season: (close) => <SeasonSplash onClose={close} />,
}

function Gallery() {
  const [open, setOpen] = useState<string | null>(null)
  return (
    <div className="screen home" style={{ gap: 8 }}>
      <p className="dl-kicker">Dev only · splash gallery</p>
      {Object.keys(CASES).map((k) => (
        <button key={k} className="cta ghost" onClick={() => setOpen(k)}>
          {k}
        </button>
      ))}
      {open && CASES[open](() => setOpen(null))}
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<Gallery />)

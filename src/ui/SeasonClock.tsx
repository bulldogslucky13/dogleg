import { useEffect, useState } from 'react'
import type { Season } from '../engine/season'

/**
 * The season clock — the countdown as a broadcast graphic instead of a line
 * of prose. Days plus a live H:M:S ticking off the DEVICE clock toward the
 * season's first instant of not-existing (season.endsAt is already an epoch
 * from the shared ET calendar, so no timezone math happens here — the device
 * clock only supplies "now"). The old sentence kept getting buried in text;
 * numbers this big don't get buried.
 */

export interface CountdownParts {
  days: number
  hrs: string
  min: string
  sec: string
}

/** clamped at zero — the horn never counts backwards */
export function countdownParts(endsAt: number, now: number): CountdownParts {
  const rem = Math.max(0, endsAt - now)
  const pad = (n: number) => `${n}`.padStart(2, '0')
  return {
    days: Math.floor(rem / 86_400_000),
    hrs: pad(Math.floor(rem / 3_600_000) % 24),
    min: pad(Math.floor(rem / 60_000) % 60),
    sec: pad(Math.floor(rem / 1_000) % 60),
  }
}

export function SeasonClock({ season }: { season: Season }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  const c = countdownParts(season.endsAt, now)
  return (
    // deliberately NOT aria-live: a screen reader announcing every second
    // would be unbearable — the label carries the moment-in-time reading
    <div className="season-clock" role="timer" aria-label={`${season.name} ends in ${c.days} days ${c.hrs}:${c.min}:${c.sec}`}>
      <div className="season-clock-kicker">{season.name} ends in</div>
      <div className="season-clock-row" aria-hidden>
        <div className="season-clock-cell">
          <b>{c.days}</b>
          <span>days</span>
        </div>
        <em>:</em>
        <div className="season-clock-cell">
          <b>{c.hrs}</b>
          <span>hrs</span>
        </div>
        <em>:</em>
        <div className="season-clock-cell">
          <b>{c.min}</b>
          <span>min</span>
        </div>
        <em>:</em>
        <div className="season-clock-cell">
          <b>{c.sec}</b>
          <span>sec</span>
        </div>
      </div>
      <p className="season-clock-sub">Season records are up for grabs — hold them to the horn</p>
    </div>
  )
}

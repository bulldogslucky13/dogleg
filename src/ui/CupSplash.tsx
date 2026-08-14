import { courseBySlug } from '../engine/courses'
import { localDateKey } from '../engine/daily'
import { activeEvent, type CupEvent } from '../engine/events'
import { track } from '../lib/analytics'
import { Wordmark } from './Wordmark'

/**
 * The Cup's two announcement splashes:
 *
 *  - CupIntroSplash — ONCE ever: tournaments exist now, here is the format.
 *  - CupEventSplash — once per EVENT, on the first landing inside its week:
 *    this week's course and stakes, with a tee-off straight from the splash.
 *
 * Both ride the app's landing-modal slot (one dialog per arrival, ranked in
 * App.tsx), and both re-use the podium's full-screen card chrome.
 */

const INTRO_ACK_KEY = 'dogleg:cup-intro-ack:v1'
const EVENT_ACK_KEY = 'dogleg:cup-event-ack:v1'

export function needsCupIntro(): boolean {
  try {
    return !localStorage.getItem(INTRO_ACK_KEY)
  } catch {
    return false
  }
}

export function ackCupIntro(): void {
  try {
    localStorage.setItem(INTRO_ACK_KEY, 'seen')
  } catch {
    /* private mode */
  }
}

function ackedEvents(): Set<string> {
  try {
    const raw = localStorage.getItem(EVENT_ACK_KEY)
    return new Set(raw ? (JSON.parse(raw) as string[]) : [])
  } catch {
    return new Set()
  }
}

export function ackCupEvent(eventKey: string): void {
  try {
    localStorage.setItem(EVENT_ACK_KEY, JSON.stringify([...ackedEvents(), eventKey].slice(-40)))
  } catch {
    /* private mode */
  }
}

/** The event whose welcome this landing owes: live this week, never shown. */
export function cupEventSplashDue(today = localDateKey()): { event: CupEvent; day: number } | null {
  const live = activeEvent(today)
  if (!live || ackedEvents().has(live.event.key)) return null
  return live
}

/** ONCE: tournaments are a thing now. The format, in plain words. */
export function CupIntroSplash(props: { onClose: () => void }) {
  return (
    <div className="cup-podium-splash" role="dialog" aria-label="Introducing the DogLeg Cup">
      <div className="cup-podium-card">
        <Wordmark className="result-wordmark" />
        <div className="kicker">🏆 New — The DogLeg Cup</div>
        <h2 className="cup-splash-title">Tournament golf comes to DogLeg</h2>
        <ul className="cup-splash-rules">
          <li>
            <b>Four rounds, Thursday to Sunday</b>, on one course — one refereed attempt each day.
          </li>
          <li>
            <b>Your best three rounds count.</b> Nobody gets cut. Miss a day, you're still in it.
          </li>
          <li>
            <b>The course firms up as the weekend goes</b> — Sunday plays the hardest, and it says so up front.
          </li>
          <li>
            <b>Every event pays points</b> toward the season-long DogLeg Cup. Majors pay more.
          </li>
        </ul>
        <button
          className="cta"
          onClick={() => {
            ackCupIntro()
            track('cup_intro_acked')
            props.onClose()
          }}
        >
          See the tee sheet
        </button>
      </div>
    </div>
  )
}

/** Once per event: this week's stage, and a first tee to walk straight onto. */
export function CupEventSplash(props: {
  event: CupEvent
  day: number
  /** tee off in the Cup right from the splash */
  onPlay: () => void
  onClose: () => void
}) {
  const { event, day } = props
  const course = courseBySlug(event.courseSlug)
  const par = course?.holes.reduce((s, h) => s + h.par, 0)
  const dismiss = () => {
    ackCupEvent(event.key)
    props.onClose()
  }
  return (
    <div className="cup-podium-splash" role="dialog" aria-label={`${event.name} is on`}>
      <div className="cup-podium-card">
        <Wordmark className="result-wordmark" />
        <div className="kicker">
          🏆 {event.major ? 'Major week' : 'This week'}
          {event.exhibition ? ' · Exhibition' : ''}
        </div>
        <h2 className="cup-splash-title">{event.name}</h2>
        {course && (
          <>
            <p className="cup-splash-course">
              {course.name} · {course.location}
              {par ? ` · Par ${par}` : ''}
            </p>
            {course.blurb && <p className="cup-splash-blurb">“{course.blurb}”</p>}
          </>
        )}
        <p className="cup-splash-format">
          Four rounds, Thursday to Sunday — one attempt a day, best three count. The course firms up through the
          weekend; Sunday plays hardest.
        </p>
        <button
          className="cta"
          onClick={() => {
            ackCupEvent(event.key)
            track('cup_event_splash_play', { event: event.key, day })
            props.onPlay()
          }}
        >
          Play Round {day}
          <span className="cta-sub">Best 3 of 4 Rounds – One Attempt per Day</span>
        </button>
        <button className="cta ghost" onClick={dismiss}>
          Later — to the Teebox
        </button>
      </div>
    </div>
  )
}

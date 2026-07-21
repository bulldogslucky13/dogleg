import { useRef, useState } from 'react'
import { SITE_URL, toParLabel } from '../engine/daily'
import type { CharacterId } from '../engine/types'
import { track } from '../lib/analytics'
import { momentCardBlob, shareMomentCard } from './momentCard'

/**
 * The reclaim celebration — the fortune splash's little sibling. Same gold
 * confetti energy, scaled down: a card over the result screen instead of a
 * full-screen takeover, dismissible immediately (no advance lock — the
 * result screen underneath is not skippable content). Shares through the
 * same branded card pipeline as the fortune moments.
 */
export function RecordSplash(props: {
  courseName: string
  courseSlug: string
  dateKey: string
  toPar: number
  character?: CharacterId
  /** the name we took it back from */
  takenFrom?: string
  onClose: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const noteTimer = useRef<number | undefined>(undefined)
  const confetti = Array.from({ length: 14 })

  const flash = (message: string) => {
    setNote(message)
    window.clearTimeout(noteTimer.current)
    noteTimer.current = window.setTimeout(() => setNote(null), 2000)
  }

  const share = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (busy) return
    setBusy(true)
    try {
      const blob = await momentCardBlob({
        kind: 'record',
        holeNumber: 0,
        courseName: props.courseName,
        dateKey: props.dateKey,
        toPar: props.toPar,
        character: props.character,
        copy: { title: 'RECORD RECLAIMED', sub: 'The course record is back where it belongs.' },
        meta: `${toParLabel(props.toPar)} · course record · ${shortDate(props.dateKey)}`,
      })
      const outcome = await shareMomentCard(blob, {
        filename: 'dogleg-course-record.png',
        text: `Reclaimed the course record on ${props.courseName} (${toParLabel(props.toPar)}) — DogLeg`,
        url: `https://${SITE_URL}`,
      })
      if (outcome === 'cancelled') return
      track('record_share_clicked', { method: outcome, course: props.courseSlug })
      if (outcome === 'clipboard') flash('Copied!')
      if (outcome === 'download') flash('Saved!')
    } catch {
      flash("Couldn't make the card")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="record-splash-backdrop" role="dialog" aria-label="Record reclaimed" onClick={props.onClose}>
      {confetti.map((_c, i) => (
        <span key={i} className="moment-confetti" style={confettiStyle(i)} aria-hidden />
      ))}
      <div className="record-splash-card" onClick={(e) => e.stopPropagation()}>
        <div className="moment-kicker">⛳ DogLeg · {props.courseName}</div>
        <h2 className="record-splash-title">Record reclaimed</h2>
        <p className="record-splash-sub">
          {toParLabel(props.toPar)} takes back the course record
          {props.takenFrom ? ` from ${props.takenFrom}` : ''}. Order restored.
        </p>
        <button className="cta moment-share" onClick={share} disabled={busy}>
          {busy ? 'Making your card…' : '📸 Share'}
        </button>
        {note && (
          <span className="moment-toast" role="status">
            {note}
          </span>
        )}
        <button className="record-splash-close" onClick={props.onClose}>
          Back to the scorecard
        </button>
      </div>
    </div>
  )
}

function confettiStyle(i: number): React.CSSProperties {
  // deterministic scatter, same convention as the moment splash
  const left = (i * 41) % 100
  const delay = ((i * 11) % 16) / 10
  const dur = 2.4 + ((i * 7) % 12) / 10
  const size = 6 + ((i * 5) % 8)
  return {
    left: `${left}%`,
    animationDelay: `${delay}s`,
    animationDuration: `${dur}s`,
    width: size,
    height: size * 1.6,
    transform: `rotate(${(i * 47) % 360}deg)`,
  }
}

function shortDate(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

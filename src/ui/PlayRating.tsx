import { useEffect, useState } from 'react'
import { playRatingFor } from '../engine/courses'
import { PLAY_INDEX, PLAY_RATING_META } from '../engine/playRatings'
import { toParLabel } from '../engine/daily'

/**
 * The Play Rating badge: a tappable chip showing a course's simulation-derived
 * difficulty of play (1–10), opening a modal that explains how it's measured.
 * Distinct from the daily Wind/Greens conditions, which vary day to day — the
 * Play Rating is a stable property of the course itself.
 */
export function PlayRatingChip(props: { slug: string; dark?: boolean }) {
  const [open, setOpen] = useState(false)
  const rating = playRatingFor(props.slug)
  return (
    <>
      <button
        type="button"
        className={`chip rating-chip${props.dark ? ' dark' : ''}`}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        title="How is Play Rating calculated?"
      >
        Play Rating {rating}/10<span className="rating-chip-info" aria-hidden>ⓘ</span>
      </button>
      {open && <PlayRatingModal slug={props.slug} onClose={() => setOpen(false)} />}
    </>
  )
}

function PlayRatingModal(props: { slug: string; onClose: () => void }) {
  const rating = playRatingFor(props.slug)
  const index = PLAY_INDEX[props.slug]
  const { rounds, cutoffs } = PLAY_RATING_META

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') props.onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [props])

  return (
    <div
      className="tut-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="How Play Rating is calculated"
      onClick={props.onClose}
    >
      <div className="tut-card rating-card" onClick={(e) => e.stopPropagation()}>
        <button className="tut-skip" onClick={props.onClose} aria-label="Close">
          Close
        </button>
        <div className="kicker">Play Rating</div>
        <h2 className="tut-title">
          {rating}/10 · how hard this course plays
        </h2>
        <div className="tut-body rating-body">
          <p>
            Play Rating measures how tough the course actually plays in DogLeg — not an editorial
            guess. We simulate <b>{rounds.toLocaleString()} full rounds</b> here with a competent
            golfer (playing safe on the hardest holes, taking smart chances elsewhere) and average
            the score to par.
          </p>
          {index !== undefined && (
            <p>
              This course averages{' '}
              <b>{toParLabel(Math.round(index))} ({index >= 0 ? '+' : ''}{index.toFixed(2)})</b> to
              par across those rounds, which lands it at <b>{rating}/10</b>.
            </p>
          )}
          <div className="rating-scale">
            {cutoffs.map(([min, r]) => (
              <div key={r} className={`rating-scale-row${r === rating ? ' on' : ''}`}>
                <span className="rating-scale-n">{r}</span>
                <span className="rating-scale-cut">
                  {r === 10 ? `${toParLabel(Math.ceil(min))} or worse` : `≥ ${min > 0 ? '+' : ''}${min}`}
                </span>
              </div>
            ))}
            <div className={`rating-scale-row${rating === 1 ? ' on' : ''}`}>
              <span className="rating-scale-n">1</span>
              <span className="rating-scale-cut">easiest</span>
            </div>
          </div>
          <p className="rating-foot">
            It's separate from the daily Wind and Greens, which shift each day. The number here is a
            steady property of the course.
          </p>
        </div>
      </div>
    </div>
  )
}

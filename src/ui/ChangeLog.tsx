import { useEffect } from 'react'
import { CHANGE_KIND_LABEL, CHANGELOG } from '../lib/changelog'

/**
 * The change log, opened from the Teebox footer.
 *
 * Point of the screen: a game that promises honest odds should show when the
 * odds moved. The counts in the intro are derived from the list itself, so the
 * claim can never drift from the entries backing it.
 */
export function ChangeLog(props: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') props.onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [props])

  const oddsChanges = CHANGELOG.filter((c) => c.kind === 'odds').length

  return (
    <div
      className="tut-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Change log"
      onClick={props.onClose}
    >
      <div className="tut-card changelog" onClick={(e) => e.stopPropagation()}>
        <button className="tut-skip" onClick={props.onClose} aria-label="Close">
          Close
        </button>
        <div className="kicker">Change log</div>
        <h2 className="tut-title">Every update, in the open</h2>
        {/* Deliberately precise rather than reassuring: the marked count is
            derived from the list, and the claim is only about shot resolution
            (the handicap entry, for one, changed a number without touching
            it). Overclaiming here would cost exactly the trust the screen is
            meant to earn. */}
        <p className="changelog-intro">
          {CHANGELOG.length} updates since DogLeg opened, newest first. The {oddsChanges} marked{' '}
          <b>Odds changed</b> altered what a shot can do, and each one says how. Everything else
          is a new feature or a fix.
        </p>
        <ol className="changelog-list">
          {CHANGELOG.map((c) => (
            <li key={`${c.date}-${c.title}`} className="changelog-entry">
              <div className="changelog-meta">
                <span className={`changelog-tag ${c.kind}`}>{CHANGE_KIND_LABEL[c.kind]}</span>
                <time dateTime={c.date}>{formatDate(c.date)}</time>
              </div>
              <b className="changelog-title">{c.title}</b>
              <span className="changelog-note">{c.note}</span>
            </li>
          ))}
        </ol>
        <div className="tut-nav">
          <span />
          <button className="cta" onClick={props.onClose}>
            Got it
          </button>
        </div>
      </div>
    </div>
  )
}

/** 2026-07-25 → Jul 25. Parsed by hand: `new Date('2026-07-25')` is UTC
 *  midnight, which renders as the day before for anyone west of Greenwich. */
function formatDate(iso: string): string {
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const [, m, d] = iso.split('-')
  return `${MONTHS[Number(m) - 1]} ${Number(d)}`
}

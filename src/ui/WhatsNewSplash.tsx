/**
 * The what's-new splash: one drop, one card, dismissed forever. Shown only to
 * players who were already here (see `primeWhatsNew`), and only ever one
 * landing modal deep — the tutorial outranks it, it outranks the season
 * splash (see `pickLandingModal` in App.tsx).
 *
 * The bar for spending this slot is a change that alters how the game PLAYS,
 * not a content drop — new courses announce themselves in the course list.
 * Rewrite the body wholesale when `WHATS_NEW_VERSION` is bumped; this is not
 * a changelog that accumulates entries.
 */

/**
 * The three grades of rough, painted with the SAME colours the hole map uses
 * for its surround (HoleMap's `sky` / `skyRough` gradients and `gorse` tuft
 * pattern) — the swatch is a promise about what you'll see out there, so if
 * those change, change these. Ids are prefixed to avoid colliding with the
 * map's own SVG defs, which live in the same document.
 */
const GRADES = [
  {
    id: 'wn-normal',
    name: 'Rough',
    where: 'Most courses',
    line: 'Playable. Advance it and get on with your round.',
    top: '#31543a',
    bottom: '#22402c',
    tufts: 0,
  },
  {
    id: 'wn-gorse',
    name: 'Gorse',
    where: 'Royal Portrush',
    line: 'Thick. Finding it costs you more than a stroke of position.',
    top: '#2a4a32',
    bottom: '#1b3524',
    tufts: 0.5,
  },
  {
    id: 'wn-hay',
    name: 'Hay',
    where: 'Oakmont',
    line: "The nastiest we've grown. Wedge out and take your medicine.",
    top: '#24402c',
    bottom: '#172d1f',
    tufts: 0.7,
  },
]

function GradeSwatch(props: { grade: (typeof GRADES)[number] }) {
  const g = props.grade
  return (
    <svg className="rough-swatch" viewBox="0 0 52 34" role="img" aria-label={`${g.name}: how it looks on the map`}>
      <defs>
        <linearGradient id={`${g.id}-bg`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={g.top} />
          <stop offset="1" stopColor={g.bottom} />
        </linearGradient>
        {g.tufts > 0 && (
          // the map tiles this at 26px across a full-screen surround; at
          // swatch size that lands ~2 tufts, so the grades read identical.
          // Halved so the thumbnail carries the same SCRUBBINESS the map
          // does — colours are untouched, only the density is scaled to fit.
          <pattern id={`${g.id}-tufts`} width="26" height="26" patternUnits="userSpaceOnUse" patternTransform="rotate(12) scale(0.5)">
            <circle cx="6" cy="7" r="3.1" fill="#1f3a26" opacity="0.85" />
            <circle cx="18" cy="16" r="2.6" fill="#22412a" opacity="0.8" />
            <circle cx="11" cy="20" r="1.7" fill="#2b5233" opacity="0.7" />
            <circle cx="21" cy="5" r="1.3" fill="#6f7c31" opacity="0.55" />
          </pattern>
        )}
      </defs>
      <rect width="52" height="34" rx="7" fill={`url(#${g.id}-bg)`} />
      {g.tufts > 0 && <rect width="52" height="34" rx="7" fill={`url(#${g.id}-tufts)`} opacity={g.tufts} />}
    </svg>
  )
}

export function WhatsNewSplash(props: { onClose: () => void }) {
  return (
    <div className="tut-backdrop" role="dialog" aria-modal="true" aria-label="What's changed: the rough">
      <div className="tut-card whats-new">
        <div className="kicker">New on the tee sheet</div>
        <h2 className="tut-title">🌾 Not all rough is rough</h2>
        <div className="tut-body">
          <p>
            Three grades of it now, and the deep stuff finally plays like it looks — you'll save
            par out of it a lot less often.
          </p>
          <ul className="rough-grades">
            {GRADES.map((g) => (
              <li key={g.id}>
                <GradeSwatch grade={g} />
                <span>
                  <b>{g.name}</b> <em>{g.where}</em>
                  <br />
                  {g.line}
                </span>
              </li>
            ))}
          </ul>
          <p className="fine">Ten courses play tougher than they did yesterday.</p>
        </div>
        <button className="cta" onClick={props.onClose}>
          Noted — I'll find the fairway
        </button>
      </div>
    </div>
  )
}

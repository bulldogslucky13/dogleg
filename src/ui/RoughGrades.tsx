/**
 * The three grades of rough, as a legend.
 *
 * Shared by How to Play (where a new player meets them) and the what's-new
 * splash (where an existing player learns they arrived) — deliberately ONE
 * definition, because the swatches are painted with the SAME colours HoleMap
 * gives its surround (the `sky` / `skyRough` gradients and the `gorse` tuft
 * pattern). The legend is a promise about what the player will see out on the
 * hole, so if those change, change these — in one place, not two.
 */

export const ROUGH_GRADES = [
  {
    id: 'rg-normal',
    name: 'Rough',
    where: 'Most courses',
    line: 'Playable. Advance it and get on with your round.',
    top: '#31543a',
    bottom: '#22402c',
    tufts: 0,
  },
  {
    id: 'rg-gorse',
    name: 'Gorse',
    where: 'Royal Portrush',
    line: 'Thick. Finding it costs you more than a stroke of position.',
    top: '#2a4a32',
    bottom: '#1b3524',
    tufts: 0.5,
  },
  {
    id: 'rg-hay',
    name: 'Hay',
    where: 'Oakmont',
    line: "The nastiest we've grown. Wedge out and take your medicine.",
    top: '#24402c',
    bottom: '#172d1f',
    tufts: 0.7,
  },
]

function GradeSwatch(props: { grade: (typeof ROUGH_GRADES)[number] }) {
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

export function RoughGradeList() {
  return (
    <ul className="rough-grades">
      {ROUGH_GRADES.map((g) => (
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
  )
}

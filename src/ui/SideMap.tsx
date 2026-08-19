import type { BallState, HazardZone, HoleLayout } from '../engine/types'

const W = 360
const H = 150
const X0 = 18
const X1 = 342

/** side-profile ground line — a gentle rolling quadratic */
function groundY(x: number): number {
  const t = (x - X0) / (X1 - X0)
  return (1 - t) * (1 - t) * 102 + 2 * (1 - t) * t * 112 + t * t * 96
}

/**
 * Drawn x for a zone, at its honest yardage. Cross features clamp short of the
 * green's front edge so nothing on the strip can hide under the green.
 */
function zoneX(zone: HazardZone, xFor: (yards: number) => number, greenFrontX: number): number {
  const mid = (xFor(zone.from) + xFor(zone.to)) / 2
  return zone.side === 'cross' ? Math.min(mid, greenFrontX - 8) : Math.min(X1 - 10, mid)
}

/** Drawn half-width — single source for the hazard's ellipse and the ball in it. */
function zoneRx(zone: HazardZone, xFor: (yards: number) => number): number {
  return Math.max(13, Math.min(34, (xFor(zone.to) - xFor(zone.from)) / 2))
}

/**
 * Drawn x for the ball. A ball in a mapped hazard sits at its OWN yardage, not
 * the hazard's MIDPOINT: on a long waste bunker the midpoint is tens of yards
 * from where the ball stopped, so catching the front end drew the ball further
 * from the pin than the shot that put it there — going visibly backwards while
 * the yards-left badge counted down. Clamped to the drawn ellipse, because this
 * strip caps a hazard's width and the ball still has to sit in the sand the
 * caption says it is in.
 */
function ballXFor(
  ball: BallState,
  zone: HazardZone | undefined,
  xFor: (yards: number) => number,
  greenFrontX: number,
): number {
  const x = xFor(ball.pos)
  if (!zone) return x
  const cx = zoneX(zone, xFor, greenFrontX)
  const rx = zoneRx(zone, xFor)
  return Math.min(Math.max(x, cx - rx), cx + rx)
}

function Zone(props: { zone: HazardZone; cx: number; xFor: (yards: number) => number; behind: boolean }) {
  const { zone, cx, xFor, behind } = props
  const rx = zoneRx(zone, xFor)
  const gy = groundY(cx)
  // no exact lateral geometry shown — hazards sit alongside the strip, crossing water sits on it
  const above = zone.side === 'left'
  const y = zone.side === 'cross' ? gy + 6 : above ? gy - 15 : gy + 26
  const opacity = behind ? 0.3 : 1
  switch (zone.kind) {
    case 'bunker':
      return <ellipse cx={cx} cy={y} rx={rx} ry={6.5} fill="#e3cd96" stroke="#cdb478" strokeWidth={1} opacity={opacity} />
    case 'water':
      return <ellipse cx={cx} cy={y} rx={Math.max(rx, 18)} ry={7.5} fill="#6fa3c0" stroke="#59869f" strokeWidth={1} opacity={opacity} />
    case 'ocean':
      return <ellipse cx={cx} cy={Math.max(y, gy + 26)} rx={Math.max(rx, 40)} ry={9} fill="#5d96b5" stroke="#4b7e99" strokeWidth={1} opacity={opacity} />
    case 'trees':
      return (
        <g opacity={opacity}>
          <circle cx={cx - 7} cy={y} r={7} fill="#375c3e" />
          <circle cx={cx + 6} cy={y + 2} r={5.5} fill="#2f5136" />
        </g>
      )
    case 'deeprough':
      return <ellipse cx={cx} cy={y} rx={rx} ry={5} fill="#6d8a4e" opacity={opacity * 0.9} />
    default:
      return null
  }
}

/** Classic side-profile view of the whole hole: tee left, flag right. */
export function SideMap(props: { layout: HoleLayout; ball: BallState }) {
  const { layout, ball } = props
  const L = layout.length
  const xFor = (yards: number) => X0 + Math.max(0, Math.min(1, yards / L)) * (X1 - X0)
  const greenX = X1 - 6
  // honest green width: its real depth in yards on the same scale as the strip
  const greenRx = Math.max(8, Math.min(34, ((layout.greenDepth / 2) / L) * (X1 - X0)))
  const greenFrontX = greenX - greenRx
  const gy = groundY(greenX)

  // a ball sitting in a mapped hazard stays within where that hazard is drawn
  const ballZone = ball.zoneId ? layout.zones.find((z) => z.id === ball.zoneId) : undefined
  const ballX = ballXFor(ball, ballZone, xFor, greenFrontX)
  const by = groundY(ballX)
  const yardsLeft = Math.max(0, Math.round(L - ball.pos))
  const labelX = Math.max(X0 + 40, Math.min(X1 - 60, (ballX + greenX) / 2))

  // 0 = ordinary rough, 1 = penal, 2 = severe (see CourseSpec.rough). The
  // classic view has to carry this too: How to Play tells the player the map
  // shows which grade they're on, and that promise can't hold in only one of
  // two display modes. Darker, scrubbier ground as the grade climbs — the
  // same signal HoleMap gives its surround, in this view's lighter palette.
  const roughSeverity = layout.rough === 'severe' ? 2 : layout.rough === 'penal' ? 1 : 0
  const ground = ['#4a7a44', '#3d6a3a', '#335a31'][roughSeverity]
  const groundEdge = ['#3f6b3b', '#345c32', '#2b4d2a'][roughSeverity]

  const STEPS = 24
  const pts: string[] = []
  for (let i = 0; i <= STEPS; i++) {
    const x = X0 + ((X1 - X0) * i) / STEPS
    pts.push(`${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${groundY(x).toFixed(1)}`)
  }
  for (let i = STEPS; i >= 0; i--) {
    const x = X0 + ((X1 - X0) * i) / STEPS
    pts.push(`L${x.toFixed(1)},${(groundY(x) + 13).toFixed(1)}`)
  }
  const strip = pts.join(' ') + ' Z'

  return (
    <svg
      className="holemap"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`Hole ${layout.spec.number} side view, ${yardsLeft} yards to the pin`}
    >
      {roughSeverity > 0 && (
        <defs>
          <pattern id="sideScrub" width="18" height="18" patternUnits="userSpaceOnUse" patternTransform="rotate(12)">
            <circle cx="4" cy="5" r="2.2" fill="#25401f" opacity="0.8" />
            <circle cx="12" cy="11" r="1.8" fill="#2b4a25" opacity="0.75" />
            <circle cx="8" cy="15" r="1.2" fill="#33552c" opacity="0.65" />
          </pattern>
        </defs>
      )}

      <rect width={W} height={H} fill="#d5e6cf" />

      {/* ground strip */}
      <path d={strip} fill={ground} stroke={groundEdge} strokeWidth={1.5} strokeLinejoin="round" />
      {/* gorse/hay scrub, drawn on the SAME path so it can't spill off the ground */}
      {roughSeverity > 0 && (
        <path className="side-rough-scrub" d={strip} fill="url(#sideScrub)" opacity={roughSeverity > 1 ? 0.55 : 0.35} />
      )}

      {/* green + flag, under the hazards so nothing can hide beneath the putting surface */}
      <ellipse cx={greenX} cy={gy + 4} rx={greenRx} ry={8.5} fill="#2f5b3c" />
      <g transform={`translate(${greenX}, ${gy + 1})`}>
        <line x1="0" y1="0" x2="0" y2="-30" stroke="#26301f" strokeWidth={2.2} />
        <path d="M0,-30 L16,-24.5 L0,-19 Z" fill="#c05b4d" />
      </g>

      {/* hazards, at their honest yardage — dimmed once they're behind the ball */}
      {layout.zones.map((z) => (
        <Zone key={z.id} zone={z} cx={zoneX(z, xFor, greenFrontX)} xFor={xFor} behind={z.to < ball.pos - 2} />
      ))}

      {/* tee marker */}
      <ellipse cx={X0 + 5} cy={groundY(X0 + 5) + 2} rx={8} ry={4.5} fill="#2f5b3c" />

      {/* line home */}
      {yardsLeft > 0 && (
        <path
          d={`M${ballX + 8},${by - 6} L${greenX - 6},${gy - 8}`}
          stroke="#26301f"
          strokeWidth={2}
          strokeDasharray="2 8"
          strokeLinecap="round"
          opacity={0.65}
        />
      )}

      {/* lie flavor under the ball */}
      {ball.lie === 'sand' && <ellipse cx={ballX} cy={by + 1} rx={12} ry={4.5} fill="#e3cd96" stroke="#cdb478" strokeWidth={1} />}
      {/* The `trees` lie doubles as the odds' junk floor, so it lands on courses
          with no trees at all (see CourseSpec.junkLabel). Draw a canopy only
          where the hole really has one; elsewhere a low scrubby tuft, so classic
          view doesn't sit the ball under a tree while the caption says gorse. */}
      {ball.lie === 'trees' &&
        (layout.junkLabel === 'trees' ? (
          <circle cx={ballX - 10} cy={by - 12} r={7} fill="#375c3e" />
        ) : (
          <ellipse cx={ballX} cy={by} rx={12} ry={5} fill="#4a5c34" stroke="#3a4a29" strokeWidth={1} />
        ))}
      {ball.lie === 'rough' && <ellipse cx={ballX} cy={by} rx={10} ry={3.5} fill="#6d8a4e" />}

      {/* ball */}
      {ball.pos > 0 ? (
        <circle className="ball" cx={ballX} cy={by - 4} r={5} fill="#ffffff" stroke="#26301f" strokeWidth={1.8} />
      ) : (
        <circle className="ball" cx={X0 + 5} cy={groundY(X0 + 5) - 4} r={5} fill="#ffffff" stroke="#26301f" strokeWidth={1.8} />
      )}

      {/* yards-left badge */}
      {yardsLeft > 0 && (
        <g transform={`translate(${labelX}, ${Math.min(by, gy) - 34})`}>
          <rect x={-27} y={-11} width={54} height={22} rx={11} fill="#1d2b20" opacity={0.82} />
          <text x={0} y={4.5} textAnchor="middle" fill="#f4efe3" fontSize={12.5} fontWeight={700}>
            {yardsLeft} yd
          </text>
        </g>
      )}
    </svg>
  )
}

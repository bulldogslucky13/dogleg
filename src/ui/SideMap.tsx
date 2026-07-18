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

function Zone(props: { zone: HazardZone; cx: number; xFor: (yards: number) => number; behind: boolean }) {
  const { zone, cx, xFor, behind } = props
  const rx = Math.max(13, Math.min(34, (xFor(zone.to) - xFor(zone.from)) / 2))
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

  // a ball sitting in a mapped hazard anchors to where that hazard is drawn
  const ballZone = ball.zoneId ? layout.zones.find((z) => z.id === ball.zoneId) : undefined
  const ballX = ballZone ? zoneX(ballZone, xFor, greenFrontX) : xFor(ball.pos)
  const by = groundY(ballX)
  const yardsLeft = Math.max(0, Math.round(L - ball.pos))
  const labelX = Math.max(X0 + 40, Math.min(X1 - 60, (ballX + greenX) / 2))

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
      <rect width={W} height={H} fill="#d5e6cf" />

      {/* ground strip */}
      <path d={strip} fill="#4a7a44" stroke="#3f6b3b" strokeWidth={1.5} strokeLinejoin="round" />

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
      {ball.lie === 'trees' && <circle cx={ballX - 10} cy={by - 12} r={7} fill="#375c3e" />}
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

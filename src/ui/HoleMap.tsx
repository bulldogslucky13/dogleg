import { useMemo } from 'react'
import type { BallState, Choice, HazardZone, HoleLayout } from '../engine/types'
import { fnv1a, mulberry32 } from '../engine/rng'

const W = 360
const H = 520

interface Pt {
  x: number
  y: number
}

interface ZonePlace {
  /** where a ball in this zone sits */
  anchor: Pt
  /** ellipses to draw (bunkers, ponds, clusters) — empty for band/flank/trees */
  ellipses: { cx: number; cy: number; rx: number; ry: number }[]
  kind: HazardZone['kind']
}

/** Sampled centerline with arc-length parametrization + per-hole zoom. */
function useGeometry(layout: HoleLayout) {
  return useMemo(() => {
    const { dogleg } = layout.spec
    // shorter holes render "zoomed in": bigger green, wider features
    const zoom = Math.min(1.45, Math.max(1, Math.sqrt(560 / Math.max(layout.length, 140))))
    const bendDir = dogleg === 'L' ? -1 : dogleg === 'R' ? 1 : 0
    const tee: Pt = { x: 180 - bendDir * 26, y: 474 }
    const green: Pt = { x: 180 + bendDir * 30, y: 92 }
    const mid: Pt = { x: (tee.x + green.x) / 2, y: (tee.y + green.y) / 2 }
    const ctrl: Pt = { x: mid.x + bendDir * 78, y: mid.y + 20 }
    const pts: Pt[] = []
    const N = 72
    for (let i = 0; i <= N; i++) {
      const t = i / N
      const a = 1 - t
      pts.push({
        x: a * a * tee.x + 2 * a * t * ctrl.x + t * t * green.x,
        y: a * a * tee.y + 2 * a * t * ctrl.y + t * t * green.y,
      })
    }
    const cum = [0]
    for (let i = 1; i <= N; i++) {
      cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y))
    }
    const total = cum[N]
    const at = (yards: number): Pt => {
      const target = Math.max(0, Math.min(1, yards / layout.length)) * total
      let i = 1
      while (i < N && cum[i] < target) i++
      const seg = cum[i] - cum[i - 1] || 1
      const f = (target - cum[i - 1]) / seg
      return {
        x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * f,
        y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * f,
      }
    }
    /** golfer-left unit normal at yards */
    const normalAt = (yards: number): Pt => {
      const a = at(Math.max(0, yards - 6))
      const b = at(yards + 6)
      const dx = b.x - a.x
      const dy = b.y - a.y
      const len = Math.hypot(dx, dy) || 1
      return { x: dy / len, y: -dx / len }
    }
    const rng = mulberry32(fnv1a(`${layout.spec.number}:${layout.length}:shape`))
    const greenRx = (40 + rng() * 10) * zoom
    const greenRy = (30 + rng() * 8) * zoom
    return { at, normalAt, tee, green, zoom, greenRx, greenRy }
  }, [layout])
}

type Geo = ReturnType<typeof useGeometry>

function ribbonPath(geo: Geo, from: number, to: number, width: (t: number) => number): string {
  const STEPS = 26
  const leftPts: string[] = []
  const rightPts: string[] = []
  for (let i = 0; i <= STEPS; i++) {
    const t = i / STEPS
    const yards = from + (to - from) * t
    const p = geo.at(yards)
    const n = geo.normalAt(yards)
    const w = width(t)
    leftPts.push(`${(p.x + n.x * w).toFixed(1)},${(p.y + n.y * w).toFixed(1)}`)
    rightPts.unshift(`${(p.x - n.x * w).toFixed(1)},${(p.y - n.y * w).toFixed(1)}`)
  }
  return `M${leftPts.join(' L')} L${rightPts.join(' L')} Z`
}

/** One canopy: layered crowns + soft shadow. */
function Tree({ x, y, s, tone = 0 }: { x: number; y: number; s: number; tone?: number }) {
  const c1 = tone === 0 ? '#2b4f35' : '#274a31'
  const c2 = tone === 0 ? '#245029' : '#204526'
  const hi = tone === 0 ? '#3a6343' : '#35603f'
  return (
    <g>
      <ellipse cx={x + s * 0.25} cy={y + s * 0.35} rx={s * 1.15} ry={s * 0.85} fill="#101f15" opacity={0.35} />
      <circle cx={x - s * 0.5} cy={y + s * 0.1} r={s * 0.7} fill={c2} />
      <circle cx={x + s * 0.5} cy={y - s * 0.05} r={s * 0.62} fill={c1} />
      <circle cx={x} cy={y - s * 0.42} r={s * 0.66} fill={c1} />
      <circle cx={x - s * 0.15} cy={y - s * 0.18} r={s * 0.52} fill={hi} opacity={0.85} />
    </g>
  )
}

/** Compute drawable placement + ball anchor for every zone. Single source for map & ball. */
function placeZones(layout: HoleLayout, geo: Geo): Map<string, ZonePlace> {
  const L = layout.length
  const out = new Map<string, ZonePlace>()
  const rng = mulberry32(fnv1a(`${layout.spec.number}:${L}:zoneplace`))
  const greenPt = geo.at(L)

  for (const z of layout.zones) {
    const mid = (z.from + z.to) / 2
    const span = Math.max(10, z.to - z.from)
    const sideSign = z.side === 'left' ? 1 : -1 // golfer-left normal
    // greenside = the zone's center sits within a chip of the pin
    const nearGreen = mid > L - 34
    const p = geo.at(mid)
    const n = geo.normalAt(Math.min(mid, L - 1))

    if (z.kind === 'ocean' || (z.kind === 'water' && z.side === 'cross')) {
      // drawn specially (flank / band); anchor for a dropped ball is never needed here
      out.set(z.id, { anchor: { x: p.x + n.x * sideSign * 60, y: p.y + n.y * sideSign * 60 }, ellipses: [], kind: z.kind })
      continue
    }

    if (z.kind === 'trees' || z.kind === 'deeprough') {
      out.set(z.id, {
        anchor: { x: p.x + n.x * sideSign * 58 * geo.zoom, y: p.y + n.y * sideSign * 58 * geo.zoom },
        ellipses: [],
        kind: z.kind,
      })
      continue
    }

    if (z.kind === 'bunker' && z.side === 'cross') {
      // a string of pots across the fairway
      const count = 2 + (span > 22 ? 1 : 0)
      const ellipses = []
      for (let i = 0; i < count; i++) {
        const off = (i - (count - 1) / 2) * 26 * geo.zoom
        const yy = z.from + span * (0.3 + rng() * 0.4)
        const pp = geo.at(yy)
        const nn = geo.normalAt(yy)
        ellipses.push({
          cx: pp.x + nn.x * off,
          cy: pp.y + nn.y * off,
          rx: (11 + rng() * 5) * geo.zoom,
          ry: (7 + rng() * 3) * geo.zoom,
        })
      }
      out.set(z.id, { anchor: { x: ellipses[0].cx, y: ellipses[0].cy }, ellipses, kind: z.kind })
      continue
    }

    if (nearGreen) {
      // greenside features hug the green instead of floating in space
      const gDir = { x: greenPt.x - geo.at(L - 30).x, y: greenPt.y - geo.at(L - 30).y }
      const gLen = Math.hypot(gDir.x, gDir.y) || 1
      const fwd = { x: gDir.x / gLen, y: gDir.y / gLen } // toward/past the pin
      const lat = { x: n.x * sideSign, y: n.y * sideSign }
      // pin-high-ness: how deep along the green this zone sits
      const depth = Math.max(-1, Math.min(0.6, (mid - L) / 30 + 0.35))
      if (z.kind === 'water') {
        const cx = greenPt.x + lat.x * (geo.greenRx + 30 * geo.zoom) + fwd.x * depth * 24
        const cy = greenPt.y + lat.y * (geo.greenRx + 30 * geo.zoom) + fwd.y * depth * 24
        const ell = { cx, cy, rx: (34 + span * 0.25) * geo.zoom, ry: (24 + span * 0.2) * geo.zoom }
        out.set(z.id, { anchor: { x: cx, y: cy }, ellipses: [ell], kind: z.kind })
      } else {
        const cx = greenPt.x + lat.x * (geo.greenRx + 13 * geo.zoom) + fwd.x * depth * 20
        const cy = greenPt.y + lat.y * (geo.greenRx + 13 * geo.zoom) + fwd.y * depth * 20
        const ell = { cx, cy, rx: (14 + rng() * 5) * geo.zoom, ry: (9 + rng() * 4) * geo.zoom }
        out.set(z.id, { anchor: { x: cx, y: cy }, ellipses: [ell], kind: z.kind })
      }
      continue
    }

    // fairway-side features
    const dist = (z.kind === 'bunker' ? 42 : 56) * geo.zoom
    const cx = p.x + n.x * sideSign * dist
    const cy = p.y + n.y * sideSign * dist
    const ell =
      z.kind === 'bunker'
        ? { cx, cy, rx: Math.min(24, 9 + span * 0.3) * geo.zoom, ry: Math.min(15, 8 + span * 0.18) * geo.zoom }
        : { cx, cy, rx: Math.min(40, 14 + span * 0.28) * geo.zoom, ry: Math.min(30, 15 + span * 0.35) * geo.zoom }
    out.set(z.id, { anchor: { x: cx, y: cy }, ellipses: [ell], kind: z.kind })
  }
  return out
}

export function HoleMap(props: {
  layout: HoleLayout
  ball: BallState
  previewWindow: [number, number] | null
  /** approach-style shots: real missed-green probability for the selected choice */
  previewMiss: number | null
  previewChoice: Choice | null
}) {
  const { layout, ball } = props
  const geo = useGeometry(layout)
  const { at, normalAt, tee, zoom, greenRx, greenRy } = geo
  const L = layout.length
  const par3 = layout.spec.par === 3
  const greenPt = at(L)
  const places = useMemo(() => placeZones(layout, geo), [layout, geo])

  // decorative groves along the map edges, kept clear of the playing corridor
  const deco = useMemo(() => {
    const rng = mulberry32(fnv1a(`${layout.spec.number}:${layout.length}:deco`))
    const corridor: Pt[] = []
    for (let i = 0; i <= 10; i++) corridor.push(at((layout.length * i) / 10))
    const groves: { x: number; y: number; s: number; tone: number }[] = []
    for (let i = 0; i < 14 && groves.length < 8; i++) {
      const side = i % 2 === 0 ? 1 : -1
      const g = {
        x: 180 + side * (135 + rng() * 60),
        y: 46 + rng() * 440,
        s: 9 + rng() * 8,
        tone: rng() < 0.5 ? 0 : 1,
      }
      const clear = corridor.every((p) => Math.hypot(p.x - g.x, p.y - g.y) > 96)
      if (clear) groves.push(g)
    }
    return groves
  }, [layout, at])

  // ---- ball position (truth-anchored) ----
  const ballPt: Pt = (() => {
    if (ball.lie === 'green') return greenPt
    const anchored = ball.zoneId ? places.get(ball.zoneId) : null
    if (anchored) return { x: anchored.anchor.x, y: anchored.anchor.y - 2 }
    if (ball.pos > L) {
      // across the green — long side
      const sideX = ball.side === 'left' ? -1 : ball.side === 'right' ? 1 : 0.6
      return { x: greenPt.x + sideX * greenRx * 0.5, y: greenPt.y - greenRy - 9 }
    }
    if ((ball.lie === 'fringe' || ball.lie === 'sand') && ball.pos > L - 42) {
      // greenside but not in a mapped zone: sit just off the green edge
      const sideX = ball.side === 'left' ? -1 : 1
      return { x: greenPt.x + sideX * (greenRx + 9), y: greenPt.y + greenRy * 0.45 }
    }
    const off = (ball.side === 'left' ? 15 : ball.side === 'right' ? -15 : 0) * (ball.lie === 'rough' || ball.lie === 'trees' ? 1.9 : 1)
    const bn = normalAt(Math.min(ball.pos, L - 1))
    const p = at(ball.pos)
    return { x: p.x + bn.x * off, y: p.y + bn.y * off }
  })()

  // ---- zones ----
  const zoneEls = layout.zones.map((z) => {
    const place = places.get(z.id)!
    const span = Math.max(10, z.to - z.from)
    const sideSign = z.side === 'left' ? 1 : -1

    if (z.kind === 'water' && z.side === 'cross') {
      return (
        <path
          key={z.id}
          d={ribbonPath(geo, z.from, z.to, () => 64 * zoom)}
          fill="url(#water)"
          stroke="#3a6d86"
          strokeWidth={1.5}
          opacity={0.95}
        />
      )
    }
    if (z.kind === 'ocean') {
      const pts: string[] = []
      const STEPS = 20
      for (let i = 0; i <= STEPS; i++) {
        const yy = z.from + ((z.to - z.from) * i) / STEPS
        const pp = at(Math.min(yy, L + 20))
        const nn = normalAt(Math.min(yy, L - 1))
        pts.push(`${(pp.x + nn.x * sideSign * 52).toFixed(1)},${(pp.y + nn.y * sideSign * 52).toFixed(1)}`)
      }
      const n = normalAt(Math.min((z.from + z.to) / 2, L - 1))
      const cornerX = sideSign > 0 ? (n.x > 0 ? W + 40 : -40) : n.x < 0 ? W + 40 : -40
      return (
        <path
          key={z.id}
          d={`M${pts.join(' L')} L${cornerX},${at(z.to).y - 30} L${cornerX},${at(z.from).y + 30} Z`}
          fill="url(#water)"
          opacity={0.92}
        />
      )
    }
    if (z.kind === 'trees') {
      const trees = []
      const count = Math.max(2, Math.round(span / 48))
      for (let i = 0; i < count; i++) {
        const yy = z.from + ((z.to - z.from) * (i + 0.5)) / count
        const pp = at(yy)
        const nn = normalAt(yy)
        const wobble = ((i * 37) % 17) - 8
        trees.push(
          <Tree
            key={`${z.id}-${i}`}
            x={pp.x + nn.x * sideSign * (62 * zoom + wobble * 0.6)}
            y={pp.y + nn.y * sideSign * (62 * zoom + wobble * 0.6) + wobble * 0.4}
            s={(10 + ((i * 13) % 5)) * Math.min(zoom, 1.2)}
            tone={i % 2}
          />,
        )
      }
      return <g key={z.id}>{trees}</g>
    }
    if (z.kind === 'deeprough') {
      const pp = place.anchor
      return (
        <g key={z.id} opacity={0.5}>
          <ellipse cx={pp.x} cy={pp.y} rx={30 * zoom} ry={20 * zoom} fill="#28502f" />
          <ellipse cx={pp.x - 14} cy={pp.y + 10} rx={18 * zoom} ry={12 * zoom} fill="#2b5433" />
        </g>
      )
    }
    // bunkers & side/greenside water: pre-placed ellipses
    return (
      <g key={z.id}>
        {place.ellipses.map((e, i) =>
          z.kind === 'bunker' ? (
            <g key={i}>
              <ellipse cx={e.cx} cy={e.cy + 1.5} rx={e.rx} ry={e.ry} fill="#a8916a" opacity={0.7} />
              <ellipse cx={e.cx} cy={e.cy} rx={e.rx} ry={e.ry} fill="#e2d2a8" stroke="#b49b6c" strokeWidth={1.3} />
            </g>
          ) : (
            <ellipse key={i} cx={e.cx} cy={e.cy} rx={e.rx} ry={e.ry} fill="url(#water)" stroke="#3a6d86" strokeWidth={1.5} opacity={0.95} />
          ),
        )}
      </g>
    )
  })

  const previewColor = (c: Choice) => (c === 'safe' ? '#7fb56b' : c === 'normal' ? '#d9c15c' : '#d07a5a')

  const preview =
    props.previewWindow && props.previewChoice ? (
      <path
        d={ribbonPath(geo, props.previewWindow[0], Math.min(props.previewWindow[1], L), () => 34)}
        fill={previewColor(props.previewChoice)}
        opacity={0.32}
        stroke="#f4efe3"
        strokeDasharray="5 5"
        strokeWidth={1.4}
      />
    ) : null

  // Landing ring for approach shots: the green plus a miss margin that grows with
  // the choice's real missed-green odds — the ball can finish anywhere inside it.
  const missRing = (() => {
    if (props.previewMiss == null || !props.previewChoice) return null
    const spread = (6 + props.previewMiss * 95) * Math.min(zoom, 1.2)
    return (
      <ellipse
        cx={greenPt.x}
        cy={greenPt.y}
        rx={greenRx + spread}
        ry={greenRy + spread * 0.8}
        fill={previewColor(props.previewChoice)}
        opacity={0.2}
        stroke="#f4efe3"
        strokeDasharray="5 5"
        strokeWidth={1.4}
      />
    )
  })()

  const yardsLeft = Math.max(0, Math.round(L - ball.pos))
  const labelPt = at(Math.min(ball.pos + (L - ball.pos) / 2, L - 20))

  return (
    <svg className="holemap" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Hole ${layout.spec.number} map, ${yardsLeft} yards to the pin`}>
      <defs>
        <radialGradient id="water" cx="35%" cy="30%" r="80%">
          <stop offset="0" stopColor="#5f9ab8" />
          <stop offset="1" stopColor="#3f7495" />
        </radialGradient>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#31543a" />
          <stop offset="1" stopColor="#22402c" />
        </linearGradient>
        <pattern id="mow" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(22)">
          <rect width="7" height="14" fill="#79ad63" />
          <rect x="7" width="7" height="14" fill="#71a55c" />
        </pattern>
      </defs>

      <rect width={W} height={H} fill="url(#sky)" />

      {/* fairway / apron */}
      {!par3 && (
        <path
          d={ribbonPath(geo, Math.max(30, layout.fairwayFrom - 60), layout.fairwayTo, (t) => (20 + 18 * Math.sin(Math.min(1, t * 1.15) * Math.PI)) * Math.min(zoom, 1.15))}
          fill="#4f7d45"
          stroke="#456f3d"
          strokeWidth={2}
        />
      )}
      {par3 && <path d={ribbonPath(geo, L * 0.62, L - 8, (t) => (10 + 10 * t) * zoom)} fill="#47713f" opacity={0.85} />}

      {/* decorative groves (behind features) */}
      {deco.map((g, i) => (
        <Tree key={i} x={g.x} y={g.y} s={g.s} tone={g.tone} />
      ))}

      {zoneEls}

      {/* green + fringe */}
      <ellipse cx={greenPt.x} cy={greenPt.y} rx={greenRx + 9} ry={greenRy + 8} fill="#8fbc74" opacity={0.55} />
      <ellipse cx={greenPt.x} cy={greenPt.y} rx={greenRx} ry={greenRy} fill="url(#mow)" stroke="#5d9049" strokeWidth={2} />

      {preview}
      {missRing}

      {/* aim line */}
      <path
        d={`M${ballPt.x},${ballPt.y} L${greenPt.x + 6},${greenPt.y - 2}`}
        stroke="#e8d9a0"
        strokeWidth={1.6}
        strokeDasharray="1 7"
        strokeLinecap="round"
        opacity={0.85}
      />

      {/* flag */}
      <g transform={`translate(${greenPt.x + 6}, ${greenPt.y - 2})`}>
        <line x1="0" y1="0" x2="0" y2="-30" stroke="#26301f" strokeWidth={2.4} />
        <path d="M0,-30 L18,-24 L0,-18 Z" fill="#c05b4d" />
        <ellipse cx="0" cy="1.5" rx="4.5" ry="2" fill="#1d2b20" opacity={0.7} />
      </g>

      {/* tee box */}
      <g opacity={0.95}>
        <rect x={tee.x - 16} y={tee.y - 8} width={32} height={18} rx={5} fill="#3f6a3e" stroke="#345c35" />
        <circle cx={tee.x - 7} cy={tee.y + 1} r={3.2} fill="#e8e2cf" stroke="#3c5a41" />
        <circle cx={tee.x + 7} cy={tee.y + 1} r={3.2} fill="#e8e2cf" stroke="#3c5a41" />
      </g>

      {/* ball */}
      {ball.lie !== 'green' && ball.pos > 0 && (
        <g className="ballwrap">
          <ellipse cx={ballPt.x + 1.5} cy={ballPt.y + 2.5} rx={5.5 * Math.min(zoom, 1.2)} ry={3 * Math.min(zoom, 1.2)} fill="#101f15" opacity={0.4} />
          <circle className="ball" cx={ballPt.x} cy={ballPt.y} r={5 * Math.min(zoom, 1.2)} fill="#ffffff" stroke="#26301f" strokeWidth={2} />
        </g>
      )}

      {/* yards-left badge */}
      {yardsLeft > 0 && (
        <g transform={`translate(${Math.max(40, Math.min(W - 40, labelPt.x + 34))}, ${labelPt.y})`}>
          <rect x={-26} y={-11} width={52} height={22} rx={11} fill="#1d2b20" opacity={0.78} />
          <text x={0} y={4.5} textAnchor="middle" fill="#f4efe3" fontSize={12.5} fontWeight={700}>
            {yardsLeft} yd
          </text>
        </g>
      )}
    </svg>
  )
}

/** Putting surface view. */
export function GreenView(props: { feet: number; holeNumber: number; greens: string }) {
  const { feet } = props
  const bend = props.holeNumber % 2 === 0 ? 1 : -1
  const dist = Math.min(215, 46 + feet * 3.4)
  const bx = 180 + bend * Math.min(40, feet * 0.9)
  const holeY = 108
  const ballY = holeY + dist
  return (
    <svg className="holemap" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${feet} foot putt`}>
      <defs>
        <radialGradient id="gsurf" cx="50%" cy="35%" r="85%">
          <stop offset="0" stopColor="#83b167" />
          <stop offset="1" stopColor="#5d8d4b" />
        </radialGradient>
      </defs>
      <rect width={W} height={H} fill="#22402c" />
      <ellipse cx={180} cy={250} rx={230} ry={228} fill="url(#gsurf)" />
      <ellipse cx={180} cy={250} rx={150} ry={148} fill="none" stroke="#f4efe3" strokeWidth={1} opacity={0.18} />
      <ellipse cx={180} cy={250} rx={82} ry={80} fill="none" stroke="#f4efe3" strokeWidth={1} opacity={0.18} />
      <path
        d={`M180,${ballY} Q${bx},${(ballY + holeY) / 2} 180,${holeY + 10}`}
        fill="none"
        stroke="#f4efe3"
        strokeWidth={3}
        strokeDasharray="2 10"
        strokeLinecap="round"
        opacity={0.9}
      />
      <ellipse cx={180} cy={holeY} rx={7} ry={4.5} fill="#1d2b20" />
      <g transform={`translate(180, ${holeY})`}>
        <line x1="0" y1="0" x2="0" y2="-44" stroke="#26301f" strokeWidth={2.6} />
        <path d="M0,-44 L22,-36 L0,-29 Z" fill="#c05b4d" />
      </g>
      <circle cx={180} cy={ballY} r={7} fill="#f7f5ee" stroke="#26301f" strokeWidth={1.6} />
    </svg>
  )
}

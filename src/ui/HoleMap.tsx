import { useCallback, useMemo, useRef, useState } from 'react'
import type { ApproachOdds, BallState, Choice, HazardZone, HoleLayout } from '../engine/types'
import { fnv1a, mulberry32 } from '../engine/rng'

const W = 360
const H = 520

export interface MapSize {
  w: number
  h: number
}

/**
 * Measured size of the map panel, so the SVG viewBox can match its aspect
 * instead of letterboxing a fixed portrait frame inside a short, wide box.
 * Callback ref rather than an effect: the panel doesn't exist until the play
 * view renders, so observation has to start whenever the element appears.
 */
export function useMapSize(): [(el: HTMLDivElement | null) => void, MapSize | null] {
  const [size, setSize] = useState<MapSize | null>(null)
  const observer = useRef<ResizeObserver | null>(null)
  const ref = useCallback((el: HTMLDivElement | null) => {
    observer.current?.disconnect()
    observer.current = null
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect
      if (r.width > 0 && r.height > 0) setSize({ w: Math.round(r.width), h: Math.round(r.height) })
    })
    ro.observe(el)
    observer.current = ro
  }, [])
  return [ref, size]
}

interface Frame {
  w: number
  h: number
  cx: number
  yTop: number
  yBottom: number
}

/**
 * Screen anchors for the camera window: view start / view end along the
 * centerline. Margins keep the flag clear of the floating top banner and the
 * tee box clear of the bottom chip overlay at any panel height.
 */
function cameraFrame(size: MapSize | null, bottomInset = 0): Frame {
  const w = size?.w ?? W
  const h = size?.h ?? H
  const yTop = Math.min(84, Math.max(58, h * 0.16))
  // bottomInset reserves extra room for a taller bottom overlay (e.g. the
  // signature pill adds a second row above the hazard chips), so the tee ball
  // isn't parked behind it
  const yBottom = h - Math.min(64, Math.max(42, h * 0.11)) - bottomInset
  return { w, h, cx: w / 2, yTop, yBottom }
}

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

/**
 * Camera window in yards. From the tee you see the whole hole; after that the
 * view runs from just behind the ball to just past the green — ball low, green
 * high — so the scale grows as you close in. Never tighter than ~90 yards back
 * from the pin, so short-game views keep the green and its surrounds in frame.
 */
function viewWindow(layout: HoleLayout, ball: BallState): [number, number] {
  const L = layout.length
  const past = 22
  if (ball.pos <= 0) return [0, L + past]
  return [Math.max(0, Math.min(ball.pos - 15, L - 90)), L + past]
}

/**
 * Sampled centerline with arc-length parametrization plus a similarity
 * transform that maps the camera window onto the screen. Everything downstream
 * works in *yards* and converts via uPerYd, so drawn sizes are honest at every
 * zoom level — the green included.
 */
function useGeometry(layout: HoleLayout, view: [number, number], fr: Frame) {
  return useMemo(() => {
    const { dogleg } = layout.spec
    const L = layout.length
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
    const worldPerYd = total / L
    const endDir = (() => {
      const dx = pts[N].x - pts[N - 1].x
      const dy = pts[N].y - pts[N - 1].y
      const len = Math.hypot(dx, dy) || 1
      return { x: dx / len, y: dy / len }
    })()
    const worldAt = (yards: number): Pt => {
      if (yards > L) {
        return { x: pts[N].x + endDir.x * (yards - L) * worldPerYd, y: pts[N].y + endDir.y * (yards - L) * worldPerYd }
      }
      const target = Math.max(0, yards / L) * total
      let i = 1
      while (i < N && cum[i] < target) i++
      const seg = cum[i] - cum[i - 1] || 1
      const f = (target - cum[i - 1]) / seg
      return {
        x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * f,
        y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * f,
      }
    }

    // camera: rotate + scale the window chord onto the vertical screen axis
    const [vFrom, vTo] = view
    const P0 = worldAt(vFrom)
    const P1 = worldAt(vTo)
    const c = Math.hypot(P1.x - P0.x, P1.y - P0.y) || 1
    const ux = (P1.x - P0.x) / c
    const uy = (P1.y - P0.y) / c
    const s = (fr.yBottom - fr.yTop) / c
    const uPerYd = s * worldPerYd

    const at = (yards: number): Pt => {
      const w = worldAt(yards)
      const dx = w.x - P0.x
      const dy = w.y - P0.y
      return { x: fr.cx + s * (-uy * dx + ux * dy), y: fr.yBottom + s * (-ux * dx - uy * dy) }
    }
    /** golfer-left unit normal at yards, in screen space */
    const normalAt = (yards: number): Pt => {
      const a = worldAt(Math.max(0, yards - 6))
      const b = worldAt(yards + 6)
      const dx = b.x - a.x
      const dy = b.y - a.y
      const len = Math.hypot(dx, dy) || 1
      const nx = dy / len
      const ny = -dx / len
      return { x: -uy * nx + ux * ny, y: -ux * nx - uy * ny }
    }

    // honest green: sized from the hole's real green depth, slightly wider than deep
    const rng = mulberry32(fnv1a(`${layout.spec.number}:${layout.length}:shape`))
    const greenRy = Math.max(7, (layout.greenDepth / 2) * uPerYd)
    const greenRx = greenRy * (1.3 + rng() * 0.3)

    return { at, normalAt, view, uPerYd, greenRx, greenRy }
  }, [layout, view[0], view[1], fr.w, fr.h]) // eslint-disable-line react-hooks/exhaustive-deps
}

type Geo = ReturnType<typeof useGeometry>

function ribbonPath(geo: Geo, from: number, to: number, widthYd: (t: number) => number): string {
  const STEPS = 26
  const leftPts: string[] = []
  const rightPts: string[] = []
  for (let i = 0; i <= STEPS; i++) {
    const t = i / STEPS
    const yards = from + (to - from) * t
    const p = geo.at(yards)
    const n = geo.normalAt(yards)
    const w = widthYd(t) * geo.uPerYd
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

/** clamp a yard-based size into a readable on-screen range */
const clampPx = (px: number, min: number, max: number) => Math.max(min, Math.min(max, px))

/**
 * Compute drawable placement + ball anchor for every zone. Single source for
 * map & ball. All placements are at the zone's true yardage; lateral offsets
 * are in yards from the centerline, past the real fairway/green footprint —
 * so nothing near the green can hide underneath it.
 */
function placeZones(layout: HoleLayout, geo: Geo): Map<string, ZonePlace> {
  const L = layout.length
  const u = geo.uPerYd
  const out = new Map<string, ZonePlace>()
  const rng = mulberry32(fnv1a(`${layout.spec.number}:${L}:zoneplace`))
  const greenRxYd = geo.greenRx / u
  const greenFrom = L - layout.greenDepth / 2 - 2

  for (const z of layout.zones) {
    const mid = (z.from + z.to) / 2
    const span = Math.max(10, z.to - z.from)
    const sideSign = z.side === 'left' ? 1 : -1 // golfer-left normal
    const p = geo.at(mid)
    const n = geo.normalAt(Math.min(mid, L - 1))
    // corridor half-width at this yardage: green footprint near the pin, fairway otherwise
    const corridorYd = mid > greenFrom ? greenRxYd : 15

    if (z.kind === 'ocean' || (z.kind === 'water' && z.side === 'cross')) {
      // drawn specially (flank / band); anchor for a dropped ball is never needed here
      out.set(z.id, { anchor: { x: p.x + n.x * sideSign * 40 * u, y: p.y + n.y * sideSign * 40 * u }, ellipses: [], kind: z.kind })
      continue
    }

    if (z.kind === 'trees' || z.kind === 'deeprough') {
      const off = (corridorYd + 11) * u
      out.set(z.id, {
        anchor: { x: p.x + n.x * sideSign * off, y: p.y + n.y * sideSign * off },
        ellipses: [],
        kind: z.kind,
      })
      continue
    }

    if (z.kind === 'bunker' && z.side === 'cross') {
      // a string of pots across the corridor, at their true yardage — in front
      // of the green when the zone is greenside, never underneath it
      const count = 2 + (span > 22 ? 1 : 0)
      const potRx = clampPx(Math.min(8, 3 + span * 0.2) * u, 7, 26)
      const ellipses = []
      for (let i = 0; i < count; i++) {
        const off = (i - (count - 1) / 2) * potRx * 2.3
        const yy = Math.min(z.from + span * (0.3 + rng() * 0.4), greenFrom - 4)
        const pp = geo.at(yy)
        const nn = geo.normalAt(yy)
        ellipses.push({
          cx: pp.x + nn.x * off,
          cy: pp.y + nn.y * off,
          rx: potRx,
          ry: potRx * 0.62,
        })
      }
      out.set(z.id, { anchor: { x: ellipses[0].cx, y: ellipses[0].cy }, ellipses, kind: z.kind })
      continue
    }

    // side bunkers & ponds: true yardage, just past the corridor edge
    const rxYd = z.kind === 'bunker' ? Math.min(10, 4 + span * 0.25) : Math.min(22, 9 + span * 0.35)
    const offYd = corridorYd + rxYd * 0.75 + 2
    const cx = p.x + n.x * sideSign * offYd * u
    const cy = p.y + n.y * sideSign * offYd * u
    const ell =
      z.kind === 'bunker'
        ? { cx, cy, rx: clampPx(rxYd * u, 8, 30), ry: clampPx(rxYd * 0.62 * u, 5, 19) }
        : { cx, cy, rx: clampPx(rxYd * u, 14, 48), ry: clampPx(rxYd * 0.7 * u, 10, 34) }
    out.set(z.id, { anchor: { x: cx, y: cy }, ellipses: [ell], kind: z.kind })
  }
  return out
}

export function HoleMap(props: {
  layout: HoleLayout
  ball: BallState
  previewWindow: [number, number] | null
  /** approach-style shots: the full odds distribution for the selected choice */
  previewApproach: ApproachOdds | null
  previewChoice: Choice | null
  /** measured panel size (from useMapSize) — omit to fall back to the classic 360×520 frame */
  size?: MapSize | null
  /** extra bottom room to reserve, in px, when a taller overlay (e.g. the
   * signature pill) sits over the tee */
  bottomInset?: number
  /** the record-round ghost's ball for this hole/shot — faded, ambient,
   * never reconciled with the live ball (pace race, not an overlay) */
  ghostBall?: BallState | null
}) {
  const { layout, ball } = props
  const fr = cameraFrame(props.size ?? null, props.bottomInset ?? 0)
  const view = viewWindow(layout, ball)
  const geo = useGeometry(layout, view, fr)
  const { at, normalAt, uPerYd, greenRx, greenRy } = geo
  const L = layout.length
  const par3 = layout.spec.par === 3
  const greenPt = at(L)
  const vFrom = view[0]
  const places = useMemo(() => placeZones(layout, geo), [layout, geo])
  const treeSize = (base: number) => clampPx(base * uPerYd, 7, 22)

  // decorative groves flanking the corridor, anchored in world yards so they
  // track the camera; sizes clamp so zoomed views don't grow monster trees
  const deco = useMemo(() => {
    const rng = mulberry32(fnv1a(`${layout.spec.number}:${layout.length}:deco`))
    const groves: { yards: number; lat: number; size: number; tone: number }[] = []
    for (let i = 0; i < 10; i++) {
      const side = i % 2 === 0 ? 1 : -1
      groves.push({
        yards: rng() * (layout.length + 30),
        lat: side * (36 + rng() * 26),
        size: 8 + rng() * 5,
        tone: rng() < 0.5 ? 0 : 1,
      })
    }
    return groves
  }, [layout])

  // ---- ball position (truth-anchored) — shared by the live ball and the
  // record-round ghost, so both sit on the same geometry ----
  const placeBall = (b: BallState): Pt => {
    if (b.lie === 'green') return greenPt
    const anchored = b.zoneId ? places.get(b.zoneId) : null
    if (anchored) return { x: anchored.anchor.x, y: anchored.anchor.y - 2 }
    if (b.pos > L) {
      // across the green — long side
      const sideX = b.side === 'left' ? -1 : b.side === 'right' ? 1 : 0.6
      return { x: greenPt.x + sideX * greenRx * 0.5, y: greenPt.y - greenRy - 4 * uPerYd }
    }
    if ((b.lie === 'fringe' || b.lie === 'sand') && b.pos > L - 42) {
      // greenside but not in a mapped zone: sit just off the green edge
      const sideX = b.side === 'left' ? -1 : 1
      return { x: greenPt.x + sideX * (greenRx + 4 * uPerYd), y: greenPt.y + greenRy * 0.45 }
    }
    const offYd = (b.side === 'left' ? 1 : b.side === 'right' ? -1 : 0) * (b.lie === 'rough' || b.lie === 'trees' ? 20 : 10)
    const bn = normalAt(Math.min(b.pos, L - 1))
    const p = at(b.pos)
    return { x: p.x + bn.x * offYd * uPerYd, y: p.y + bn.y * offYd * uPerYd }
  }
  const ballPt: Pt = placeBall(ball)
  // the ghost never competes with the live ball: skip it when the two would
  // overlap, and render it under everything the player reads for decisions
  const ghostPt: Pt | null = props.ghostBall ? placeBall(props.ghostBall) : null
  const ghostVisible = ghostPt && Math.hypot(ghostPt.x - ballPt.x, ghostPt.y - ballPt.y) > 8

  // ---- zones ----
  const zoneEls = layout.zones.map((z) => {
    const place = places.get(z.id)!
    const span = Math.max(10, z.to - z.from)
    const sideSign = z.side === 'left' ? 1 : -1

    if (z.kind === 'water' && z.side === 'cross') {
      return (
        <path
          key={z.id}
          d={ribbonPath(geo, z.from, z.to, () => 28)}
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
        pts.push(`${(pp.x + nn.x * sideSign * 30 * uPerYd).toFixed(1)},${(pp.y + nn.y * sideSign * 30 * uPerYd).toFixed(1)}`)
      }
      const n = normalAt(Math.min((z.from + z.to) / 2, L - 1))
      const cornerX = sideSign > 0 ? (n.x > 0 ? fr.w + 40 : -40) : n.x < 0 ? fr.w + 40 : -40
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
      const from = Math.max(z.from, vFrom - 10)
      if (z.to > from) {
        const visSpan = z.to - from
        const count = Math.max(2, Math.round((visSpan / span) * Math.max(2, Math.round(span / 48))))
        for (let i = 0; i < count; i++) {
          const yy = from + (visSpan * (i + 0.5)) / count
          const pp = at(yy)
          const nn = normalAt(yy)
          const wobble = ((i * 37) % 17) - 8
          const offYd = (yy > L - layout.greenDepth ? geo.greenRx / uPerYd : 15) + 11 + wobble * 0.5
          trees.push(
            <Tree
              key={`${z.id}-${i}`}
              x={pp.x + nn.x * sideSign * offYd * uPerYd}
              y={pp.y + nn.y * sideSign * offYd * uPerYd + wobble * 0.4}
              s={treeSize(9 + ((i * 13) % 4))}
              tone={i % 2}
            />,
          )
        }
      }
      return <g key={z.id}>{trees}</g>
    }
    if (z.kind === 'deeprough') {
      const pp = place.anchor
      return (
        <g key={z.id} opacity={0.5}>
          <ellipse cx={pp.x} cy={pp.y} rx={clampPx(14 * uPerYd, 12, 40)} ry={clampPx(9 * uPerYd, 8, 27)} fill="#28502f" />
          <ellipse cx={pp.x - 14} cy={pp.y + 10} rx={clampPx(8 * uPerYd, 8, 24)} ry={clampPx(5 * uPerYd, 5, 16)} fill="#2b5433" />
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
        d={ribbonPath(geo, Math.max(props.previewWindow[0], vFrom), Math.min(props.previewWindow[1], L), () => 14)}
        fill={previewColor(props.previewChoice)}
        opacity={0.32}
        stroke="#f4efe3"
        strokeDasharray="5 5"
        strokeWidth={1.4}
      />
    ) : null

  // Two-ring approach preview, both driven by the real odds distribution.
  // Outer ring: how far a miss can travel — severity-weighted, so harmless
  // fringe misses barely grow it while sand and water blow it out. Inner ring:
  // expected finish proximity for on-green outcomes, from the same putt-feet
  // model resolve.ts uses. Safe reads as "tight outer, wide inner" (few misses,
  // longer putts); aggressive as "wide outer, tiny inner" (pin-high or trouble).
  const missRing = (() => {
    if (!props.previewApproach || !props.previewChoice) return null
    const o = props.previewApproach
    const ch = props.previewChoice
    const color = previewColor(ch)

    const spreadYd = 4 + o.fringe * 22 + o.sand * 55 + o.water * 110
    const spread = spreadYd * uPerYd

    const makeFeet = 5 + (ch === 'aggressive' ? 8 : 13) / 2
    const lagFeet = 24 + (ch === 'safe' ? 22 : 32) / 2
    const onGreen = o.holeout + o.kickin + o.makeable + o.lag
    const feet = (o.kickin * 2 + o.makeable * makeFeet + o.lag * lagFeet) / Math.max(0.0001, onGreen)
    const innerR = Math.min(greenRy * 0.95, Math.max(6, (feet / 3) * 1.15 * uPerYd))

    return (
      <g>
        <ellipse
          cx={greenPt.x}
          cy={greenPt.y}
          rx={greenRx + spread}
          ry={greenRy + spread * 0.8}
          fill={color}
          opacity={0.18}
          stroke="#f4efe3"
          strokeDasharray="5 5"
          strokeWidth={1.4}
        />
        <ellipse
          cx={greenPt.x}
          cy={greenPt.y}
          rx={innerR}
          ry={innerR * 0.8}
          fill={color}
          fillOpacity={0.28}
          stroke="#f4efe3"
          strokeDasharray="2 4"
          strokeWidth={1.6}
        />
      </g>
    )
  })()

  const yardsLeft = Math.max(0, Math.round(L - ball.pos))
  const labelPt = at(Math.min(ball.pos + (L - ball.pos) / 2, L - 20))
  const teePt = at(0)
  const ballR = clampPx(5 * Math.sqrt(uPerYd), 4.5, 8)

  return (
    <svg className="holemap" viewBox={`0 0 ${fr.w} ${fr.h}`} role="img" aria-label={`Hole ${layout.spec.number} map, ${yardsLeft} yards to the pin`}>
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

      <rect width={fr.w} height={fr.h} fill="url(#sky)" />

      {/* fairway / apron */}
      {!par3 && (
        <path
          d={ribbonPath(geo, Math.max(Math.max(30, layout.fairwayFrom - 60), vFrom - 10), layout.fairwayTo, (t) => 13 + 8 * Math.sin(Math.min(1, t * 1.15) * Math.PI))}
          fill="#4f7d45"
          stroke="#456f3d"
          strokeWidth={2}
        />
      )}
      {par3 && <path d={ribbonPath(geo, Math.max(L * 0.62, vFrom), L - layout.greenDepth / 2, (t) => 7 + 7 * t)} fill="#47713f" opacity={0.85} />}

      {/* decorative groves (behind features) */}
      {deco.map((g, i) => {
        const p = at(g.yards)
        const n = normalAt(Math.min(g.yards, L - 1))
        return <Tree key={i} x={p.x + n.x * g.lat * uPerYd} y={p.y + n.y * g.lat * uPerYd} s={treeSize(g.size)} tone={g.tone} />
      })}

      {zoneEls}

      {/* green + fringe, at true scale */}
      <ellipse cx={greenPt.x} cy={greenPt.y} rx={greenRx + clampPx(3.5 * uPerYd, 4, 12)} ry={greenRy + clampPx(3 * uPerYd, 4, 10)} fill="#8fbc74" opacity={0.55} />
      <ellipse cx={greenPt.x} cy={greenPt.y} rx={greenRx} ry={greenRy} fill="url(#mow)" stroke="#5d9049" strokeWidth={2} />

      {preview}
      {missRing}

      {/* aim line */}
      <path
        d={`M${ballPt.x},${ballPt.y} L${greenPt.x},${greenPt.y - 2}`}
        stroke="#e8d9a0"
        strokeWidth={1.6}
        strokeDasharray="1 7"
        strokeLinecap="round"
        opacity={0.85}
      />

      {/* flag */}
      <g transform={`translate(${greenPt.x}, ${greenPt.y - 2})`}>
        <line x1="0" y1="0" x2="0" y2="-30" stroke="#26301f" strokeWidth={2.4} />
        <path d="M0,-30 L18,-24 L0,-18 Z" fill="#c05b4d" />
        <ellipse cx="0" cy="1.5" rx="4.5" ry="2" fill="#1d2b20" opacity={0.7} />
      </g>

      {/* tee box, only while it's in frame */}
      {vFrom < 8 && (
        <g opacity={0.95}>
          <rect x={teePt.x - 16} y={teePt.y - 10} width={32} height={18} rx={5} fill="#3f6a3e" stroke="#345c35" />
          <circle cx={teePt.x - 7} cy={teePt.y - 1} r={3.2} fill="#e8e2cf" stroke="#3c5a41" />
          <circle cx={teePt.x + 7} cy={teePt.y - 1} r={3.2} fill="#e8e2cf" stroke="#3c5a41" />
        </g>
      )}

      {/* the record round's ghost — atmosphere, drawn under the live ball.
          Divergence from the player's ball is expected and never reconciled:
          the pace chip is the truth, this is the record-setter walking the
          course on their own luck. */}
      {ghostVisible && ghostPt && (
        <circle
          className="ghost-ball"
          cx={ghostPt.x}
          cy={ghostPt.y}
          r={ballR * 0.9}
          fill="#f4efe3"
          stroke="#26301f"
          strokeWidth={1.2}
          strokeDasharray="2 2"
          opacity={0.45}
        />
      )}
      {/* ball */}
      {ball.lie !== 'green' && ball.pos > 0 && (
        <g className="ballwrap">
          <ellipse cx={ballPt.x + 1.5} cy={ballPt.y + 2.5} rx={ballR * 1.1} ry={ballR * 0.6} fill="#101f15" opacity={0.4} />
          <circle className="ball" cx={ballPt.x} cy={ballPt.y} r={ballR} fill="#ffffff" stroke="#26301f" strokeWidth={2} />
        </g>
      )}
      {ball.lie !== 'green' && ball.pos <= 0 && (
        <circle className="ball" cx={teePt.x} cy={teePt.y - 1} r={5} fill="#ffffff" stroke="#26301f" strokeWidth={2} />
      )}

      {/* yards-left badge */}
      {yardsLeft > 0 && (
        <g
          transform={`translate(${Math.max(40, Math.min(fr.w - 40, labelPt.x + 34))}, ${
            yardsLeft <= 35 ? labelPt.y - 30 : labelPt.y // short shots: float above so the ball stays visible
          })`}
        >
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
export function GreenView(props: { feet: number; holeNumber: number; greens: string; size?: MapSize | null }) {
  const { feet } = props
  const { w, h, cx } = cameraFrame(props.size ?? null)
  // green fills the panel height; putt length scales with it
  const k = h / H
  const bend = props.holeNumber % 2 === 0 ? 1 : -1
  const dist = Math.min(215, 46 + feet * 3.4) * k
  const bx = cx + bend * Math.min(40, feet * 0.9) * k
  // floor keeps the flag (44 units tall) clear of the floating status pill
  const holeY = Math.max(108 * k, 92)
  const ballY = holeY + dist
  return (
    <svg className="holemap" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`${feet} foot putt`}>
      <defs>
        <radialGradient id="gsurf" cx="50%" cy="35%" r="85%">
          <stop offset="0" stopColor="#83b167" />
          <stop offset="1" stopColor="#5d8d4b" />
        </radialGradient>
      </defs>
      <rect width={w} height={h} fill="#22402c" />
      <ellipse cx={cx} cy={250 * k} rx={Math.max(230 * k, w * 0.68)} ry={228 * k} fill="url(#gsurf)" />
      <ellipse cx={cx} cy={250 * k} rx={150 * k} ry={148 * k} fill="none" stroke="#f4efe3" strokeWidth={1} opacity={0.18} />
      <ellipse cx={cx} cy={250 * k} rx={82 * k} ry={80 * k} fill="none" stroke="#f4efe3" strokeWidth={1} opacity={0.18} />
      <path
        d={`M${cx},${ballY} Q${bx},${(ballY + holeY) / 2} ${cx},${holeY + 10}`}
        fill="none"
        stroke="#f4efe3"
        strokeWidth={3}
        strokeDasharray="2 10"
        strokeLinecap="round"
        opacity={0.9}
      />
      <ellipse cx={cx} cy={holeY} rx={7} ry={4.5} fill="#1d2b20" />
      <g transform={`translate(${cx}, ${holeY})`}>
        <line x1="0" y1="0" x2="0" y2="-44" stroke="#26301f" strokeWidth={2.6} />
        <path d="M0,-44 L22,-36 L0,-29 Z" fill="#c05b4d" />
      </g>
      <circle cx={cx} cy={ballY} r={7} fill="#f7f5ee" stroke="#26301f" strokeWidth={1.6} />
    </svg>
  )
}

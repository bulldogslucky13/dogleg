import { useCallback, useMemo, useRef, useState } from 'react'
import type { ApproachOdds, BallState, Choice, HazardZone, HoleLayout, PinPosition } from '../engine/types'
import { fnv1a, mulberry32 } from '../engine/rng'

const W = 360
const H = 520

/**
 * How far off green-center today's pin sits, as a fraction of the green's
 * radius — shared by the top-down map (pinPt, aim ring, flag) and GreenView
 * (holeX), so a tucked pin reads as more hidden than a middle or open one in
 * BOTH views, and there's exactly one place to retune the offsets. `center`
 * pins use frac 0 (sign is 0 too, so it's moot) — kept for completeness.
 */
const PIN_OFFSET_FRAC: Record<PinPosition['tier'], number> = { open: 0.28, middle: 0.45, tucked: 0.62 }

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

// height of the "CADDY'S READ" label row + its gap to the chip row below it —
// CaddyThoughts adds this row above the chips on every hole that has any, so
// it's reserved unconditionally, not just for the signature-pill case
const CADDY_LABEL_ROW = 20

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
  // signature pill adds a second row above the caddy's read), so the tee ball
  // isn't parked behind it
  const yBottom = h - Math.min(64, Math.max(42, h * 0.11)) - CADDY_LABEL_ROW - bottomInset
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

// Hazard kinds whose importer-split zones we stitch back into one drawn shape.
// Ocean (a seaward half-plane) and trees/deeprough (scattered sprites) are not
// footprint hazards, so they keep their own rendering.
const MERGE_KINDS = new Set<HazardZone['kind']>(['bunker', 'water'])

/** Signed lateral band [lo, hi] (yards from centreline, golfer-left positive)
 * that a single zone covers at a given yardage. `cor` is the corridor
 * half-width in yards there. Water carries more visual body than sand and sits
 * a touch further off the corridor edge, matching the old lake/pond look. */
function zoneBand(z: HazardZone, cor: number): [number, number] {
  const span = Math.max(10, z.to - z.from)
  const water = z.kind === 'water'
  const w = water ? Math.min(34, 12 + span * 0.22) : Math.min(12, 5 + span * 0.18)
  const edge = water ? cor + 1 : cor // water laps just past the short grass
  const cross = water ? cor + 4 : cor + 2
  if (z.side === 'left') return [edge, edge + w]
  if (z.side === 'right') return [-(edge + w), -edge]
  return [-cross, cross] // cross / green: strung across the corridor
}

/** Two zones belong to the same physical hazard when they're the same kind,
 * abut in yardage, AND their lateral footprints overlap — exactly what the OSM
 * importer splits one diagonal bunker or one body of water into (left → cross →
 * right as the centreline curves past it). Opposite-side flanking hazards (a
 * left and a right bunker with no cross between) never overlap, so they stay
 * separate shapes. */
export function zonesAdjacent(a: HazardZone, b: HazardZone): boolean {
  if (a.kind !== b.kind) return false
  const gap = Math.max(a.from, b.from) - Math.min(a.to, b.to)
  if (gap > 6) return false
  // relative overlap only — a fixed corridor width is fine for the test
  const [aLo, aHi] = zoneBand(a, 15)
  const [bLo, bHi] = zoneBand(b, 15)
  return Math.min(aHi, bHi) >= Math.max(aLo, bLo)
}

/** Group a hole's mergeable zones into runs of physically-continuous same-kind
 * zones (the connected components of the adjacency relation), preserving array
 * order for stable z-indexing. A run of length ≥2 is drawn as one merged shape;
 * singletons render on their existing path. */
export function hazardRuns(zones: HazardZone[]): HazardZone[][] {
  const mergeable = zones.filter((z) => MERGE_KINDS.has(z.kind))
  const byYard = [...mergeable].sort((p, q) => p.from - q.from)
  const runs: HazardZone[][] = []
  for (const z of byYard) {
    // A zone can bridge SEVERAL existing runs at once — e.g. a `cross` bunker
    // touching a `right` run below it and a `left` run above it (Harbour Town
    // 17's green-wrapping bunker). Coalesce every run it joins, not just the
    // first, or the connected component renders as separate shapes.
    const bridged = runs.filter((r) => r.some((m) => zonesAdjacent(m, z)))
    if (bridged.length === 0) {
      runs.push([z])
      continue
    }
    bridged[0].push(z)
    for (let k = 1; k < bridged.length; k++) {
      bridged[0].push(...bridged[k])
      runs.splice(runs.indexOf(bridged[k]), 1)
    }
  }
  return runs
}

/** Continuous outline hugging the union footprint of a merged run — one organic
 * waste-bunker or water shape instead of a chain of separate blobs. Water runs
 * taper at their ends so a lake reads as a body, not a slab. */
function hazardBandPath(
  geo: Geo,
  run: HazardZone[],
  greenFrom: number,
  greenRxYd: number,
  L: number,
): string {
  const from = Math.min(...run.map((z) => z.from))
  const to = Math.max(...run.map((z) => z.to))
  const water = run[0].kind === 'water'
  const STEPS = Math.max(10, Math.round((to - from) / 5))
  const hiPts: string[] = []
  const loPts: string[] = []
  let prev: [number, number] | null = null
  for (let i = 0; i <= STEPS; i++) {
    const t = i / STEPS
    const y = from + (to - from) * t
    const cor = y > greenFrom ? greenRxYd : 15
    let lo = Infinity
    let hi = -Infinity
    for (const z of run) {
      if (y < z.from - 2 || y > z.to + 2) continue
      const [zLo, zHi] = zoneBand(z, cor)
      lo = Math.min(lo, zLo)
      hi = Math.max(hi, zHi)
    }
    // a rounding-gap yard with no active zone: carry the previous band so the
    // outline stays continuous rather than collapsing to the centreline
    if (lo === Infinity) {
      if (!prev) continue
      ;[lo, hi] = prev
    }
    prev = [lo, hi]
    // taper water toward the extreme ends so a lake pinches to a point
    const taper = water ? Math.min(1, 6 * t * (1 - t) + 0.25) : 1
    const wob = Math.sin(y * 0.7) * 0.6 // gentle edge waviness (yards)
    const p = geo.at(Math.min(y, L - 1))
    const n = geo.normalAt(Math.min(y, L - 1))
    const u = geo.uPerYd
    const mid = (lo + hi) / 2
    const hiO = mid + (hi - mid) * taper + wob
    const loO = mid + (lo - mid) * taper + wob
    hiPts.push(`${(p.x + n.x * hiO * u).toFixed(1)},${(p.y + n.y * hiO * u).toFixed(1)}`)
    loPts.unshift(`${(p.x + n.x * loO * u).toFixed(1)},${(p.y + n.y * loO * u).toFixed(1)}`)
  }
  return `M${hiPts.join(' L')} L${loPts.join(' L')} Z`
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
 * Harbour Town's candy-striped lighthouse, drawn behind the green as flavor.
 * `s` is the tower height in px; everything scales off it. Purely decorative —
 * gated on the hole's `landmark` field, never in play.
 */
function Lighthouse({ x, y, s }: { x: number; y: number; s: number }) {
  const wTop = s * 0.26
  const wBot = s * 0.42
  const bands = 6
  const bandH = s / bands
  const stripes = []
  for (let i = 0; i < bands; i++) {
    // trapezoid slice for band i (0 = top of tower)
    const t0 = i / bands
    const t1 = (i + 1) / bands
    const w0 = wTop + (wBot - wTop) * t0
    const w1 = wTop + (wBot - wTop) * t1
    const y0 = y + bandH * i
    const y1 = y + bandH * (i + 1)
    stripes.push(
      <path
        key={i}
        d={`M${x - w0 / 2},${y0} L${x + w0 / 2},${y0} L${x + w1 / 2},${y1} L${x - w1 / 2},${y1} Z`}
        fill={i % 2 === 0 ? '#c9463b' : '#f4efe3'}
      />,
    )
  }
  const galleryW = wTop * 1.5
  return (
    <g aria-hidden opacity={0.96}>
      <ellipse cx={x + s * 0.05} cy={y + s + bandH * 0.25} rx={wBot * 0.75} ry={s * 0.06} fill="#101f15" opacity={0.3} />
      {/* tower */}
      <g stroke="#8a3730" strokeWidth={0.6}>{stripes}</g>
      {/* gallery deck */}
      <rect x={x - galleryW / 2} y={y - s * 0.06} width={galleryW} height={s * 0.07} rx={s * 0.015} fill="#3a2c26" />
      {/* lantern room */}
      <rect x={x - wTop * 0.42} y={y - s * 0.2} width={wTop * 0.84} height={s * 0.15} rx={s * 0.02} fill="#8fb8cf" stroke="#3a2c26" strokeWidth={0.8} />
      {/* roof + finial */}
      <path d={`M${x - wTop * 0.5},${y - s * 0.2} L${x + wTop * 0.5},${y - s * 0.2} L${x},${y - s * 0.34} Z`} fill="#2b2320" />
      <line x1={x} y1={y - s * 0.34} x2={x} y2={y - s * 0.4} stroke="#2b2320" strokeWidth={1} />
      <circle cx={x} cy={y - s * 0.41} r={s * 0.02} fill="#2b2320" />
    </g>
  )
}

/** flank water at least this long is a lake shoreline, not a pond ellipse */
const LAKE_SPAN_YD = 60

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

    if (z.kind === 'ocean' || (z.kind === 'water' && (z.side === 'cross' || z.to - z.from >= LAKE_SPAN_YD))) {
      // drawn specially (flank / band / lake shoreline); anchor for a dropped
      // ball is never needed here
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

  // Merge the zones the OSM importer split from one physical hazard (a waste
  // bunker or a body of water read as left → cross → right as the centreline
  // curves past it) back into a single drawn shape. `mergedFirst` maps a run's
  // leading zone id to the whole run; `mergedRest` are the follower ids to skip
  // while rendering (the run is drawn once, at its first member).
  const { mergedFirst, mergedRest } = useMemo(() => {
    const first = new Map<string, HazardZone[]>()
    const rest = new Set<string>()
    for (const run of hazardRuns(layout.zones)) {
      if (run.length < 2) continue
      const inOrder = layout.zones.filter((z) => run.includes(z))
      first.set(inOrder[0].id, inOrder)
      for (const z of inOrder.slice(1)) rest.add(z.id)
    }
    return { mergedFirst: first, mergedRest: rest }
  }, [layout])
  const greenFromYd = L - layout.greenDepth / 2 - 2
  const greenRxYd = greenRx / uPerYd

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

  // where the flag actually stands on the green (par-3 pin side) — shared by
  // the flag sprite, the approach preview's aim point, and the on-green ball
  const pinPt: Pt = (() => {
    const pin = layout.pin
    const pn = normalAt(L - 1)
    const pinSign = pin?.side === 'left' ? 1 : pin?.side === 'right' ? -1 : 0
    const off = pinSign * PIN_OFFSET_FRAC[pin?.tier ?? 'middle'] * greenRx
    return { x: greenPt.x + pn.x * off, y: greenPt.y + pn.y * off }
  })()

  // ---- ball position (truth-anchored) — shared by the live ball and the
  // record-round ghost, so both sit on the same geometry ----
  const placeBall = (b: BallState): Pt => {
    if (b.lie === 'green') {
      // on the green the truth is puttFeet-from-the-CUP: rest the ball that
      // far from the pin, biased toward the fat middle (where every aim
      // shades) — a kick-in hugs the flag, a lag sits out toward center
      const feet = b.puttFeet ?? 0
      if (feet <= 0) return pinPt
      const d = (feet / 3) * uPerYd
      const dx = greenPt.x - pinPt.x
      const dy = greenPt.y - pinPt.y
      const dl = Math.hypot(dx, dy)
      if (dl < 1) {
        // center pin: the miss is short of the hole, toward the front edge
        return { x: pinPt.x, y: pinPt.y + Math.min(d, greenRy * 0.85) }
      }
      // cap at 1.7× the pin→center distance so a monster lag can pass the
      // middle but never rolls off the far edge of the drawing
      const reach = Math.min(d, dl * 1.7)
      return { x: pinPt.x + (dx / dl) * reach, y: pinPt.y + (dy / dl) * reach }
    }
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

    // Importer-split hazard stitched back together: draw the whole run once, at
    // its first member, as one continuous shape (skips the per-side paths below).
    if (mergedRest.has(z.id)) return null // already drawn as part of its run
    const run = mergedFirst.get(z.id)
    if (run) {
      const d = hazardBandPath(geo, run, greenFromYd, greenRxYd, L)
      return z.kind === 'water' ? (
        <path key={z.id} d={d} fill="url(#water)" stroke="#3a6d86" strokeWidth={1.5} strokeLinejoin="round" opacity={0.95} />
      ) : (
        <g key={z.id}>
          <path d={d} fill="#a8916a" opacity={0.7} transform="translate(0 1.5)" />
          <path d={d} fill="#e2d2a8" stroke="#b49b6c" strokeWidth={1.3} strokeLinejoin="round" />
        </g>
      )
    }

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
    if (z.kind === 'water' && z.to - z.from >= LAKE_SPAN_YD) {
      // a lake running the flank: draw the shoreline at its true yardage — a
      // capped pond ellipse would shrink 150 yards of water into a puddle
      // (Palm Beach's Intracoastal lakes). Lens-shaped: pinched at the ends,
      // widest mid-zone, hugging just outside the corridor.
      const STEPS = 22
      const inner: string[] = []
      const outer: string[] = []
      for (let i = 0; i <= STEPS; i++) {
        const t = i / STEPS
        const yy = z.from + (z.to - z.from) * t
        const pp = at(Math.min(yy, L + 20))
        const nn = normalAt(Math.min(yy, L - 1))
        const pinch = Math.min(1, 4 * t * (1 - t) + 0.3)
        const iOff = 16 * uPerYd
        const oOff = (16 + 30 * pinch) * uPerYd
        inner.push(`${(pp.x + nn.x * sideSign * iOff).toFixed(1)},${(pp.y + nn.y * sideSign * iOff).toFixed(1)}`)
        outer.push(`${(pp.x + nn.x * sideSign * oOff).toFixed(1)},${(pp.y + nn.y * sideSign * oOff).toFixed(1)}`)
      }
      return (
        <path
          key={z.id}
          d={`M${inner.join(' L')} L${outer.reverse().join(' L')} Z`}
          fill="url(#water)"
          stroke="#3a6d86"
          strokeWidth={1.5}
          strokeLinejoin="round"
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
    // singleton bunkers & side/greenside water: pre-placed ellipses
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

    // The inner ring is the AIM: safe plays the fat middle, aggressive fires
    // straight at the flag, normal splits the difference. The outer (miss)
    // ring stays centered on the green — a miss sprays off the whole target.
    const aimT = ch === 'aggressive' ? 1 : ch === 'normal' ? 0.5 : 0
    const aimX = greenPt.x + (pinPt.x - greenPt.x) * aimT
    const aimY = greenPt.y + (pinPt.y - greenPt.y) * aimT

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
          cx={aimX}
          cy={aimY}
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

      {/* landmark beside the green (Harbour Town lighthouse) — on the land side
          (right; water is left), base near the green's height so it reads as
          standing on the point behind the putting surface */}
      {layout.spec.landmark === 'lighthouse' &&
        (() => {
          const s = clampPx(34 * uPerYd, 40, 66)
          return <Lighthouse x={greenPt.x + greenRx + s * 0.7} y={greenPt.y - s * 0.72} s={s} />
        })()}

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

      {/* flag — standing at today's pin (par-3 side offset, see pinPt) */}
      <g transform={`translate(${pinPt.x}, ${pinPt.y - 2})`}>
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
export function GreenView(props: {
  feet: number
  holeNumber: number
  greens: string
  /** today's pin (par 3s): shifts the cup toward its real side of the green */
  pin?: PinPosition
  size?: MapSize | null
}) {
  const { feet, pin } = props
  const { w, h, cx, yBottom } = cameraFrame(props.size ?? null)
  // green fills the panel height; putt length scales with it
  const k = h / H
  const bend = props.holeNumber % 2 === 0 ? 1 : -1
  // floor keeps the flag (44 units tall) clear of the floating status pill
  const holeY = Math.max(108 * k, 92)
  // capped at yBottom so a long lag putt's ball never sits behind the
  // caddy's-read overlay at the bottom of the panel
  const dist = Math.min(Math.min(215, 46 + feet * 3.4) * k, Math.max(0, yBottom - holeY))
  const ballY = holeY + dist
  // the cup sits where the pin actually is: golfer faces the green from the
  // ball, so pin-left is screen-left; a tucked flag hides near the edge, an
  // open one sits fat. No pin (par 4s/5s, pre-pin saves) = classic center cup.
  const greenRx = Math.max(230 * k, w * 0.68)
  // GreenView faces the green head-on (always north-up), unlike the top-down
  // map's geometry-normal orientation — so "left" here is screen-left
  // directly, opposite sign from HoleMap's pinPt. Tier magnitude comes from
  // the SAME table as the map, so a tucked pin reads equally hidden in both.
  const pinSign = pin?.side === 'left' ? -1 : pin?.side === 'right' ? 1 : 0
  const pinFrac = pin ? PIN_OFFSET_FRAC[pin.tier] : 0
  const holeX = cx + pinSign * pinFrac * greenRx * 0.72
  // the ball rests where it truly is: a short putt hugs the flag's side of
  // the green, a long lag drifts back toward the fat middle (every aim
  // shades that way) — so the drawn gap always tracks puttFeet
  const ballX = holeX + (cx - holeX) * Math.min(1, feet / 40)
  const bx = (ballX + holeX) / 2 + bend * Math.min(40, feet * 0.9) * k
  return (
    <svg className="holemap" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`${feet} foot putt`}>
      <defs>
        <radialGradient id="gsurf" cx="50%" cy="35%" r="85%">
          <stop offset="0" stopColor="#83b167" />
          <stop offset="1" stopColor="#5d8d4b" />
        </radialGradient>
      </defs>
      <rect width={w} height={h} fill="#22402c" />
      <ellipse cx={cx} cy={250 * k} rx={greenRx} ry={228 * k} fill="url(#gsurf)" />
      <ellipse cx={cx} cy={250 * k} rx={150 * k} ry={148 * k} fill="none" stroke="#f4efe3" strokeWidth={1} opacity={0.18} />
      <ellipse cx={cx} cy={250 * k} rx={82 * k} ry={80 * k} fill="none" stroke="#f4efe3" strokeWidth={1} opacity={0.18} />
      <path
        d={`M${ballX},${ballY} Q${bx},${(ballY + holeY) / 2} ${holeX},${holeY + 10}`}
        fill="none"
        stroke="#f4efe3"
        strokeWidth={3}
        strokeDasharray="2 10"
        strokeLinecap="round"
        opacity={0.9}
      />
      <ellipse cx={holeX} cy={holeY} rx={7} ry={4.5} fill="#1d2b20" />
      <g transform={`translate(${holeX}, ${holeY})`}>
        <line x1="0" y1="0" x2="0" y2="-44" stroke="#26301f" strokeWidth={2.6} />
        <path d="M0,-44 L22,-36 L0,-29 Z" fill="#c05b4d" />
      </g>
      <circle cx={ballX} cy={ballY} r={7} fill="#f7f5ee" stroke="#26301f" strokeWidth={1.6} />
    </svg>
  )
}

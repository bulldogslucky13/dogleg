/**
 * OSM → Dogleg geometry importer (PROTOTYPE).
 *
 * Pulls real course geography from OpenStreetMap (Overpass API) and projects
 * it onto the engine's 1-D tee→pin hole line, producing the same
 * {length, zones, fairwayFrom, fairwayTo, greenDepth} shape that
 * src/engine/layout.ts synthesizes procedurally.
 *
 * Data © OpenStreetMap contributors, ODbL. Attribution required if shipped.
 *
 * Run (Node 24+, native TS strip, global fetch):
 *   pnpm import:osm sawgrass 17            # human-readable zone report
 *   pnpm import:osm sawgrass 17 --compare  # OSM vs the procedural layout we ship
 *   pnpm import:osm sawgrass 17 --json     # emit layout JSON only
 *   pnpm import:osm sawgrass 17 --raw      # dump matched OSM features
 *   pnpm import:osm sawgrass 17 --debug    # ring counts + per-ring extents
 *   pnpm import:osm sawgrass 17 --fresh    # bypass the per-course Overpass cache
 *
 * Registry: COURSE_GEO below maps a short slug → course center, the exact
 * golf_course polygon name (osmName), and the engine slug (for --compare).
 * Add an entry per course you want to import.
 *
 * Known gaps (prototype):
 *  - OSM coverage varies; obscure courses may lack golf=hole centerlines, and
 *    many resorts have no natural=wood polygons even where trees define the
 *    course (Sea Pines) — hand-author `trees` zones when identity demands it
 *    (see harbour-town:18 in engine/geometry.ts).
 *  - Ocean IS handled (natural=coastline rasterised as a seaward half-plane,
 *    see OCEAN_REACH_YD below) — but tidal marsh is often mapped as
 *    natural=water/wetland polygons instead, so sound-side holes may come
 *    through as `water`; relabel to `ocean` by hand where the flavor fits
 *    (pebble 7/8, harbour-town 18).
 *
 * This is a build-time tool. Output is meant to be reviewed and committed as
 * static data — nothing here runs in the app or touches the network at runtime.
 *
 * FOLLOW-UP after committing new/updated geometry: run `pnpm gen:ratings` and
 * review the printed table. A course's displayed Play Rating is measured from
 * how it plays in the engine (see scripts/gen-play-ratings.ts), so swapping
 * procedural geometry for real geometry changes its difficulty — the whole
 * point of the pull — and the rating must be regenerated to reflect it, or the
 * badge will keep showing the old procedural number.
 *
 * LANDMARK PASS while QA-ing against imagery: if a hole has a classic,
 * instantly-recognizable structure (Harbour Town 18's lighthouse, a famous
 * clubhouse, the Swilcan Bridge), set `landmark` on the hole tuple in
 * courses.ts — extending the Landmark union in engine/types.ts and adding a
 * sprite in ui/HoleMap.tsx if it's a new kind. Cosmetic only, never in the
 * odds or replay, so it's always versioning-safe. See scripts/README.md
 * step 5 of the freeze process.
 */

// Let --compare import the engine's extensionless TS modules (./rng etc.) —
// vite resolves those, bare Node ESM doesn't, so add the .ts on retry.
import { registerHooks } from 'node:module'
registerHooks({
  resolve(spec, ctx, next) {
    try {
      return next(spec, ctx)
    } catch (e) {
      if (spec.startsWith('.') && !/\.[cm]?[jt]s$/.test(spec)) return next(spec + '.ts', ctx)
      throw e
    }
  },
})

// ---------- course registry (prototype: just enough to find features) ----------
// center scopes the query; osmName pins the exact golf_course polygon so we don't
// pull in neighbouring courses (Pebble/Spyglass/Peter Hay all share one radius).
// osmHolePrefix disambiguates courses that share a site and thus share hole
// `ref`s (TPC Sawgrass Stadium vs its Dye's Valley course) — OSM names the hole
// ways "Stadium 2" / "Valley 2", so we prefer the ones whose name matches.
type CourseGeo = {
  name: string
  center: [number, number]
  radius?: number
  osmName: string
  osmHolePrefix?: string
  engineSlug: string
  /** holes packed tighter than ~40yd apart (par-3 shorts): assign BUNKERS
   * strictly to the nearest hole line, or a neighbour's sand bleeds into the
   * corridor. Water keeps the looser rule — shared lakes genuinely border
   * several holes at once. */
  packed?: boolean
}

const COURSE_GEO: Record<string, CourseGeo> = {
  sawgrass: { name: 'TPC Sawgrass — Stadium', center: [30.1985, -81.396], radius: 1400, osmName: 'Stadium Course', osmHolePrefix: 'Stadium', engineSlug: 'tpc-sawgrass' },
  augusta: { name: 'Augusta National', center: [33.5021, -82.0233], radius: 1600, osmName: 'Augusta National', engineSlug: 'augusta-national' },
  pebble: { name: 'Pebble Beach Links', center: [36.5686, -121.9497], radius: 2500, osmName: 'Pebble Beach Golf', engineSlug: 'pebble-beach' },
  palmbeach: { name: 'Palm Beach Par 3', center: [26.6321, -80.0385], radius: 1200, osmName: 'Palm Beach Par 3', engineSlug: 'palm-beach-par-3', packed: true },
  cobblestone: { name: 'Cobblestone Creek', center: [35.1638, -97.4215], radius: 900, osmName: 'Cobblestone Creek', engineSlug: 'cobblestone-creek', packed: true },
  harbourtown: { name: 'Harbour Town Golf Links', center: [32.1307, -80.8093], radius: 1600, osmName: 'Harbour Town Golf Links', engineSlug: 'harbour-town' },
  // Carnoustie shares its site with Burnside/Buddon/Nestie; Championship hole
  // ways are named "6. Hogan's Alley" (siblings use "(6) …" / "[6] …"), so the
  // prefix regex pins the right ref=N per hole.
  carnoustie: { name: 'Carnoustie — Championship', center: [56.4936, -2.7272], radius: 1600, osmName: 'The Carnoustie Championship Course', osmHolePrefix: '^\\d+\\.', engineSlug: 'carnoustie' },
}

// ---------- Overpass ----------
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
]
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

type OsmTags = Record<string, string>
type LatLon = { lat: number; lon: number }
type OsmElement = {
  type: 'node' | 'way' | 'relation'
  id: number
  tags?: OsmTags
  geometry?: LatLon[] // present on ways/rels with `out geom`
  members?: { type: string; ref: number; role: string; geometry?: LatLon[] }[]
}

async function fetchOverpass(query: string): Promise<OsmElement[]> {
  let lastErr: unknown
  // try each mirror; retry the transient "server busy" 504/429 a couple times
  for (const url of OVERPASS_ENDPOINTS) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'dogleg-osm-importer/0.1 (golf course geometry prototype)',
          },
          body: 'data=' + encodeURIComponent(query),
        })
        if (res.status === 504 || res.status === 429) {
          console.error(`  ${new URL(url).host}: ${res.status}, retrying …`)
          await sleep(2000 * (attempt + 1))
          continue
        }
        if (!res.ok) throw new Error(`Overpass ${res.status}: ${await res.text()}`)
        const json = (await res.json()) as { elements: OsmElement[] }
        return json.elements
      } catch (e) {
        lastErr = e
        console.error(`  ${new URL(url).host}: ${(e as Error).message.split('\n')[0]}`)
        await sleep(1000)
      }
    }
  }
  throw lastErr ?? new Error('all Overpass endpoints failed')
}

function golfQuery(geo: CourseGeo): string {
  const [lat, lon] = geo.center
  const r = geo.radius ?? 1500
  // Scope golf features to the named golf_course polygon (keeps neighbouring
  // courses out); pull water bodies by radius since ponds/lakes often carry no
  // golf tag and can straddle the course boundary.
  return `[out:json][timeout:180];
(
  way["leisure"="golf_course"]["name"~"${geo.osmName}",i](around:${r},${lat},${lon});
  relation["leisure"="golf_course"]["name"~"${geo.osmName}",i](around:${r},${lat},${lon});
)->.gc;
.gc map_to_area->.a;
(
  way["golf"](area.a);
  relation["golf"](area.a);
  way["natural"="water"](around:${r},${lat},${lon});
  relation["natural"="water"](around:${r},${lat},${lon});
  way["natural"="coastline"](around:${r},${lat},${lon});
  way["natural"="wood"](area.a);
  relation["natural"="wood"](area.a);
  way["landuse"="forest"](area.a);
  relation["landuse"="forest"](area.a);
);
out geom;`
}

// ---------- geo math: lat/lon → local meters → yards ----------
const M_PER_YARD = 0.9144

/** Equirectangular projection around a reference lat, good for course-scale distances. */
function projector(refLat: number, refLon: number) {
  const R = 6_371_000
  const cosLat = Math.cos((refLat * Math.PI) / 180)
  return (p: LatLon): [number, number] => {
    const x = ((p.lon - refLon) * Math.PI) / 180 * R * cosLat
    const y = ((p.lat - refLat) * Math.PI) / 180 * R
    return [x, y] // meters, east/north
  }
}

type Vec = [number, number]
const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1]]
const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1]
const len = (a: Vec) => Math.hypot(a[0], a[1])
const cross = (a: Vec, b: Vec) => a[0] * b[1] - a[1] * b[0]

/**
 * Chaikin corner-cutting: turns a coarse hole centreline (OSM gives 2–5 points)
 * into a smooth curve so the perpendicular normal rotates GRADUALLY through a
 * bend instead of snapping at a kink — which is what flipped a right-side creek
 * onto the left for part of its length. Endpoints (tee, green) are preserved;
 * a straight 2-point line is returned unchanged.
 */
function chaikin(pts: Vec[], iters: number): Vec[] {
  let out = pts
  for (let it = 0; it < iters; it++) {
    if (out.length < 3) break
    const next: Vec[] = [out[0]]
    for (let i = 0; i < out.length - 1; i++) {
      const a = out[i]
      const b = out[i + 1]
      next.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25])
      next.push([a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75])
    }
    next.push(out[out.length - 1])
    out = next
  }
  return out
}

/** Cumulative arc length (meters) at each vertex of a polyline. */
function arcLengths(pts: Vec[]): number[] {
  const acc = [0]
  for (let i = 1; i < pts.length; i++) acc.push(acc[i - 1] + len(sub(pts[i], pts[i - 1])))
  return acc
}

/**
 * Project a point onto a polyline. Returns distance ALONG the line (meters from
 * start) and signed lateral offset (>0 = left of travel direction, <0 = right).
 */
function projectToPolyline(pts: Vec[], cum: number[], q: Vec): { along: number; lateral: number } {
  let best = { d2: Infinity, along: 0, lateral: 0 }
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]
    const b = pts[i + 1]
    const ab = sub(b, a)
    const abLen = len(ab)
    if (abLen < 1e-6) continue
    let t = dot(sub(q, a), ab) / (abLen * abLen)
    t = Math.max(0, Math.min(1, t))
    const proj: Vec = [a[0] + ab[0] * t, a[1] + ab[1] * t]
    const d = sub(q, proj)
    const d2 = dot(d, d)
    if (d2 < best.d2) {
      const along = cum[i] + abLen * t
      // left/right via z of cross(direction, toPoint)
      const lateral = cross([ab[0] / abLen, ab[1] / abLen], sub(q, proj))
      best = { d2, along, lateral }
    }
  }
  return { along: best.along, lateral: best.lateral }
}

const toYards = (m: number) => m / M_PER_YARD
const toMeters = (yd: number) => yd * M_PER_YARD

/** Point at arc-length `a` (meters) along the polyline, with unit travel direction. */
function pointAtArc(pts: Vec[], cum: number[], a: number): { p: Vec; dir: Vec } {
  const total = cum[cum.length - 1]
  a = Math.max(0, Math.min(total, a))
  let i = 0
  while (i < cum.length - 2 && cum[i + 1] < a) i++
  const seg = sub(pts[i + 1], pts[i])
  const segLen = len(seg) || 1
  const t = (a - cum[i]) / segLen
  const dir: Vec = [seg[0] / segLen, seg[1] / segLen]
  return { p: [pts[i][0] + seg[0] * t, pts[i][1] + seg[1] * t], dir }
}

/**
 * Cosmetic dogleg profile: signed lateral deviation (yards, >0 = golfer-left)
 * of the smoothed centreline from the straight tee→green chord, sampled at
 * BEND_SAMPLES+1 evenly-spaced fractions. Endpoints are ~0 by construction; the
 * max-magnitude sample marks where — and how hard — the hole actually turns.
 * Map-only: the odds engine works in 1-D and never sees this, so it is not
 * odds- or replay-affecting.
 */
const BEND_SAMPLES = 12
function bendProfile(center: Vec[], cum: number[]): number[] {
  const total = cum[cum.length - 1]
  const tee = center[0]
  const end = center[center.length - 1]
  const chord = sub(end, tee)
  const chordLen = len(chord) || 1
  const dir: Vec = [chord[0] / chordLen, chord[1] / chordLen]
  const out: number[] = []
  for (let i = 0; i <= BEND_SAMPLES; i++) {
    const { p } = pointAtArc(center, cum, (i / BEND_SAMPLES) * total)
    out.push(Math.round(toYards(cross(dir, sub(p, tee)))))
  }
  return out
}

/**
 * Nearest coastline test. OSM draws coastline with the SEA on the right of the
 * way direction (land on the left), so the signed side of the closest segment
 * tells us whether `q` is over water. Returns null if no coastline is near.
 */
function seaSide(coast: Vec[][], q: Vec, maxDistM: number): boolean | null {
  let bestD2 = Infinity
  let sea: boolean | null = null
  for (const line of coast) {
    for (let i = 0; i < line.length - 1; i++) {
      const a = line[i]
      const b = line[i + 1]
      const ab = sub(b, a)
      const abLen = len(ab)
      if (abLen < 1e-6) continue
      let t = dot(sub(q, a), ab) / (abLen * abLen)
      t = Math.max(0, Math.min(1, t))
      const proj: Vec = [a[0] + ab[0] * t, a[1] + ab[1] * t]
      const d2 = dot(sub(q, proj), sub(q, proj))
      if (d2 < bestD2) {
        bestD2 = d2
        // cross(dir, q-a) < 0 ⇒ q is to the RIGHT of travel ⇒ seaward
        sea = cross(ab, sub(q, a)) < 0
      }
    }
  }
  if (sea === null || bestD2 > maxDistM * maxDistM) return null
  return sea
}

/** Ray-cast point-in-polygon (ring = projected meters). */
function pointInRing(ring: Vec[], q: Vec): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (yi > q[1] !== yj > q[1] && q[0] < ((xj - xi) * (q[1] - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** All outer rings of an element as lat/lon loops (ways: one; relations: each outer member). */
function elementRings(e: OsmElement): LatLon[][] {
  if (e.geometry && e.geometry.length >= 3) return [e.geometry]
  if (e.members) {
    return e.members
      .filter((m) => m.role !== 'inner' && m.geometry && m.geometry.length >= 3)
      .map((m) => m.geometry!)
  }
  return []
}

function centroid(ring: Vec[]): Vec {
  let x = 0
  let y = 0
  for (const p of ring) {
    x += p[0]
    y += p[1]
  }
  return [x / ring.length, y / ring.length]
}

// ---------- feature classification ----------
type ZoneKind = 'water' | 'ocean' | 'bunker' | 'trees' | 'deeprough'
function classify(tags: OsmTags): ZoneKind | 'green' | 'tee' | 'fairway' | 'hole' | null {
  const g = tags.golf
  if (g === 'green') return 'green'
  if (g === 'tee') return 'tee'
  if (g === 'fairway') return 'fairway'
  if (g === 'hole') return 'hole'
  if (g === 'bunker') return 'bunker'
  if (g === 'water_hazard' || g === 'lateral_water_hazard') return 'water'
  if (g === 'rough') return 'deeprough'
  if (tags.natural === 'water' || tags.water) return 'water'
  if (tags.natural === 'wood' || tags.landuse === 'forest') return 'trees'
  return null
}

/** Merge same-kind/same-side fragments whose spans overlap or nearly touch. */
function mergeZones<T extends { kind: string; from: number; to: number; side: string }>(raws: T[]): T[] {
  const GAP = 8 // yards; bridge tiny gaps from split polygons
  const out: T[] = []
  const sorted = [...raws].sort((a, b) => a.from - b.from)
  for (const r of sorted) {
    const hit = out.find((o) => o.kind === r.kind && o.side === r.side && r.from <= o.to + GAP && r.to >= o.from - GAP)
    if (hit) {
      hit.from = Math.min(hit.from, r.from)
      hit.to = Math.max(hit.to, r.to)
    } else {
      out.push({ ...r })
    }
  }
  return out.sort((a, b) => a.from - b.from)
}

// ---------- main ----------
async function main() {
  const [slug, holeArg, ...flags] = process.argv.slice(2)
  if (!slug || !holeArg) {
    console.error('usage: node scripts/import-osm.ts <courseSlug> <holeNumber> [--json|--raw]')
    process.exit(1)
  }
  const holeNo = Number(holeArg)
  const geo = COURSE_GEO[slug]
  if (!geo) {
    console.error(`no geo registry entry for "${slug}". known: ${Object.keys(COURSE_GEO).join(', ')}`)
    process.exit(1)
  }

  // cache Overpass responses per course so iteration doesn't re-hit the network
  const cacheFile = `${process.env.TMPDIR ?? '/tmp'}/osm-${slug}.json`
  let els: OsmElement[]
  const { readFileSync, writeFileSync, existsSync } = await import('node:fs')
  if (!flags.includes('--fresh') && existsSync(cacheFile)) {
    els = JSON.parse(readFileSync(cacheFile, 'utf8'))
    console.error(`  ${els.length} golf features (cached ${cacheFile})`)
  } else {
    console.error(`fetching OSM golf features near ${geo.name} …`)
    els = await fetchOverpass(golfQuery(geo))
    writeFileSync(cacheFile, JSON.stringify(els))
    console.error(`  ${els.length} golf features returned (cached)`)
  }

  // the hole centerline: golf=hole way with matching ref. Neighboring courses
  // (Pebble/Spyglass/Del Monte in one radius) each have a hole `ref`, and a
  // shared site (Sawgrass Stadium vs Valley) even shares the whole numbering —
  // so disambiguate first by hole NAME (osmHolePrefix), then by nearest center.
  const centerProj = projector(geo.center[0], geo.center[1])
  const c0 = centerProj({ lat: geo.center[0], lon: geo.center[1] })
  let candidates = els.filter(
    (e) => e.tags?.golf === 'hole' && String(e.tags.ref ?? '') === String(holeNo) && e.geometry,
  )
  if (candidates.length === 0) {
    const refs = [...new Set(els.filter((e) => e.tags?.golf === 'hole').map((e) => e.tags?.ref))].sort()
    console.error(`no golf=hole way with ref=${holeNo}. available refs: [${refs.join(', ')}]`)
    process.exit(2)
  }
  if (geo.osmHolePrefix) {
    const re = new RegExp(geo.osmHolePrefix, 'i')
    const named = candidates.filter((e) => re.test(e.tags?.name ?? ''))
    if (named.length) candidates = named
    else console.error(`  no hole name matched /${geo.osmHolePrefix}/i; falling back to nearest-center`)
  }
  const holeWay = candidates.sort((a, b) => {
    const da = len(sub(centerProj(a.geometry![0]), c0))
    const db = len(sub(centerProj(b.geometry![0]), c0))
    return da - db
  })[0]
  if (candidates.length > 1) console.error(`  ${candidates.length} candidates for ref=${holeNo}; chose nearest to center`)

  // reference frame anchored at the tee end of the hole line
  const line = holeWay.geometry
  const proj = projector(line[0].lat, line[0].lon)
  const center: Vec[] = chaikin(line.map(proj), 2)
  const cum = arcLengths(center)
  const holeLenM = cum[cum.length - 1]
  const length = Math.round(toYards(holeLenM))

  if (flags.includes('--raw')) {
    const rows = els
      .filter((e) => classify(e.tags ?? {}))
      .map((e) => ({ id: e.id, kind: classify(e.tags ?? {}), tags: e.tags }))
    console.log(JSON.stringify({ holeRef: holeNo, length, features: rows }, null, 2))
    return
  }

  // --- corridor rasterization ---
  // Walk the hole line yard by yard; at each step probe a lateral rake of points
  // and point-in-polygon test them against every hazard. This handles surrounding
  // water (island greens), doglegs, and crossing hazards that vertex-projection
  // mangles. `side` falls out of which offsets hit.
  const CORRIDOR_YD = 50 // how far left/right we care about
  const OCEAN_REACH_YD = 160 // how far out to look for a set-back cliff line
  const STEP_YD = 2
  const RAKE_YD = 6 // lateral sample spacing
  const CENTER_YD = 10 // |offset| within this counts as "on the line" → crossing

  // pre-project every hazard ring once, keep only rings near the corridor
  type Ring = { kind: ZoneKind | 'green'; ring: Vec[] }
  const rings: Ring[] = []
  for (const e of els) {
    if (e === holeWay) continue
    const k = classify(e.tags ?? {})
    if (!k || k === 'tee' || k === 'fairway' || k === 'hole') continue
    for (const loop of elementRings(e)) {
      const ring = loop.map(proj)
      // Keep a ring only if an EDGE of it comes near the line. A real hazard
      // borders the playing corridor; a course-spanning lake that the coarse
      // straight centreline merely clips through at a dogleg has all its edges
      // far away — that was the phantom "water crosses at 0 yds" on Sawgrass 2.
      let nearestEdge = Infinity
      for (const p of ring) {
        const { along, lateral } = projectToPolyline(center, cum, p)
        const al = toYards(along)
        if (al > -25 && al < length + 25) nearestEdge = Math.min(nearestEdge, toYards(Math.abs(lateral)))
      }
      if (nearestEdge < 48) rings.push({ kind: k, ring })
    }
  }

  // coastline polylines near the corridor (the sea is the RIGHT side of the way)
  const coast: Vec[][] = []
  for (const e of els) {
    if (e.tags?.natural !== 'coastline' || !e.geometry || e.geometry.length < 2) continue
    const line = e.geometry.map(proj)
    let near = false
    for (const p of line) {
      const { along, lateral } = projectToPolyline(center, cum, p)
      const al = toYards(along)
      if (al > -60 && al < length + 60 && toYards(Math.abs(lateral)) < CORRIDOR_YD + 150) {
        near = true
        break
      }
    }
    if (near) coast.push(line)
  }

  if (flags.includes('--oceandbg') && coast.length) {
    const nearestSea = (a: number, side: number) => {
      const { p, dir } = pointAtArc(center, cum, toMeters(a))
      const nrm: Vec = [-dir[1], dir[0]]
      for (let off = 2; off <= 250; off += 3) {
        const o = side * off
        const q: Vec = [p[0] + nrm[0] * toMeters(o), p[1] + nrm[1] * toMeters(o)]
        if (seaSide(coast, q, toMeters(400)) === true) return off
      }
      return null
    }
    for (let a = 0; a <= length; a += 15) {
      console.error(`  [odbg] along ${String(a).padStart(3)}yd  sea-left ${nearestSea(a, 1) ?? '—'}  sea-right ${nearestSea(a, -1) ?? '—'}`)
    }
  }

  if (flags.includes('--debug')) {
    console.error(`  [dbg] coastline segments in corridor: ${coast.length}`)
    const byk: Record<string, number> = {}
    for (const r of rings) byk[r.kind] = (byk[r.kind] ?? 0) + 1
    console.error(`  [dbg] rings in corridor: ${JSON.stringify(byk)}`)
    for (const { kind, ring } of rings.filter((r) => r.kind === 'water' || r.kind === 'green')) {
      let aLo = Infinity
      let aHi = -Infinity
      let pLo = Infinity
      let pHi = -Infinity
      for (const p of ring) {
        const { along, lateral } = projectToPolyline(center, cum, p)
        aLo = Math.min(aLo, toYards(along))
        aHi = Math.max(aHi, toYards(along))
        pLo = Math.min(pLo, toYards(lateral))
        pHi = Math.max(pHi, toYards(lateral))
      }
      console.error(
        `  [dbg] ${kind} along ${aLo.toFixed(0)}–${aHi.toFixed(0)}  lateral ${pLo.toFixed(0)}..${pHi.toFixed(0)}`,
      )
    }
  }

  // ---------- ocean (rasterised half-plane) + green (centre-line) ----------
  type Hit = { left: boolean; right: boolean; center: boolean }
  const seriesByKind = new Map<ZoneKind, Map<number, Hit>>() // ocean only now
  const record = (kind: ZoneKind, a: number, off: number) => {
    let byAlong = seriesByKind.get(kind)
    if (!byAlong) seriesByKind.set(kind, (byAlong = new Map()))
    const hit = byAlong.get(a) ?? { left: false, right: false, center: false }
    if (Math.abs(off) <= CENTER_YD) hit.center = true
    if (off > 0) hit.left = true
    else if (off < 0) hit.right = true
    byAlong.set(a, hit)
  }
  const coastReach = toMeters(CORRIDOR_YD + 120)

  // green depth: the along span where the centre line runs through a green
  let greenLo = Infinity
  let greenHi = -Infinity
  for (let a = 0; a <= length; a += STEP_YD) {
    const p = pointAtArc(center, cum, toMeters(a)).p
    for (const { kind, ring } of rings) {
      if (kind === 'green' && pointInRing(ring, p)) {
        greenLo = Math.min(greenLo, a)
        greenHi = Math.max(greenHi, a)
        break
      }
    }
  }

  // ocean is everything seaward of the coastline — sample the rake for it only
  if (coast.length) {
    for (let a = 0; a <= length; a += STEP_YD) {
      const { p, dir } = pointAtArc(center, cum, toMeters(a))
      const nrm: Vec = [-dir[1], dir[0]] // left-hand normal (+offset = left)
      for (let off = -CORRIDOR_YD; off <= CORRIDOR_YD; off += RAKE_YD) {
        const q: Vec = [p[0] + nrm[0] * toMeters(off), p[1] + nrm[1] * toMeters(off)]
        if (seaSide(coast, q, coastReach) === true) record('ocean', a, off)
      }
    }
  }

  // Ocean is a half-plane, not a polygon. Where the cliff is set back beyond the
  // rake, the fairway sits inland yet still has the sea down that flank. Pick the
  // hole's ocean side from the reliable near-rake hits (a wrapping bay shore can
  // otherwise fake the opposite side), then probe outward to fill every along on
  // that side so the water renders as one continuous edge.
  const oceanHits = seriesByKind.get('ocean')
  if (coast.length && oceanHits) {
    let leftN = 0
    let rightN = 0
    for (const h of oceanHits.values()) {
      if (h.left) leftN++
      if (h.right) rightN++
    }
    const s = rightN >= leftN ? -1 : 1 // -1 ⇒ ocean on the right (off<0)
    // A green that juts into the sea (Pebble 7) has ocean CLOSE on the far side
    // too, but only around the green. Allow the non-dominant side there with a
    // TIGHT reach — close enough to be the same promontory, not a bay shore an
    // OCEAN_REACH away (which is exactly the Carmel Bay false positive we reject
    // by keeping the fairway strictly one-sided).
    const WRAP_REACH_YD = 75
    const greenStart = isFinite(greenLo) ? greenLo - 12 : length - 30
    const probe = (a: number, side: number, reach: number) => {
      const { p, dir } = pointAtArc(center, cum, toMeters(a))
      const nrm: Vec = [-dir[1], dir[0]]
      for (let off = RAKE_YD; off <= reach; off += RAKE_YD) {
        const o = side * off
        const q: Vec = [p[0] + nrm[0] * toMeters(o), p[1] + nrm[1] * toMeters(o)]
        if (seaSide(coast, q, coastReach) === true) {
          record('ocean', a, o)
          return
        }
      }
    }
    for (let a = 0; a <= length; a += STEP_YD) {
      probe(a, s, OCEAN_REACH_YD) // dominant flank: full reach, whole hole
      if (a >= greenStart) probe(a, -s, WRAP_REACH_YD) // wrap: near the green only, tight
    }
  }

  // ---------- discrete hazards (water / bunker / trees) ----------
  // Rasterise the corridor, but with a SMOOTHED normal so a coarse centreline
  // that kinks near the green can't flip a hazard onto the wrong side, and only
  // over rings THIS hole owns — a neighbour's sand in a tight corridor otherwise
  // bleeds in. (Both were the failure modes on Sawgrass's complex holes.)
  const holeLines = els
    .filter(
      (e) =>
        e.tags?.golf === 'hole' &&
        e.geometry &&
        (!geo.osmHolePrefix || new RegExp(geo.osmHolePrefix, 'i').test(e.tags?.name ?? '')),
    )
    .map((e) => {
      const l = e.geometry!.map(proj)
      return { isTarget: e === holeWay, line: l, cum: arcLengths(l) }
    })
  const distToLine = (hl: { line: Vec[]; cum: number[] }, q: Vec) => Math.abs(projectToPolyline(hl.line, hl.cum, q).lateral)
  // Ownership by the polygon's NEAREST APPROACH to a line, not its centroid: a
  // long shared hazard (Rae's Creek fronting Augusta 12) has a far-off centroid
  // but runs right under our line, so it's ours; a neighbour's bunker never
  // comes close to our line at all.
  const ownsHazard = (ring: Vec[], kind: ZoneKind) => {
    let dT = Infinity
    let dOther = Infinity
    for (const v of ring) {
      for (const hl of holeLines) {
        const d = distToLine(hl, v)
        if (hl.isTarget) dT = Math.min(dT, d)
        else dOther = Math.min(dOther, d)
      }
    }
    // Packed short courses: a bunker belongs to whichever hole line it's
    // nearest, full stop — the 42yd hug clause below spans a whole corridor
    // gap there and adopts the neighbour's sand (Palm Beach hole 1 grew
    // phantom left bunkers from holes 2/18 without this).
    if (geo.packed && kind === 'bunker') return dT <= dOther + toMeters(5)
    // hugging our line ⇒ ours; only cull ones clearly closer to a neighbour
    return dT <= toMeters(42) || dT <= dOther + toMeters(20)
  }
  const ownedRings = rings.filter((r) => r.kind === 'green' || ownsHazard(r.ring, r.kind))

  // travel direction at along a, averaged over ±25 yd → a normal that a single
  // coarse-centreline kink can't flip (a real dogleg bend still turns it)
  const smoothDirAt = (a: number): Vec => {
    const w = toMeters(25)
    const tot = cum[cum.length - 1]
    const a0 = pointAtArc(center, cum, Math.max(0, toMeters(a) - w)).p
    const a1 = pointAtArc(center, cum, Math.min(tot, toMeters(a) + w)).p
    const d = sub(a1, a0)
    const dl = len(d) || 1
    return [d[0] / dl, d[1] / dl]
  }

  for (let a = 0; a <= length; a += STEP_YD) {
    const base = pointAtArc(center, cum, toMeters(a)).p
    const dir = smoothDirAt(a)
    const nrm: Vec = [-dir[1], dir[0]] // left-hand normal (+offset = left)
    for (let off = -CORRIDOR_YD; off <= CORRIDOR_YD; off += RAKE_YD) {
      const q: Vec = [base[0] + nrm[0] * toMeters(off), base[1] + nrm[1] * toMeters(off)]
      for (const { kind, ring } of ownedRings) {
        if (kind === 'green') continue
        if (pointInRing(ring, q)) {
          record(kind, a, off)
          break // one kind per sample point
        }
      }
    }
  }

  // ---------- collapse per-along hits into zones (ocean + hazards) ----------
  type Raw = { kind: ZoneKind; from: number; to: number; side: string }
  const raws: Raw[] = []
  for (const [kind, byAlong] of seriesByKind) {
    for (const a of [...byAlong.keys()].sort((x, y) => x - y)) {
      const h = byAlong.get(a)!
      const side = h.center && h.left && h.right ? 'cross' : h.left && !h.right ? 'left' : h.right && !h.left ? 'right' : 'cross'
      raws.push({ kind, from: a, to: a + STEP_YD, side })
    }
  }

  const greenDepth = isFinite(greenLo) ? Math.max(20, Math.min(45, greenHi - greenLo)) : 30

  // merge contiguous same-kind/same-side samples into real zones
  const merged = mergeZones(raws)
    .filter((r) => r.to - r.from >= STEP_YD)
    // OSM rough polygons are big, noisy, and mostly the default surface anyway —
    // the map reads cleaner as fairway + real hazards (water/sand/ocean)
    .filter((r) => r.kind !== 'deeprough')
    // drop sub-4yd slivers (rake/projection noise); keep real carries
    .filter((r) => r.to - r.from >= 4)
  const zones = merged.map((r, i) => ({ id: `z${i + 1}`, kind: r.kind, from: r.from, to: Math.min(length, r.to), side: r.side }))

  const bend = bendProfile(center, cum)
  const bendMax = bend.reduce((m, v) => (Math.abs(v) > Math.abs(m) ? v : m), 0)

  const layout = {
    slug,
    holeRef: holeNo,
    source: 'osm',
    length,
    zones,
    fairwayFrom: Math.round(length * 0.35),
    fairwayTo: length - Math.round(greenDepth / 2) - 2,
    greenDepth: Math.round(greenDepth),
    // only worth persisting when the hole actually bends (a few yards of wander
    // is projection noise on a "straight" hole — leave it off and it renders straight)
    ...(Math.abs(bendMax) >= 8 ? { bend } : {}),
  }

  if (flags.includes('--json')) {
    console.log(JSON.stringify(layout, null, 2))
    return
  }

  // human-readable report
  const fmtZones = (zs: { kind: string; from: number; to: number; side: string }[]) =>
    zs.map((z) => `  ${z.kind.padEnd(9)} ${String(z.from).padStart(4)}–${String(z.to).padEnd(4)} yd  ${z.side}`).join('\n')

  console.error('')
  console.log(`# ${geo.name} — hole ${holeNo}  (OSM)`)
  console.log(`length: ${length} yd   greenDepth: ${layout.greenDepth} yd   fairway: ${layout.fairwayFrom}–${layout.fairwayTo} yd`)
  console.log(`zones (${zones.length}):`)
  console.log(fmtZones(zones))
  if (Math.abs(bendMax) >= 8) {
    const cornerFrac = bend.indexOf(bendMax) / BEND_SAMPLES
    console.log(
      `bend: max ${bendMax > 0 ? '+' : ''}${bendMax} yd ${bendMax > 0 ? '(left)' : '(right)'} near ${Math.round(cornerFrac * length)} yd — [${bend.join(', ')}]`,
    )
  } else {
    console.log(`bend: straight (max ${bendMax} yd, not persisted)`)
  }

  // side-by-side with the current procedural layout the game ships today
  if (flags.includes('--compare')) {
    const { buildLayout } = await import('../src/engine/layout.ts')
    const { COURSES } = await import('../src/engine/courses.ts')
    const course = COURSES.find((c: { slug: string }) => c.slug === geo.engineSlug)
    const spec = course?.holes[holeNo - 1]
    if (!spec) {
      console.error(`\n(no engine hole for ${geo.engineSlug} #${holeNo} to compare)`)
      return
    }
    const proc = buildLayout(geo.engineSlug, spec)
    console.log(`\n# ${geo.name} — hole ${holeNo}  (PROCEDURAL, shipping today)`)
    console.log(`length: ${proc.length} yd   greenDepth: ${proc.greenDepth} yd   fairway: ${proc.fairwayFrom}–${proc.fairwayTo} yd`)
    console.log(`zones (${proc.zones.length}):`)
    console.log(fmtZones(proc.zones))
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

---
name: course-import
description: >
  Import real course geography into DogLeg and QA it to shippable quality.
  Use this skill whenever the user asks to import a course, add real geometry
  for a course, "freeze" a course, prepare the next daily course import, fix
  or QA imported zones, run import:osm or import:golfbert, or mentions OSM /
  Overpass / golfbert / ProVisualizer / BlueGolf in the context of course
  data — even if they don't say "import". Also use it when reviewing a PR
  that touches src/engine/geometry.ts or the COURSE_GEO / COURSE_GB
  registries.
---

# Course import — real geography, honestly frozen

The mechanics live in [scripts/README.md](../../../scripts/README.md) — the
"freeze process" section there is the canonical step-by-step and the source
of truth when this file and it disagree. This skill is the judgment layer on
top: the order of operations, the QA walkthrough, and the catalog of ways
imports go wrong. Read the README's freeze process before your first import
of a session.

**The prime rule:** if you cannot reliably establish the course's geography,
do not press forward. Procedural geometry is honest about being generic; a
bad import claims to be the real place and quietly poisons the odds, the map,
the Play Rating, and every replay of that seed. Propose importing a different
real course, leave it procedural, or stop and say so.

## Pipeline

0. **Preflight — is it real, is it the right one, is it mapped?**
   - Roughly a sixth of the library is original fiction (list in the README
     preflight + `docs/DESIGN.md`) and permanently import-ineligible. Beware
     real courses with colliding names — never import their geography under a
     fictional slug. Never reshuffle the rotation order in `courses.ts` to
     dodge a fictional course.
   - Pin the exact OSM `golf_course` polygon (name + location) before
     importing; multi-course sites with shared hole refs are the standard trap.
   - No `golf=hole` centrelines in OSM? **Don't declare it unimportable yet —
     check golfbert** (`golfbert.com/courses/search`). OSM coverage is patchy
     in exactly this way: every green and bunker mapped, zero centrelines.
     See "Golfbert fallback" below.

1. **Pull the club's published scorecard.** BlueGolf's detailed scorecard is
   the house source (URL pattern in the README; it sits behind a WAF, so use
   the browser, not curl). Card is ground truth for par / stroke index /
   yardage; the geo source is ground truth for *shape* only. Verify par and
   HCP against `courses.ts` before importing — a mismatch is a data bug.
   **Only ship what provably matches the card.**

2. **Import.** `pnpm import:osm <slug> <hole>` per hole (`--compare`,
   `--json`), or `pnpm import:golfbert` when OSM lacks centrelines. Yardage
   gaps vs the card mean the centreline started at the wrong tee pad:
   **shift every zone by the constant, never scale** (rationale and the
   royal-portrush proof are in the README).

3. **Paste** the `--json` zones into `OSM_GEOMETRY` in
   `src/engine/geometry.ts` under `${slug}:${hole}`; paste any `bend:` arrays
   into `OSM_BEND`. `courses.ts` auto-reconciles yardage tuples — don't hand
   edit them.

4. **QA every hole against imagery** using ProVisualizer's **3D planner** —
   see the walkthrough below. Hand-fix artifact modes *with a comment
   explaining the deviation from the raw import* (house style:
   `tpc-sawgrass:2`, `harbour-town:4`/`18`).

5. **Copy/geometry contract:** anything a hole's `signature` string or
   `landmark` names must actually exist in the zones — right yardage, right
   side, big enough to read. Fix the geometry if it's missing, the rendering
   (`ZoneStyle`) if it's there but unreadable, or the copy if imagery says
   the feature isn't really in play.

6. **Landmark pass:** one instantly-recognizable structure per course at
   most, via the cosmetic `landmark` field (extend the `Landmark` union +
   HoleMap sprite for new kinds). Never in odds or replay.

7. **Finish:** `pnpm gen:ratings` (only the imported course should move),
   then full `pnpm test` — the odds invariants are the geometry lie-detector,
   and `grade.test.ts` is what catches cross-bands-into-greens. A failure
   usually means the geometry is dishonest, not that a test needs loosening.
   **Bump `ENGINE_VERSION`** in the same PR — imported geometry changes what
   a seed replays into.

## QA walkthrough — ProVisualizer 3D planner

Use the **3D planner**, not the top-down 2D overview:
`provisualizer.com/3dplanner.php?n=<Course Name>` — get the full link (it
carries tee/pin data in the querystring) from the course's main page at
`provisualizer.com/courses/<slug>.php`. It gives a per-hole tee-perspective
satellite view with a hole dropdown and Next/Prev Hole buttons; hazards that
vanish from above (Carnoustie's burns) are unmistakable from the tee.

Two tools inside it earn their keep:
- **"From Tee" + click the map = exact yardage.** The fastest ground truth
  there is — use it to check any zone whose distance you doubt before
  hand-fixing.
- Walk *every* hole, comparing each zone's kind / side / yardage to the
  imagery, hunting specifically for the artifact modes below.

## Artifact-mode catalog

The README documents the first three (phantom cross zones, broken lateral
hazards, dropped greenside bunkers). These were all found in real imports
since — check for every one of them, every time:

- **Waterway linestrings are invisible** (Carnoustie). Burns/streams mapped
  as OSM `waterway` *lines* never hit the polygon-only rasterizer — a links
  course can import bunker-only. Fix: intersect the tagged waterway ways with
  each hole's centreline (same arc-length yardstick, card-scaled) for exact
  crossing yardages, then hand-lay water zones verified against imagery.
  Skip trivial tee-front carries; move `fairwayFrom` past a burn guarding
  the fairway start so the carry reads honest. (St Andrews' Swilcan Burn
  will hit this.)
- **Coastline drawn at the high-water rock line** (Cypress 16). An exposed
  reef reads as LAND, so one famous ocean carry imports as a short `cross`
  plus a long flank. Measure in the planner, span the water as one `cross`,
  move `fairwayFrom` past it.
- **Centreline clipping a neighbouring green** (Cypress 1). The green span
  runs to the wrong green and pins the 45-yd ceiling — **any hole whose
  `greenDepth` is exactly 45 is a suspect.**
- **`cross` bands running INTO the green** (Cypress 3/10/11/13). Greenside
  bunker rings rasterized as a full-width carry — you cannot carry the green
  you're aiming at. Fold into the adjoining flank or drop when flanks
  already ring it. Cost ~0.02 strokes/round on the greedy-by-Q calibration;
  `grade.test.ts` (threshold 0.7, ~0.09 headroom) is the test that catches
  them.
- **Missing scrub/gorse.** OSM often has zero `natural=scrub` polygons where
  gorse defines a hole — hand-author `deeprough` (precedent:
  `harbour-town:18`'s trees).

Golfbert's modes differ (tree-clump slivers; lakes read at an angle
flickering between sides — the phantom `cross` half is the dangerous one);
the importer handles both, but verify.

## Golfbert fallback

`scripts/import-golfbert.ts` (+ registry `COURSE_GB`, docs in the README once
the Lakewood Ranch import lands — read those, don't re-derive the
constructed-tee algorithm). The judgment that stays with you: **golfbert
records need harder identity checking than OSM ones** — no polygon boundary
catches a bad record, and golfbert both duplicates (same 18 greens under two
ids, renumbered 13 apart) and composites (another course's back nine spliced
in). Run `--verify` FIRST and trust the shared-green count and par-sequence
fingerprint over hole-by-hole eyeballing; sanity-check green-to-next-tee
walks (<250 yd on a real routing). Match the fingerprint against the
BlueGolf card before importing anything.

## Ship checklist

- [ ] Card-verified par / HCP / yardage; zones shifted (not scaled) to card
- [ ] Every hole walked in the 3D planner; artifact catalog checked
- [ ] Hand-fixes commented with the deviation from the raw import
- [ ] `signature` / `landmark` copy matches geometry
- [ ] `pnpm gen:ratings` — only this course moved
- [ ] Full `pnpm test` green (no loosened thresholds)
- [ ] `ENGINE_VERSION` bumped in this PR
- [ ] Attribution honored (ODbL for OSM; check golfbert's terms)

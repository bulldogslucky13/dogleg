import { characterById } from './characters'
import { courseBySlug } from './courses'
import { majorConditions, RESULT_SQUARE, SITE_URL, toParLabel, type DailySetup } from './daily'
import type { CharacterId, CourseSpec, HoleResult } from './types'

/**
 * THE DOGLEG CUP — the season-long tournament calendar.
 *
 * A Cup event is four rounds, Thursday through Sunday, on one course: one
 * refereed attempt per day, best three of the four count, no cuts. The
 * season's shape (Jackson's schedule, 2026-08-09):
 *
 *  1. Two EXHIBITION weeks launch the format — Bellerive alongside the real
 *     playoffs (Aug 20), then the DogLeg Cup Championship on the game's own
 *     course (Aug 27). Exhibitions crown a winner but pay no Cup points.
 *  2. The POINTS SEASON opens Sept 3 (CUP_SEASON_START) and runs weekly on
 *     the library's marquee courses all fall and winter — deliberately our
 *     own schedule, counter-programming golf's off-season.
 *  3. Jan 21 the Cup picks up the real tour's weekly calendar (the PGA West
 *     week) and follows it venue-for-venue as imports land.
 *
 * Finishing positions pay Cup points (see CUP_POINTS below); the season's
 * points race crowns the DogLeg Cup champion.
 *
 * Events are named for the COURSE, never for a trademarked tournament —
 * "DogLeg Cup at Augusta National," not the tournament's own name.
 *
 * PLACEHOLDERS: entries with status 'placeholder' are the roadmap living in
 * code — a venue not yet imported, or a real-tour date not yet confirmed.
 * They never schedule (activeEvent skips them); flipping one live is a
 * one-line change to 'confirmed' once its course is in the library and its
 * date is checked. A shipped CONFIRMED event's key, start, and course are
 * frozen history the moment its first round is dealt — seeds carry the key,
 * so editing one re-maps rounds already played, exactly like editing a
 * shipped rotation era.
 *
 * Fortune deliberately sits this out: major seeds carry no fortune tail, and
 * the engine ignores one if present (see destinyPlan/fortuneOddsFor in
 * replay.ts). A four-day points race is pure competition — a destiny
 * guarantee cashing mid-event would tilt a board that dozens of players are
 * climbing, the same reasoning that keeps par-3 courses outside fortune.
 */

/** Thursday through Sunday, always. */
export const EVENT_DAYS = 4

export interface CupEvent {
  /** stable id — rides in every major seed, frozen once the event has run */
  key: string
  /** display title, course-named (never a trademarked tournament name) */
  name: string
  courseSlug: string
  /** the Thursday, YYYY-MM-DD (local dateKeys, like the daily) */
  start: string
  /** majors pay more Cup points (and get the bigger stage) */
  major?: boolean
  /** exhibitions crown a winner but pay NO Cup points — the two launch
   * weeks run the format before the season's race begins */
  exhibition?: boolean
  /** 'placeholder' = course not imported yet, or date unconfirmed — listed
   * here as the plan of record, but never scheduled */
  status: 'confirmed' | 'placeholder'
}

/** The points season opens here — everything earlier is exhibition. */
export const CUP_SEASON_START = '2026-09-03'

/** Does a finish at this event move the Cup standings? */
export function paysPoints(e: CupEvent): boolean {
  return !e.exhibition
}

/**
 * The schedule of record. Venue research + import priorities live in
 * Jackson's plan doc (dogleg-cup-plan-2026-2027.md, outside the repo);
 * real-tour venues we don't hold yet sit here as placeholders and flip on
 * as their courses land. Dates: 2027 majors are confirmed venues+dates;
 * 2027 regular-season entries are the expected week and stay placeholders
 * until the tour's schedule confirms them.
 */
export const DOGLEG_CUP: CupEvent[] = [
  // ---- the two exhibition launch weeks: prove the format, grow the field ----
  // Bellerive runs alongside the real playoffs' St. Louis week. Its course
  // landed 2026-08-10 (a guest, like every Cup-only venue).
  { key: 'bellerive-2026', name: 'DogLeg Cup at Bellerive', courseSlug: 'bellerive', start: '2026-08-20', exhibition: true, status: 'confirmed' },
  // THE DOGLEG CUP CHAMPIONSHIP — the game's own course, the flagship,
  // yearly on this week. The course ships with this entry (a guest course:
  // playable ONLY when the Championship is on).
  { key: 'the-dogleg-2026', name: 'The DogLeg Cup Championship', courseSlug: 'the-dogleg', start: '2026-08-27', major: true, exhibition: true, status: 'confirmed' },
  // ---- the points season: weekly on our own marquees all fall and winter,
  //      counter-programming golf's off-season (CUP_SEASON_START) ----
  { key: 'pinehurst-no2-2026', name: 'DogLeg Cup at Pinehurst No. 2', courseSlug: 'pinehurst-no2', start: '2026-09-03', status: 'confirmed' },
  { key: 'oakmont-2026', name: 'DogLeg Cup at Oakmont', courseSlug: 'oakmont', start: '2026-09-10', status: 'confirmed' },
  { key: 'shinnecock-2026', name: 'DogLeg Cup at Shinnecock Hills', courseSlug: 'shinnecock-hills', start: '2026-09-17', status: 'confirmed' },
  { key: 'winged-foot-2026', name: 'DogLeg Cup at Winged Foot West', courseSlug: 'winged-foot-west', start: '2026-09-24', status: 'confirmed' },
  { key: 'kiawah-ocean-2026', name: 'DogLeg Cup at Kiawah Ocean', courseSlug: 'kiawah-ocean', start: '2026-10-01', status: 'confirmed' },
  { key: 'whistling-straits-2026', name: 'DogLeg Cup at Whistling Straits', courseSlug: 'whistling-straits', start: '2026-10-08', status: 'confirmed' },
  { key: 'bethpage-black-2026', name: 'DogLeg Cup at Bethpage Black', courseSlug: 'bethpage-black', start: '2026-10-15', status: 'confirmed' },
  { key: 'carnoustie-2026', name: 'DogLeg Cup at Carnoustie', courseSlug: 'carnoustie', start: '2026-10-22', status: 'confirmed' },
  { key: 'royal-portrush-2026', name: 'DogLeg Cup at Royal Portrush', courseSlug: 'royal-portrush-dunluce', start: '2026-10-29', status: 'confirmed' },
  { key: 'merion-east-2026', name: 'DogLeg Cup at Merion East', courseSlug: 'merion-east', start: '2026-11-05', status: 'confirmed' },
  { key: 'royal-melbourne-2026', name: 'DogLeg Cup at Royal Melbourne', courseSlug: 'royal-melbourne', start: '2026-11-12', status: 'confirmed' },
  { key: 'seminole-2026', name: 'DogLeg Cup at Seminole', courseSlug: 'seminole', start: '2026-11-19', status: 'confirmed' },
  { key: 'pebble-beach-2026', name: 'DogLeg Cup at Pebble Beach', courseSlug: 'pebble-beach', start: '2026-11-26', status: 'confirmed' },
  { key: 'royal-birkdale-2026', name: 'DogLeg Cup at Royal Birkdale', courseSlug: 'royal-birkdale', start: '2026-12-03', status: 'confirmed' },
  { key: 'cypress-point-2026', name: 'DogLeg Cup at Cypress Point', courseSlug: 'cypress-point', start: '2026-12-10', status: 'confirmed' },
  { key: 'pine-valley-2026', name: 'DogLeg Cup at Pine Valley', courseSlug: 'pine-valley', start: '2026-12-17', status: 'confirmed' },
  { key: 'harbour-town-2026', name: 'DogLeg Cup at Harbour Town', courseSlug: 'harbour-town', start: '2026-12-24', status: 'confirmed' },
  { key: 'royal-dornoch-2026', name: 'DogLeg Cup at Royal Dornoch', courseSlug: 'royal-dornoch', start: '2026-12-31', status: 'confirmed' },
  { key: 'muirfield-2027', name: 'DogLeg Cup at Muirfield', courseSlug: 'muirfield', start: '2027-01-07', status: 'confirmed' },
  { key: 'national-golf-links-2027', name: 'DogLeg Cup at National Golf Links', courseSlug: 'national-golf-links', start: '2027-01-14', status: 'confirmed' },
  // ---- Jan 21: the Cup picks up the real tour's weekly calendar ----
  { key: 'pga-west-2027', name: 'DogLeg Cup at PGA West', courseSlug: 'pga-west-stadium', start: '2027-01-21', status: 'placeholder' },
  { key: 'torrey-pines-2027', name: 'DogLeg Cup at Torrey Pines South', courseSlug: 'torrey-pines-south', start: '2027-01-28', status: 'placeholder' },
  { key: 'tpc-scottsdale-2027', name: 'DogLeg Cup at TPC Scottsdale', courseSlug: 'tpc-scottsdale', start: '2027-02-11', status: 'placeholder' },
  { key: 'riviera-2027', name: 'DogLeg Cup at Riviera', courseSlug: 'riviera', start: '2027-02-18', status: 'placeholder' },
  { key: 'bay-hill-2027', name: 'DogLeg Cup at Bay Hill', courseSlug: 'bay-hill', start: '2027-03-04', status: 'placeholder' },
  { key: 'tpc-sawgrass-2027', name: 'DogLeg Cup at TPC Sawgrass', courseSlug: 'tpc-sawgrass', start: '2027-03-11', status: 'placeholder' },
  // ---- 2027 majors: venues and dates confirmed ----
  { key: 'augusta-national-2027', name: 'DogLeg Major at Augusta National', courseSlug: 'augusta-national', start: '2027-04-08', major: true, status: 'confirmed' },
  { key: 'harbour-town-2027', name: 'DogLeg Cup at Harbour Town', courseSlug: 'harbour-town', start: '2027-04-15', status: 'placeholder' },
  { key: 'quail-hollow-2027', name: 'DogLeg Cup at Quail Hollow', courseSlug: 'quail-hollow', start: '2027-05-06', status: 'placeholder' },
  { key: 'fields-ranch-east-2027', name: 'DogLeg Major at Fields Ranch East', courseSlug: 'fields-ranch-east', start: '2027-05-20', major: true, status: 'placeholder' },
  { key: 'muirfield-village-2027', name: 'DogLeg Cup at Muirfield Village', courseSlug: 'muirfield-village', start: '2027-06-03', status: 'placeholder' },
  { key: 'pebble-beach-2027', name: 'DogLeg Major at Pebble Beach', courseSlug: 'pebble-beach', start: '2027-06-17', major: true, status: 'confirmed' },
  { key: 'st-andrews-2027', name: 'DogLeg Major at St Andrews', courseSlug: 'st-andrews-old', start: '2027-07-15', major: true, status: 'confirmed' },
]

/** Parse a YYYY-MM-DD key as a LOCAL date (new Date(str) parses UTC and can
 * shift a day) — same rule as the store's streak math. */
function parseDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function dateKeyOf(d: Date): string {
  const m = `${d.getMonth() + 1}`.padStart(2, '0')
  const day = `${d.getDate()}`.padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

/** The event's four dateKeys, Thursday first. */
export function eventDateKeys(e: CupEvent): string[] {
  const keys: string[] = []
  const cursor = parseDateKey(e.start)
  for (let i = 0; i < EVENT_DAYS; i++) {
    keys.push(dateKeyOf(cursor))
    cursor.setDate(cursor.getDate() + 1)
  }
  return keys
}

/** Which round of the event a date is (1–4), or null outside the window.
 * Calendar arithmetic, not milliseconds — a DST change mid-event must not
 * skip or double a round. */
export function dayOfEvent(e: CupEvent, dateKey: string): number | null {
  const idx = eventDateKeys(e).indexOf(dateKey)
  return idx === -1 ? null : idx + 1
}

export function eventForKey(key: string): CupEvent | null {
  return DOGLEG_CUP.find((e) => e.key === key) ?? null
}

/** A confirmed event whose course is actually in the library. The second
 * check is belt-and-braces: a confirmed entry must never schedule rounds on
 * a course this bundle can't build. */
export function eventPlayable(e: CupEvent): boolean {
  return e.status === 'confirmed' && !!courseBySlug(e.courseSlug)
}

export function eventCourse(e: CupEvent): CourseSpec | null {
  return courseBySlug(e.courseSlug) ?? null
}

/** The event live on this date, with which round it is — or null (most weeks
 * outside the calendar, and every placeholder's window). */
export function activeEvent(dateKey: string): { event: CupEvent; day: number } | null {
  for (const e of DOGLEG_CUP) {
    if (!eventPlayable(e)) continue
    const day = dayOfEvent(e, dateKey)
    if (day) return { event: e, day }
  }
  return null
}

/** The next playable event strictly after this date — the Teebox teaser. */
export function nextEvent(dateKey: string): CupEvent | null {
  const upcoming = DOGLEG_CUP.filter((e) => eventPlayable(e) && e.start > dateKey)
  if (!upcoming.length) return null
  return upcoming.reduce((a, b) => (a.start <= b.start ? a : b))
}

/** The base seed for one round of an event — the referee's grammar. A
 * per-player dice salt is appended exactly like the daily's (same dailySalt
 * derivation, same "one salt you can play under" rule). */
export function majorSeedBase(e: CupEvent, dateKey: string): string {
  return `major:${e.key}:${dateKey}:${e.courseSlug}`
}

/** Everything a Cup round needs to tee off — the dailySetup of the majors.
 * Null off the event's window or if the course isn't in this bundle. */
export function majorSetup(e: CupEvent, dateKey: string): DailySetup | null {
  const day = dayOfEvent(e, dateKey)
  const course = courseBySlug(e.courseSlug)
  if (!day || !course) return null
  return {
    course,
    cond: majorConditions(e.key, dateKey, day, course),
    seed: majorSeedBase(e, dateKey),
    puzzleNumber: 0,
    dateKey,
  }
}

// ---------------------------------------------------------------------------
// Cup points — the season-long race
// ---------------------------------------------------------------------------

/** Points by finishing position, 1st through 10th. Beyond that the ladder
 * steps down 3 a place to a floor of 5 — an eligible finish always scores.
 * Ties share a rank (competition numbering, like the season podium) and each
 * take that rank's full points. */
export const CUP_POINTS = [500, 300, 190, 135, 110, 90, 75, 65, 55, 50]

/** A major pays 1.2× — 600 for the win, matching the real tour's weighting. */
export const MAJOR_MULTIPLIER = 1.2

export function cupPoints(rank: number, major = false): number {
  if (rank < 1 || !Number.isInteger(rank)) return 0
  const base = rank <= CUP_POINTS.length ? CUP_POINTS[rank - 1] : Math.max(5, 45 - (rank - 11) * 3)
  return major ? Math.round(base * MAJOR_MULTIPLIER) : base
}

/** The Cup round's share card — the daily's format wearing the event's name.
 * Carries BOTH numbers that matter: today's round and the tournament line. */
export function cupShareText(
  e: CupEvent,
  day: number,
  results: HoleResult[],
  toPar: number,
  character?: CharacterId,
  /** the player's tournament position so far: counted total, rounds posted,
   * and (once eligible) the competition rank */
  standing?: { total: number; played: number; rank?: number },
): string {
  const rows: string[] = []
  for (let i = 0; i < results.length; i += 9) {
    rows.push(results.slice(i, i + 9).map((r) => RESULT_SQUARE[r]).join(''))
  }
  const course = courseBySlug(e.courseSlug)
  const par = course?.holes.reduce((s, h) => s + h.par, 0) ?? 72
  const char = characterById(character)
  const ord = (n: number) =>
    `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : n % 10 === 1 ? 'st' : n % 10 === 2 ? 'nd' : n % 10 === 3 ? 'rd' : 'th'}`
  return [
    `🏆 ${e.name.toUpperCase()}`,
    `Round ${day} of 4 · Par ${par}`,
    `Today: ${par + toPar} (${toParLabel(toPar)})`,
    ...(standing
      ? [
          `Tournament: ${toParLabel(standing.total)} thru ${standing.played} round${standing.played === 1 ? '' : 's'}${
            standing.rank ? ` · ${ord(standing.rank)}` : ''
          }`,
        ]
      : []),
    '',
    ...rows,
    ...(char ? [`${char.emoji} ${char.name}`] : []),
    '',
    `Best 3 of 4 count · ${SITE_URL}`,
  ].join('\n')
}

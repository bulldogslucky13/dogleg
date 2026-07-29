/**
 * The player-facing change log — DogLeg's transparency record.
 *
 * The game's whole promise is that the odds never lie, which only means
 * something if players can see when the odds moved. So every entry carries a
 * kind, and `odds` is reserved for changes that alter HOW A SHOT RESOLVES —
 * the ones a player has a right to know about. Everything else is a new
 * feature or a fix, and the list makes that ratio visible at a glance.
 *
 * MAINTENANCE — this is not optional, and it rides an existing rule:
 * a change that bumps `ENGINE_VERSION` (src/engine/version.ts) MUST add an
 * entry here with kind 'odds', in the same PR. Player-visible features and
 * fixes get an entry too, subject to the two exceptions below; refactors,
 * docs, and test-only work don't (they're invisible from the tee).
 *
 * NEVER LOG PER-COURSE WORK (Jackson's rule, 2026-07-26). Courses are
 * fine-tuned the day before they come up as the daily and shipped then, so
 * every import, scorecard correction, and geometry pass would flood the feed
 * with entries no player can act on — and a wall of "odds changed" for routine
 * course prep reads as constant meddling with the math, which is the opposite
 * of what this screen is for. Log a course's arrival nowhere; log only changes
 * to how the GAME behaves everywhere (a new hole type, a new hazard weight, a
 * new luck rule). This is the only exception to the bump-implies-entry rule
 * above, and it is deliberate: `ENGINE_VERSION` bumps for course geometry
 * alone get no entry. (The cosmetic rule below is an exception to the
 * player-visible-fixes rule instead — cosmetic work never bumps the engine.)
 *
 * NEVER LOG COSMETIC WORK (2026-07-27). Colour, contrast, spacing, layout,
 * type, animation and copy polish stay out of the feed even when the change
 * is plainly visible — "player can see it" is not the bar, and it is the
 * wrong bar, because it lets a paint job sit in the same list as the odds
 * moving. The bar is whether the bug could have COST A STROKE OR MISLED
 * SOMEONE ABOUT THEIR ROUND. A caddy note that misread the hole, a ball
 * drawn in a lie it wasn't in, a score that posted wrong: those changed what
 * the game did or what it told you, and they get an entry. A button nobody
 * could read is a real bug and still gets none — fixing it changed neither.
 * Ship it silently; the diff is the record for that kind of work.
 *
 * The reason both exceptions exist is the same one: this screen counts its
 * own 'odds' entries and stakes the game's honesty on that number being
 * legible. Every entry that didn't need to be here makes the ones that did
 * harder to find.
 *
 * Entries are newest-first and dated ET. Keep them in the game's voice —
 * plain, specific, no jargon and no PR numbers.
 */

export type ChangeKind = 'odds' | 'feature' | 'fix'

export interface ChangeEntry {
  /** YYYY-MM-DD, the day it reached players */
  date: string
  kind: ChangeKind
  title: string
  note: string
}

export const CHANGE_KIND_LABEL: Record<ChangeKind, string> = {
  odds: 'Odds changed',
  feature: 'New',
  fix: 'Fix',
}

export const CHANGELOG: ChangeEntry[] = [
  {
    date: '2026-07-29',
    kind: 'feature',
    title: 'A new address: playdogleg.com',
    note: 'The game moved to playdogleg.com — shorter, and easier to pass on. Share text and replay links point there from now on. An old bookmark still works and brings your clubhouse with it: your name, streak, records and saved rounds all come across on the first visit.',
  },
  {
    date: '2026-07-27',
    kind: 'fix',
    title: 'No more trees on treeless courses',
    note: 'Drive it somewhere nobody mapped and the game used to put you "in the trees" — even on a links with not a tree on it, and it drew your ball sitting on the fairway while it said so. Now each course names its own junk, and the ball is drawn where you actually are.',
  },
  {
    date: '2026-07-25',
    kind: 'odds',
    title: 'A par 3 you can bail out on',
    note: 'Some short holes now dogleg around their own trouble: safe and normal lay up short of it, and only aggressive goes at the flag. A new shape of hole rather than a new course.',
  },
  {
    date: '2026-07-24',
    kind: 'odds',
    title: 'Not all rough is rough',
    note: 'Three grades of it now, and the deep stuff genuinely costs you — harder to advance, harder to save par. The map always shows which you are in.',
  },
  {
    date: '2026-07-24',
    kind: 'fix',
    title: 'A caddy chip could report water behind you',
    note: 'The "water crosses at N yards" note no longer counts a hazard you have already flown.',
  },
  {
    date: '2026-07-23',
    kind: 'odds',
    title: 'Bunkers by the green now carry their own risk',
    note: 'Greenside sand is weighted separately from fairway sand, so a tucked pin behind a trap reads as the danger it is.',
  },
  {
    date: '2026-07-23',
    kind: 'feature',
    title: "The caddy's read",
    note: 'The hole notes under the map now scroll instead of truncating, so nothing about the hole in front of you is hidden.',
  },
  {
    date: '2026-07-22',
    kind: 'feature',
    title: 'Seasons',
    note: 'Course records now reset every quarter, with the all-time board kept alongside. Hold a record at the horn and it goes in the books.',
  },
  {
    date: '2026-07-22',
    kind: 'feature',
    title: 'Race the ghost',
    note: "In unlimited play you can chase the record holder's actual round — a pace race against the real card that set the record.",
  },
  {
    date: '2026-07-22',
    kind: 'feature',
    title: 'Par 3 courses',
    note: 'Short courses added to unlimited play, for when you have a few minutes instead of a few more.',
  },
  {
    date: '2026-07-22',
    kind: 'feature',
    title: 'Handicaps follow the real rules',
    note: 'How your handicap is figured now matches the 2024 world handicap rules for par 3 and short rounds. This changed the number some players see.',
  },
  {
    date: '2026-07-22',
    kind: 'feature',
    title: 'You get told when a new version is live',
    note: 'Every score you post is re-played by the referee on the same engine version you played on. If your tab is running an old one, the game now says so before you tee off instead of rejecting the card afterwards.',
  },
  {
    date: '2026-07-21',
    kind: 'feature',
    title: 'Play Ratings',
    note: 'Every course carries a 1–10 rating for how hard it plays, worked out by simulating rounds rather than by opinion.',
  },
  {
    date: '2026-07-21',
    kind: 'feature',
    title: 'The Clubhouse',
    note: 'Lifetime stats, a handicap, a trophy shelf for aces and albatrosses, scorecards for every round, and a nudge when somebody takes one of your course records.',
  },
  {
    date: '2026-07-20',
    kind: 'odds',
    title: 'Fortunes',
    note: 'Aces and albatrosses can now strike out of pure luck, at real published odds — and posting dailies under a clubhouse name quietly improves them.',
  },
  {
    date: '2026-07-20',
    kind: 'odds',
    title: 'Your own dice',
    note: 'The daily deals every player their own luck instead of one shared roll, so two people on the same course no longer share the same bounces.',
  },
  {
    date: '2026-07-20',
    kind: 'feature',
    title: 'Replays',
    note: 'Any round can be watched back from a share link, shot by shot.',
  },
  {
    date: '2026-07-19',
    kind: 'feature',
    title: 'Leaderboards and course records',
    note: 'Daily boards and per-course records, every submission validated by re-playing the round on the server. No card posts without surviving that check.',
  },
  {
    date: '2026-07-18',
    kind: 'feature',
    title: 'DogLeg opens for play',
    note: 'One course a day, 18 holes, every decision priced in real odds.',
  },
]

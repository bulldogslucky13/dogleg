/**
 * The player-facing change log — DogLeg's transparency record.
 *
 * The game's whole promise is that the odds never lie, which only means
 * something if players can see when the odds moved. So every entry carries a
 * kind, and `odds` is reserved for changes that alter HOW A SHOT RESOLVES —
 * the ones a player has a right to know about. Everything else is a new
 * feature or a fix, and the list makes that ratio visible at a glance.
 *
 * MAINTENANCE — this is not optional, and it is now MECHANICAL: the
 * change-log gate (.github/workflows/changelog-check.yml, policy in
 * scripts/changelog-check.mjs) fails any PR that neither updates this file
 * nor carries a valid exemption label. It also rides the existing rule:
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

export type ChangeKind = 'odds' | 'feature' | 'fix' | 'design'

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
  design: 'Design',
}

export const CHANGELOG: ChangeEntry[] = [
  {
    date: '2026-08-14',
    kind: 'feature',
    title: 'A badge for the rounds that beat you up',
    note: 'There is a new hidden achievement waiting in Awards, and you earn it by having a bad day: finish a full round with more bogeys or worse than birdies or better and it turns up on your shelf. Some rounds are just for the résumé. It counts every time, so the tally is its own running joke.',
  },
  {
    date: '2026-08-12',
    kind: 'feature',
    title: 'Claim the hole in one you just made',
    note: 'A hole in one or an albatross played without a clubhouse name used to go in the books under nobody — no name on the card, no line on any board, and no way to fix it later. Now the moment plays out exactly as it always has, and when you tap on, you get one card asking if you want to put your name on it. You can claim a clubhouse name right there, mid-round, without waiting for the scorecard — the name lands on the identity you were already playing under, so the round in your hands keeps the dice it was dealt. Tap "not now" and nothing changes.',
  },
  {
    date: '2026-08-10',
    kind: 'fix',
    title: 'The course list remembers your sort and filters',
    note: 'Unlimited play reset its sort and filters every time you left, so a curated view had to be rebuilt on every visit. Your last configuration now sticks — the season/all-time toggle, every filter, favorites, and the sort — and it comes back clearly marked, with a one-tap reset. If a remembered view ever matches nothing (say a season rollover reopened the records an old filter was hunting), the list says the filters are why, not that your courses are gone.',
  },
  {
    date: '2026-08-10',
    kind: 'feature',
    title: 'A new address: playdogleg.com',
    note: 'The game moved to playdogleg.com — shorter, and easier to pass on. Share text and replay links point there from now on. An old bookmark still works and brings your clubhouse with it: your name, streak, records and saved rounds all come across on the first visit. If you had added an email for cross-device sync, that one thing cannot follow you between two addresses — sign in once more and this device is synced exactly as it was.',
  },
  {
    date: '2026-08-10',
    kind: 'feature',
    title: 'Find your next record',
    note: 'Unlimited play’s course list learned to hunt: filter by difficulty, by what you’ve played, by open or beatable records — season or all-time, your pick — star your target courses, and sort the whole board by what’s winnable. Fifty courses, one shortlist.',
  },
  {
    date: '2026-08-09',
    kind: 'feature',
    title: 'Challenge links: beat this round',
    note: 'Finish an unlimited round and throw it down as a challenge. Whoever taps the link plays the same course against your actual round — one attempt, their own luck, ties don\'t take it. Beat a challenge and you get to send the revenge link. Challenge rounds are real rounds: course and season records are live the whole way. Settle it in the group chat.',
  },
  {
    date: '2026-08-09',
    kind: 'feature',
    title: 'The wall keeps score of itself',
    note: 'The course list now says how many course records were set in the past week \u2014 and how many of those fell in daily play, crown and all. A quiet week says nothing.',
  },
  {
    date: '2026-08-09',
    kind: 'feature',
    title: 'The hunt is on',
    note: 'The Teebox now tells you how many season records are within reach — wide open boards and beatable numbers both — and one tap drops you on the course list sorted by what\u2019s winnable. Go take one.',
  },
  {
    date: '2026-08-07',
    kind: 'odds',
    title: 'You now end up in the bunker — and the lake — you actually found',
    note: 'When an approach found trouble, the game picked which bunker or lake off a list that treated every one in range as equally likely, so one eighty yards short of the green came up about as often as the one beside it. Then it ignored that pick: sand always dropped you greenside, which is why a bunker shot sometimes drew your ball on open grass beside the green, and a lateral water penalty always dropped you a fixed distance out, which could hand you a free forty yards. Now the odds weight hazards by how likely that miss really is, and you finish where you actually went in. Greenside sand is still a splash; sand out in the fairway leaves you a full shot, and a water drop goes back to the water rather than up the hole. Twenty-two courses moved a point of difficulty, most of them down.',
  },
  {
    date: '2026-08-03',
    kind: 'fix',
    title: 'Daily rounds now count for course records',
    note: 'They always should have. Post a daily that beats the best score ever shot on that course and the record is yours — season and all-time both. We made it right: past daily rounds have been counted back in. Win a CR during a daily round and your score gets a crown in unlimited play.',
  },
  {
    date: '2026-08-01',
    kind: 'odds',
    title: 'Real greens were being measured at half their size',
    note: 'Every course drawn from real-world maps had its greens come out about half as deep as they really are. That put the front edge too close to the pin, so sand guarding the front of a green was not always counted as guarding it, and those bunkers read as slightly less dangerous than they are. All 199 holes are re-measured against the real green. No course changed its difficulty rating.',
  },
  {
    date: '2026-07-29',
    kind: 'feature',
    title: 'Season records are worth defending too',
    note: 'Losing a season record now triggers the rivalry card on the teebox. Racing a record? Toggle between ghost balls in Unlimited Play to pace yourself with your actual target. Happy hunting.',
  },
  {
    date: '2026-07-27',
    kind: 'feature',
    title: 'Achievements',
    note: 'The Clubhouse grows an Awards tab: named ranks for every pursuit \u2014 birdies, streaks, records, rounds \u2014 plus one-off badges, a few of them hidden until you stumble into them. Your whole history counts from day one: anything you\u2019d already earned is waiting on the shelf.',
  },
  {
    date: '2026-07-27',
    kind: 'fix',
    title: 'No more trees on treeless courses',
    note: 'Drive it somewhere nobody mapped and the game used to put you "in the trees" — even on a links with not a tree on it, and it drew your ball sitting on the fairway while it said so. Now each course names its own junk, and the ball is drawn where you actually are.',
  },
  {
    date: '2026-07-26',
    kind: 'design',
    title: 'Welcome to DogLeg 2.0',
    note: 'One week after launch, we\u2019ve stepped up our design game: a full rebadge of the menus and branding, a post-round wrap screen that leads with your score, your share card, and a proper leaderboard \u2014 plus small tweaks under the hood to make your card a little sexier when it hits the group chat. The golf is untouched \u2014 keep on swingin\u2019.',
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
    title: 'Your own bounces',
    note: 'Every player now gets their own luck on the daily. Two people playing the same course see the same conditions and the same odds — but not the same bounces.',
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

import type { CharacterId, CourseSpec } from './types'

export interface CharacterSpec {
  id: CharacterId
  name: string
  emoji: string
  tagline: string
  /** what the buff actually does, in player language */
  edge: string
}

export const CHARACTERS: CharacterSpec[] = [
  {
    id: 'fairway',
    name: 'Fairway Finder',
    emoji: '💣',
    tagline: 'Deep down range',
    edge: 'Longer drives that find the short grass — every approach plays shorter',
  },
  {
    id: 'dart',
    name: 'Dart Thrower',
    emoji: '🎯',
    tagline: 'Pin hunter',
    edge: 'Approach shots stick — more kick-ins and birdie looks, fewer missed greens',
  },
  {
    id: 'greens',
    name: 'Greens Keeper',
    emoji: '🪄',
    tagline: 'Ice on the dance floor',
    edge: 'Best putter in the game — more makes, way fewer three-jacks',
  },
]

export function characterById(id: CharacterId | undefined): CharacterSpec | null {
  return CHARACTERS.find((c) => c.id === id) ?? null
}

/**
 * The roster a player can actually pick (and the cast can actually play) on
 * a given course. The Fairway Finder's whole edge is the driver — a par-3
 * short course never gives him one to swing — so he sits those out. Single
 * source of truth for BOTH the pick screen (CharacterPickScreen) and the
 * clubhouse cast simulation (castRound): they must never drift apart, or a
 * player could see a rival in the clubhouse they were never offered to play.
 */
export function playableCharacters(course: Pick<CourseSpec, 'par3Course'>): CharacterSpec[] {
  return CHARACTERS.filter((c) => !(course.par3Course && c.id === 'fairway'))
}

/**
 * Buff tables. Multiplicative nudges on the relevant odds buckets, renormalized
 * downstream — so displayed odds and the dice always agree, character included.
 * Calibration target (characters.test.ts): each is worth ~1 stroke per round.
 */
// Tuned down when approach odds became distance-aware: the extra carry now
// buys real birdie-look equity on the next shot, so the lie buff carries less.
export const FAIRWAY_BUFF = {
  dialed: 1.4,
  fairway: 1.12,
  rough: 0.68,
  trouble: 0.78,
  /** extra carry in yards off the tee box */
  extraYards: 16,
} as const

export const DART_BUFF = {
  kickin: 1.22,
  makeable: 1.08,
  lag: 0.97,
  scramble: 0.86,
  holeout: 1.2,
} as const

export const GREENS_BUFF = {
  one: 1.38,
  three: 0.5,
} as const

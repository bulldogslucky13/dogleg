import type { CharacterId } from './types'

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
 * Buff tables. Multiplicative nudges on the relevant odds buckets, renormalized
 * downstream — so displayed odds and the dice always agree, character included.
 * Calibration target (characters.test.ts): each is worth ~1 stroke per round.
 */
export const FAIRWAY_BUFF = {
  dialed: 1.55,
  fairway: 1.15,
  rough: 0.6,
  trouble: 0.72,
  /** extra carry in yards off the tee box */
  extraYards: 20,
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

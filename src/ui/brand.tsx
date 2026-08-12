/**
 * The tagline — DogLeg's one-sentence identity, as a reusable brand element.
 *
 * "18 holes. Play the odds. Beat the course." is the game in three moves:
 * the format, the mechanic, the goal. It anchors the Teebox lockup and the
 * How to Play hero today; any future surface (splash, share card, store
 * copy) should import it from HERE rather than retyping it, so the brand
 * line can never drift or typo across surfaces.
 */

/** the three pillars, each a complete sentence */
export const TAGLINE_PARTS = ['18 holes.', 'Play the odds.', 'Beat the course.'] as const

/** the full line, for flat copy (meta descriptions, share text, alt text) */
export const TAGLINE = TAGLINE_PARTS.join(' ')

/**
 * The tagline as a stacked display lockup — three staggered broadcast lines.
 * Purely presentational; hosts size and color it by scoping `.tagline-lockup`.
 */
export function TaglineLockup() {
  return (
    <p className="tagline-lockup" aria-label={TAGLINE}>
      {TAGLINE_PARTS.map((part) => (
        <span key={part}>{part}</span>
      ))}
    </p>
  )
}

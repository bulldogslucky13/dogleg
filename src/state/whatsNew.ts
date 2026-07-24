import { loadHistory } from './store'

/**
 * The what's-new splash ack: shown once per drop to players who were already
 * here, never to a first-timer.
 *
 * Modelled on the season ack (`seasonStore`) — one key holding the version
 * last acknowledged, so the slot is reusable. To announce the next change,
 * bump `WHATS_NEW_VERSION` and rewrite `WhatsNewSplash`; everyone who acked
 * the previous drop sees the new one exactly once. Never reuse a version for
 * different copy, or the players who already dismissed it are skipped.
 */

/** Bump to announce a new drop. Reads as a slug so it's greppable. */
export const WHATS_NEW_VERSION = '2026-07-24-rough'

const ACK_KEY = 'dogleg:whatsnew-ack:v1'

export function ackedWhatsNewVersion(): string | null {
  try {
    return localStorage.getItem(ACK_KEY)
  } catch {
    // storage blocked: claim the current version so a private-mode browser
    // gets the splash on every single load. Same call the tutorial makes.
    return WHATS_NEW_VERSION
  }
}

/**
 * Existing players only, and the round count is the gate rather than the
 * tutorial ack — "what changed" is meaningless to someone who has never
 * played, and this check runs during render, ahead of `primeWhatsNew`'s
 * mount effect. Both are needed: this one keeps the splash off a fresh
 * device NOW, prime keeps it off that same device after its first round.
 */
export function needsWhatsNew(): boolean {
  if (ackedWhatsNewVersion() === WHATS_NEW_VERSION) return false
  return loadHistory().length > 0
}

export function ackWhatsNew(): void {
  try {
    localStorage.setItem(ACK_KEY, WHATS_NEW_VERSION)
  } catch {
    /* private mode */
  }
}

/**
 * A device that has never finished a round has nothing to catch up on — the
 * game it's about to meet already includes the change. Stamp the current
 * version at first open so a brand-new player doesn't get "the rough grew
 * out" days later, about rough that was always this thick for them.
 *
 * Only ever stamps a device that has NO ack at all, so it can't skip a real
 * drop for a returning player between rounds.
 */
export function primeWhatsNew(): void {
  if (ackedWhatsNewVersion() === null && loadHistory().length === 0) ackWhatsNew()
}

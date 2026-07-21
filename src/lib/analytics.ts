import posthog from 'posthog-js'

let initialized = false

/** Initialize PostHog. No key (e.g. local dev) → analytics stays off entirely. */
export function initAnalytics(): void {
  const key = import.meta.env.VITE_POSTHOG_KEY
  if (!key) return
  posthog.init(key, {
    api_host: 'https://us.i.posthog.com',
    defaults: '2026-05-30',
    person_profiles: 'identified_only', // never identify → all events stay anonymous (cheapest class)
    autocapture: false, // explicit events only; keeps volume + noise near zero
    capture_pageview: true,
    disable_session_recording: true,
    persistence: 'localStorage', // no cookies → no consent banner needed
    respect_dnt: true,
  })
  initialized = true
}

/** Capture an event; no-op when PostHog isn't initialized. */
export function track(event: string, props?: Record<string, unknown>): void {
  if (!initialized) return
  posthog.capture(event, props)
}

/**
 * Attach subsequent events to a KNOWN player, keyed on the server-minted
 * player id (stable across devices once signed in, and never PII — an email
 * or clubhouse name must never be the distinct id). Call this only for named
 * or signed-in players: anonymous devices stay profile-free, the cheapest
 * event class, which is why the init keeps `person_profiles: 'identified_only'`.
 * The clubhouse name rides along as a person property (a public leaderboard
 * handle, so safe to store) purely to make PostHog readable.
 */
export function identifyPlayer(id: string, name?: string | null): void {
  if (!initialized || !id) return
  posthog.identify(id, name ? { clubhouse_name: name } : undefined)
}

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

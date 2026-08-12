import posthog from 'posthog-js'

let initialized = false
let pinterestReady = false

/**
 * Pinterest conversion tag (ads measurement). Loads ONLY when a tag id is
 * configured (VITE_PINTEREST_TAG_ID repo variable) and never in tests — the
 * same "no key, no network" contract PostHog follows above, so CI stays
 * offline. Until an ads account exists this is dormant scaffolding: set the
 * variable and the base tag + the event forwarding in track() go live.
 */
function initPinterest(): void {
  const tagId = import.meta.env.VITE_PINTEREST_TAG_ID
  if (!tagId || import.meta.env.MODE === 'test') return
  // the standard pintrk bootstrap, minus the noscript img (we never render
  // without JS) — https://help.pinterest.com/en/business/article/install-the-pinterest-tag
  const w = window as unknown as { pintrk?: PinTrk }
  if (!w.pintrk) {
    const pintrk = function (...args: unknown[]) {
      pintrk.queue.push(args)
    } as PinTrk
    pintrk.queue = []
    pintrk.version = '3.0'
    w.pintrk = pintrk
    const s = document.createElement('script')
    s.async = true
    s.src = 'https://s.pinimg.com/ct/core.js'
    document.head.appendChild(s)
  }
  w.pintrk('load', tagId)
  w.pintrk('page')
  pinterestReady = true
}

type PinTrk = { (...args: unknown[]): void; queue: unknown[]; version: string }

/**
 * The few in-game events worth a conversion signal, mapped to Pinterest's
 * event vocabulary. Everything else stays PostHog-only — the ads platform
 * needs funnel milestones, not telemetry.
 */
const PINTEREST_EVENTS: Record<string, string> = {
  round_started: 'custom',
  board_submitted: 'lead',
  clubhouse_name_claimed: 'signup',
}

/** Initialize PostHog. No key (e.g. local dev) → analytics stays off entirely. */
export function initAnalytics(): void {
  initPinterest()
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
  if (pinterestReady && PINTEREST_EVENTS[event]) {
    const w = window as unknown as { pintrk?: PinTrk }
    w.pintrk?.('track', PINTEREST_EVENTS[event], { event_id: `${event}:${Date.now()}` })
  }
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

// Fetching an inbound message's BODY back from Resend — the half of
// receive-email that fails on its own, and the reason this module exists apart
// from the handler.
//
// The webhook carries metadata only, so the body needs a second call:
// `GET /emails/receiving/<id>` (Resend's Received Emails API). That call has
// its own failure modes, and the original code collapsed all of them into one
// boolean — which produced a run of identical, undiagnosable webhook failures
// ("stored metadata; body fetch failed — retry will backfill") that named
// neither the status nor the cause, and a retry loop that could never win.
//
// Two things were wrong and both are fixed here:
//
//  1. **The status was thrown away.** Whatever Resend answered — 401 on a
//     sending-only key, 404 on a message not yet readable, 500 — the handler
//     reported the same sentence. So the reason now travels: status plus
//     Resend's own error name/message, capped so a stray HTML error page can't
//     be dumped into the database.
//
//  2. **Every failure was treated as retryable.** A 401 is not: the same key
//     is refused on every redelivery, and Resend disables an endpoint whose
//     attempts have all failed for five days — which would cost us the
//     metadata write too, silently, on mail that has nothing to do with the
//     key. So failures are classified: `transient` earns the webhook retry
//     (the handler answers non-2xx), `permanent` does not (it is acknowledged,
//     with the reason recorded on the row and in the function log).
//
// The one genuinely racy failure is a 404 straight after arrival — the webhook
// can land before the message is readable back — so a short in-handler retry
// runs first, which is cheaper and quicker than a webhook redelivery. What is
// left after that is bounded by the message's AGE rather than an attempt
// count: the retry payload is byte-identical on every redelivery (that is what
// the signature covers), so age is the only attempt counter available without
// keeping state, and it is a better one — it stops the retries once they have
// had their window, whatever schedule the provider is using.

/** Deliberately pure: no Deno APIs, no supabase-js, fetch injected — so the
 *  regular vitest suite can exercise every branch (see body.test.ts), the way
 *  submit-round/email.ts is testable and index.ts is not. */

export type BodyOutcome =
  /** the message came back; `full` is Resend's Received Email object */
  | { state: 'fetched'; full: Record<string, unknown> }
  /** no API key configured — degraded on purpose, not a failure to retry */
  | { state: 'skipped'; reason: string }
  /** failed, but a later attempt could plausibly succeed → earn a redelivery */
  | { state: 'transient'; reason: string }
  /** failed in a way retrying cannot fix (or has run out of time to fix) */
  | { state: 'permanent'; reason: string }

/** How long after the message arrived a retryable failure is still worth a
 *  redelivery. Resend redelivers at 5s, 5m, 30m, 2h, 5h, 10h and 10h again, so
 *  fifteen minutes spends the two fast attempts — the ones that can win a
 *  read-after-write race — and declines the rest, which would only keep the
 *  endpoint failing for a day to no end. */
export const BODY_FETCH_GRACE_MS = 15 * 60_000

/** In-handler backoff between attempts. Short on purpose: this runs inside a
 *  webhook request, so the budget is under a second, and anything slower than
 *  that is the redelivery's job. */
const RETRY_DELAYS_MS = [250, 750]

/** Cap on how much of Resend's answer rides in the reason — enough for
 *  `restricted_api_key: This API key is restricted to only send emails`,
 *  not enough for a gateway's HTML. */
const MAX_DETAIL = 200

const endpoint = (emailId: string) => `https://api.resend.com/emails/receiving/${encodeURIComponent(emailId)}`

/** A sending-only Resend key can POST /emails and nothing else, which is
 *  exactly the key a project that only ever SENT mail would be holding — so
 *  say so, rather than making the next person guess again. */
const KEY_HINT =
  ' — reading inbound mail needs a Resend key with full access; a sending-only key is refused here ' +
  'even though it sends fine. Point RESEND_INBOUND_API_KEY at a full-access key.'

/** Statuses where the identical request can plausibly succeed later. 404 is in
 *  here deliberately: it is what a message that isn't readable back YET looks
 *  like, and telling that apart from a genuinely unknown id is what the grace
 *  window is for. */
function retryable(status: number): boolean {
  return status === 404 || status === 408 || status === 425 || status === 429 || status >= 500
}

/** `resend 401: restricted_api_key: This API key is restricted…` — status
 *  first (it is what classifies the failure), then whatever Resend explained. */
async function describeFailure(res: Response): Promise<string> {
  let detail = ''
  try {
    const text = (await res.text()).trim()
    if (text) {
      let parsed: unknown = null
      try {
        parsed = JSON.parse(text)
      } catch {
        // not json (gateway error page, empty body) — fall back to the text
      }
      const err = parsed as { name?: string; message?: string; error?: string } | null
      const named = [err?.name, err?.message ?? err?.error].filter(Boolean).join(': ')
      detail = named || text
    }
  } catch {
    // body already consumed or the stream died — the status alone still classifies
  }
  return `resend ${res.status}${detail ? `: ${detail.slice(0, MAX_DETAIL)}` : ''}`
}

/**
 * Fetch one received message's full content, classifying whatever goes wrong.
 *
 * @param apiKey  full-access Resend key, or undefined/empty when unconfigured
 * @param ageMs   how long ago the message arrived (from the webhook payload);
 *                undefined when the payload carried no usable timestamp, which
 *                is treated as young — better to let the provider's own retry
 *                limit bound it than to give up on the first try.
 */
export async function fetchReceivedBody(
  fetchFn: typeof fetch,
  apiKey: string | undefined,
  emailId: string,
  opts: { ageMs?: number; attempts?: number; sleep?: (ms: number) => Promise<void> } = {},
): Promise<BodyOutcome> {
  if (!apiKey) return { state: 'skipped', reason: 'no Resend API key configured' }

  const attempts = opts.attempts ?? 3
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
  let reason = 'no attempt made'

  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt > 0) await sleep(RETRY_DELAYS_MS[Math.min(attempt - 1, RETRY_DELAYS_MS.length - 1)])

    let res: Response
    try {
      res = await fetchFn(endpoint(emailId), { headers: { Authorization: `Bearer ${apiKey}` } })
    } catch (err) {
      // DNS, TLS, connection reset: transport-shaped, so worth another go
      reason = `fetch threw: ${String((err as Error)?.message ?? err).slice(0, MAX_DETAIL)}`
      continue
    }

    if (res.ok) {
      try {
        return { state: 'fetched', full: (await res.json()) as Record<string, unknown> }
      } catch (err) {
        // a 200 we couldn't read is a truncated response, not a bad request
        reason = `resend 200 but unreadable body: ${String((err as Error)?.message ?? err).slice(0, MAX_DETAIL)}`
        continue
      }
    }

    reason = await describeFailure(res)
    // 401/403 is the failure this whole classification exists for: the key is
    // wrong or too narrow, and no amount of redelivery widens it.
    if (res.status === 401 || res.status === 403) return { state: 'permanent', reason: reason + KEY_HINT }
    if (!retryable(res.status)) return { state: 'permanent', reason }
  }

  // The quick attempts are spent. Hand it to the webhook's own retries only
  // while they can still plausibly win; past that, stop failing on purpose.
  if (opts.ageMs === undefined || opts.ageMs < BODY_FETCH_GRACE_MS) return { state: 'transient', reason }
  return {
    state: 'permanent',
    reason: `${reason} (still failing ${Math.round(opts.ageMs / 60_000)}m after the message arrived — giving up)`,
  }
}

/** Age of the message from the webhook's own timestamps, or undefined if it
 *  carried nothing parseable. Same precedence as the stored `received_at`. */
export function messageAgeMs(receivedAt: unknown, now: number): number | undefined {
  if (typeof receivedAt !== 'string') return undefined
  const at = Date.parse(receivedAt)
  if (Number.isNaN(at)) return undefined
  return Math.max(0, now - at)
}

/**
 * What the webhook gets back, and what the function log says.
 *
 * The status code is the whole retry contract, so it lives here under test
 * rather than in the un-runnable handler: **non-2xx is a request for a
 * redelivery**, and it is reserved for the cases where one can help. A
 * permanent failure answers 200 — not because nothing is wrong, but because
 * the alternative (failing through every redelivery for five days, then being
 * disabled as a dead endpoint) loses the metadata as well as the body, and
 * loses it quietly. Nothing is swallowed: the reason goes back in the
 * response the webhook log displays, into the function log, and durably onto
 * the row as `body_error`.
 */
export function ackFor(outcome: BodyOutcome, emailId: string): {
  status: number
  body: Record<string, unknown>
  log: string | null
} {
  switch (outcome.state) {
    case 'fetched':
      return { status: 200, body: { stored: emailId }, log: null }
    case 'skipped':
      return { status: 200, body: { stored: emailId, body: 'skipped', reason: outcome.reason }, log: null }
    case 'transient':
      return {
        status: 500,
        body: { error: `stored metadata; body fetch failed — retry will backfill`, reason: outcome.reason },
        log: `receive-email ${emailId}: body fetch failed (${outcome.reason}) — asking for a redelivery`,
      }
    case 'permanent':
      return {
        status: 200,
        body: { stored: emailId, body: 'missing', reason: outcome.reason },
        log: `receive-email ${emailId}: body fetch failed permanently (${outcome.reason}) — ` +
          `stored the metadata without a body; fix the cause and replay the webhook to backfill`,
      }
  }
}

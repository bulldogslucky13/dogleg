// Unit tests for the inbound body fetch. body.ts is deliberately pure (fetch
// injected, no Deno APIs) so this runs in the regular vitest suite — index.ts
// itself needs Deno plus a live PostgREST and stays untestable here, which is
// why the retry classification and the ack status live in body.ts at all.
//
// The regression these pin: every failure used to look the same from the
// outside (one sentence, no status) and every failure asked for a redelivery,
// including the ones no redelivery could fix.
import { describe, it, expect, vi } from 'vitest'
import { ackFor, BODY_FETCH_GRACE_MS, fetchReceivedBody, messageAgeMs } from './body.ts'

const ID = 'ecc27908-9bd8-4d69-bcc0-4466f6516d84'
const KEY = 're_test_key'
/** in-handler backoff is real time; tests don't wait for it */
const nosleep = async () => {}

/** a fetch that answers a scripted queue of responses (or throws) */
function scripted(...steps: Array<Response | Error>) {
  const calls: Array<{ url: string; auth: string | null }> = []
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers)
    calls.push({ url: String(input), auth: headers.get('authorization') })
    const step = steps[Math.min(calls.length - 1, steps.length - 1)]
    if (step instanceof Error) throw step
    return step
  }) as unknown as typeof fetch
  return { fn, calls }
}

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 })
const fail = (status: number, body?: unknown) =>
  new Response(body === undefined ? '' : typeof body === 'string' ? body : JSON.stringify(body), { status })

describe('fetchReceivedBody', () => {
  it('returns the message on a 200, first try', async () => {
    const { fn, calls } = scripted(ok({ text: 'hello', html: '<p>hello</p>', subject: 'Website claimed!' }))
    const out = await fetchReceivedBody(fn, KEY, ID, { sleep: nosleep })
    expect(out).toEqual({ state: 'fetched', full: { text: 'hello', html: '<p>hello</p>', subject: 'Website claimed!' } })
    expect(calls).toHaveLength(1)
  })

  it('calls the Received Emails endpoint with the key as a bearer token', async () => {
    const { fn, calls } = scripted(ok({ text: 'hi' }))
    await fetchReceivedBody(fn, KEY, ID, { sleep: nosleep })
    expect(calls[0].url).toBe(`https://api.resend.com/emails/receiving/${ID}`)
    expect(calls[0].auth).toBe(`Bearer ${KEY}`)
  })

  it('skips (does not fail) when no key is configured', async () => {
    const { fn, calls } = scripted(ok({ text: 'hi' }))
    const out = await fetchReceivedBody(fn, undefined, ID, { sleep: nosleep })
    expect(out.state).toBe('skipped')
    expect(calls).toHaveLength(0)
  })

  // The failure this whole module was written for: a key that sends fine and
  // cannot read inbound mail. Retrying it forever is what buried the cause.
  it('treats 401 as permanent, names the status and the cause, and stops trying', async () => {
    const { fn, calls } = scripted(
      fail(401, { name: 'restricted_api_key', message: 'This API key is restricted to only send emails' }),
    )
    const out = await fetchReceivedBody(fn, KEY, ID, { sleep: nosleep })
    expect(out.state).toBe('permanent')
    expect(out.state === 'permanent' && out.reason).toContain('401')
    expect(out.state === 'permanent' && out.reason).toContain('restricted_api_key')
    expect(out.state === 'permanent' && out.reason).toContain('RESEND_INBOUND_API_KEY')
    expect(calls).toHaveLength(1)
  })

  it('treats 403 as permanent too', async () => {
    const { fn } = scripted(fail(403, { name: 'forbidden', message: 'nope' }))
    const out = await fetchReceivedBody(fn, KEY, ID, { sleep: nosleep })
    expect(out.state).toBe('permanent')
  })

  it('treats a non-retryable 4xx as permanent without the key hint', async () => {
    const { fn, calls } = scripted(fail(400, { name: 'validation_error', message: 'bad id' }))
    const out = await fetchReceivedBody(fn, KEY, ID, { sleep: nosleep })
    expect(out.state).toBe('permanent')
    expect(out.state === 'permanent' && out.reason).toContain('validation_error')
    expect(out.state === 'permanent' && out.reason).not.toContain('RESEND_INBOUND_API_KEY')
    expect(calls).toHaveLength(1)
  })

  // A webhook can beat Resend's own read-after-write; retrying in-handler is
  // quicker and cheaper than earning a redelivery for it.
  it('retries a 404 in-handler and returns the body when it appears', async () => {
    const { fn, calls } = scripted(fail(404, { name: 'not_found' }), ok({ text: 'landed' }))
    const sleep = vi.fn(nosleep)
    const out = await fetchReceivedBody(fn, KEY, ID, { sleep })
    expect(out).toEqual({ state: 'fetched', full: { text: 'landed' } })
    expect(calls).toHaveLength(2)
    expect(sleep).toHaveBeenCalledTimes(1)
  })

  it('retries 429 and 5xx too', async () => {
    for (const status of [429, 500, 502, 503]) {
      const { fn, calls } = scripted(fail(status), ok({ text: 'landed' }))
      const out = await fetchReceivedBody(fn, KEY, ID, { sleep: nosleep })
      expect(out.state, `status ${status}`).toBe('fetched')
      expect(calls, `status ${status}`).toHaveLength(2)
    }
  })

  it('gives up after the configured attempts and asks for a redelivery while the message is young', async () => {
    const { fn, calls } = scripted(fail(404, { name: 'not_found' }))
    const out = await fetchReceivedBody(fn, KEY, ID, { sleep: nosleep, ageMs: 2_000 })
    expect(out.state).toBe('transient')
    expect(out.state === 'transient' && out.reason).toContain('404')
    expect(calls).toHaveLength(3)
  })

  it('stops asking for redeliveries once the message is past the grace window', async () => {
    const { fn } = scripted(fail(404, { name: 'not_found' }))
    const out = await fetchReceivedBody(fn, KEY, ID, { sleep: nosleep, ageMs: BODY_FETCH_GRACE_MS + 1 })
    expect(out.state).toBe('permanent')
    expect(out.state === 'permanent' && out.reason).toContain('giving up')
  })

  it('treats an unknown age as young — the provider bounds the retries instead', async () => {
    const { fn } = scripted(fail(503))
    const out = await fetchReceivedBody(fn, KEY, ID, { sleep: nosleep })
    expect(out.state).toBe('transient')
  })

  it('retries a thrown fetch and reports what threw', async () => {
    const { fn, calls } = scripted(new TypeError('error sending request'))
    const out = await fetchReceivedBody(fn, KEY, ID, { sleep: nosleep, ageMs: 0 })
    expect(out.state).toBe('transient')
    expect(out.state === 'transient' && out.reason).toContain('error sending request')
    expect(calls).toHaveLength(3)
  })

  it('retries a 200 whose body will not parse', async () => {
    const { fn, calls } = scripted(new Response('{"text":', { status: 200 }), ok({ text: 'landed' }))
    const out = await fetchReceivedBody(fn, KEY, ID, { sleep: nosleep })
    expect(out.state).toBe('fetched')
    expect(calls).toHaveLength(2)
  })

  it('keeps a non-json error page out of the database', async () => {
    const { fn } = scripted(fail(502, '<html><body>' + 'x'.repeat(5000) + '</body></html>'))
    const out = await fetchReceivedBody(fn, KEY, ID, { sleep: nosleep, ageMs: 0 })
    expect(out.state === 'transient' && out.reason.length).toBeLessThan(300)
    expect(out.state === 'transient' && out.reason).toContain('502')
  })

  it('honours an attempt budget of one', async () => {
    const { fn, calls } = scripted(fail(503))
    await fetchReceivedBody(fn, KEY, ID, { sleep: nosleep, attempts: 1, ageMs: 0 })
    expect(calls).toHaveLength(1)
  })
})

describe('messageAgeMs', () => {
  it('measures the age of a webhook timestamp', () => {
    // the real payload shape: data.created_at from an email.received event
    const at = '2026-08-10T20:37:12.923Z'
    expect(messageAgeMs(at, Date.parse(at) + 90_000)).toBe(90_000)
  })

  it('never goes negative on a clock skewed the other way', () => {
    const at = '2026-08-10T20:37:12.923Z'
    expect(messageAgeMs(at, Date.parse(at) - 5_000)).toBe(0)
  })

  it('returns undefined for a missing or unparseable timestamp', () => {
    expect(messageAgeMs(undefined, 0)).toBeUndefined()
    expect(messageAgeMs(null, 0)).toBeUndefined()
    expect(messageAgeMs('whenever', 0)).toBeUndefined()
  })
})

describe('ackFor', () => {
  it('acknowledges a fetched message', () => {
    expect(ackFor({ state: 'fetched', full: {} }, ID)).toEqual({ status: 200, body: { stored: ID }, log: null })
  })

  // non-2xx is the request for a redelivery — reserved for failures one can fix
  it('answers non-2xx for a transient failure, with the reason attached', () => {
    const ack = ackFor({ state: 'transient', reason: 'resend 503' }, ID)
    expect(ack.status).toBe(500)
    expect(ack.body.reason).toBe('resend 503')
    expect(ack.log).toContain('resend 503')
  })

  it('acknowledges a permanent failure instead of failing forever, and logs it', () => {
    const ack = ackFor({ state: 'permanent', reason: 'resend 401: restricted_api_key' }, ID)
    expect(ack.status).toBe(200)
    expect(ack.body.body).toBe('missing')
    expect(ack.body.reason).toBe('resend 401: restricted_api_key')
    expect(ack.log).toContain('restricted_api_key')
  })

  it('acknowledges a skipped fetch quietly', () => {
    const ack = ackFor({ state: 'skipped', reason: 'no Resend API key configured' }, ID)
    expect(ack.status).toBe(200)
    expect(ack.log).toBeNull()
  })
})

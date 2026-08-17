// DogLeg receive-email edge function (Deno).
//
// The inbound half of the mail setup: Resend receives mail for
// @playdogleg.com and POSTs an `email.received` webhook here. The webhook
// carries metadata only (Resend's design — no body, no attachments), so this
// function fetches the full message back from the Received Emails API
// (RESEND_INBOUND_API_KEY, falling back to the RESEND_API_KEY submit-round
// sends with — see the note on `inboundKey` for why they may differ), then
// upserts the lot into `received_emails`.
//
// Authentication is the svix signature (RESEND_WEBHOOK_SECRET), not a JWT —
// Resend can't mint Supabase tokens, so verify_jwt is off in config.toml and
// the signature check in _shared/svix.ts is the only gate. It fails closed:
// no configured secret means every request 401s rather than any request
// passing unverified.
//
// Delivery is at-least-once (Resend retries non-2xx and svix can duplicate),
// so the write is an upsert keyed on Resend's email id — a redelivery
// overwrites the row with identical data instead of inserting a twin. Nothing
// is lost in the meantime either way: Resend keeps the full message
// server-side regardless of what this endpoint does.
//
// The body fetch gets its own module, body.ts, because it fails on its own and
// used to fail opaquely — every cause reported as one sentence, and every cause
// answered with a 500 that asked for a redelivery even when no redelivery could
// help. It now classifies the failure and the handler answers accordingly:
// non-2xx (retry, please) only for the transient ones, 200 with the reason for
// the ones retrying cannot fix. Either way the reason lands on the row in
// `body_error`, so `select email_id, subject, body_error from received_emails
// where text_body is null and html_body is null` is the whole diagnosis.
//
// To recover a message whose body never landed: fix the cause (usually the API
// key's permissions), then replay the delivery from the Resend webhook log
// (Webhooks → the failed message → replay, or "Recover Failed" for a date
// range). Resend still has the message, and the upsert backfills the body onto
// the existing row and clears body_error.
// deno-lint-ignore-file no-explicit-any
import { createClient } from 'npm:@supabase/supabase-js@2'
import { verifySvix } from '../_shared/svix.ts'
import { ackFor, fetchReceivedBody, messageAgeMs } from './body.ts'

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

// Addresses arrive as strings ("Name <a@b.c>") or structured objects
// depending on the field and the sender's headers — flatten to text so the
// table needs no opinion about which shape Resend chose today.
function toText(v: unknown): string | null {
  if (v == null) return null
  return typeof v === 'string' ? v : JSON.stringify(v)
}
function toTextArray(v: unknown): string[] {
  if (v == null) return []
  const list = Array.isArray(v) ? v : [v]
  return list.map((x) => toText(x)).filter((x): x is string => x != null)
}

/** The key that reads inbound mail. Falls back to the sending key, which is
 *  what it used to be — but a Resend key created for sending is commonly
 *  restricted to sending, and a restricted key is refused by the receiving
 *  endpoint. RESEND_INBOUND_API_KEY exists so a full-access key can be dropped
 *  in for this one call without repointing the key that sends. */
const inboundKey = () => Deno.env.get('RESEND_INBOUND_API_KEY') || Deno.env.get('RESEND_API_KEY')

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'POST only' })

  const secret = Deno.env.get('RESEND_WEBHOOK_SECRET')
  if (!secret) return json(500, { error: 'webhook secret not configured' })

  // The signature covers the raw bytes — read them before any JSON parsing.
  const payload = await req.text()
  const svixId = req.headers.get('svix-id')
  const svixTimestamp = req.headers.get('svix-timestamp')
  const svixSignature = req.headers.get('svix-signature')
  if (
    !svixId ||
    !svixTimestamp ||
    !svixSignature ||
    !(await verifySvix(secret, payload, { id: svixId, timestamp: svixTimestamp, signature: svixSignature }))
  ) {
    return json(401, { error: 'bad signature' })
  }

  let event: any
  try {
    event = JSON.parse(payload)
  } catch {
    return json(400, { error: 'not json' })
  }

  // Only email.received is subscribed, but a webhook edited in the dashboard
  // to carry more events shouldn't turn into a retry storm — acknowledge and
  // ignore anything else.
  if (event?.type !== 'email.received') return json(200, { ignored: event?.type ?? 'unknown' })

  const emailId = event.data?.email_id ?? event.data?.id
  if (typeof emailId !== 'string' || !emailId) return json(400, { error: 'no email id in payload' })

  const receivedAt = toText(event.data?.created_at ?? event.created_at)
  const outcome = await fetchReceivedBody(fetch, inboundKey(), emailId, {
    ageMs: messageAgeMs(receivedAt, Date.now()),
  })
  const full: any | null = outcome.state === 'fetched' ? outcome.full : null

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  // Content columns ride along ONLY when the full message was fetched: on
  // conflict the upsert updates just the columns present in the payload, so a
  // redelivery whose refetch fails can't wipe a body an earlier delivery
  // already stored — it refreshes the metadata and leaves the content alone.
  const row: Record<string, unknown> = {
    email_id: emailId,
    message_id: toText(full?.message_id ?? event.data?.message_id),
    from_address: toText(full?.from ?? event.data?.from),
    to_addresses: toTextArray(full?.to ?? event.data?.to),
    cc_addresses: toTextArray(full?.cc ?? event.data?.cc),
    subject: toText(full?.subject ?? event.data?.subject),
    received_at: receivedAt,
    // why there's no body, when there's no body — cleared by the fetch that
    // finally lands, so the column always describes the latest attempt
    body_error: outcome.state === 'fetched' ? null : outcome.reason,
  }
  if (full) {
    row.text_body = toText(full.text)
    row.html_body = toText(full.html)
  }
  // Attachment metadata comes from the WEBHOOK (the receiving endpoint returns
  // the message, not the file list), so it lands whether or not the body fetch
  // worked — but only when there is something to land, so a payload without the
  // field can't blank a list an earlier delivery stored.
  const attachments = full?.attachments ?? event.data?.attachments
  if (Array.isArray(attachments) && attachments.length > 0) row.attachments = attachments

  const { error } = await supabase.from('received_emails').upsert(row, { onConflict: 'email_id' })
  if (error) return json(500, { error: 'could not store email' })

  const ack = ackFor(outcome, emailId)
  if (ack.log) console.error(ack.log)
  return json(ack.status, ack.body)
})

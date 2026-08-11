// DogLeg receive-email edge function (Deno).
//
// The inbound half of the mail setup: Resend receives mail for
// @playdogleg.com and POSTs an `email.received` webhook here. The webhook
// carries metadata only (Resend's design — no body, no attachments), so this
// function fetches the full message back from the Received Emails API with
// the same RESEND_API_KEY submit-round already sends with, then upserts the
// lot into `received_emails`.
//
// Authentication is the svix signature (RESEND_WEBHOOK_SECRET), not a JWT —
// Resend can't mint Supabase tokens, so verify_jwt is off in config.toml and
// the signature check in _shared/svix.ts is the only gate. It fails closed:
// no configured secret means every request 401s rather than any request
// passing unverified.
//
// Delivery is at-least-once (Resend retries non-2xx and svix can duplicate),
// so the write is an upsert keyed on Resend's email id — a redelivery
// overwrites the row with identical data instead of inserting a twin. If the
// body fetch fails, the metadata row is stored and the response is a 500 on
// purpose: Resend's retry re-runs the whole handler and the upsert backfills
// the body. Nothing is lost in the meantime — Resend keeps the full message
// server-side regardless of what this endpoint does.
// deno-lint-ignore-file no-explicit-any
import { createClient } from 'npm:@supabase/supabase-js@2'
import { verifySvix } from '../_shared/svix.ts'

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

async function fetchFullEmail(emailId: string): Promise<{ ok: boolean; full: any | null }> {
  const key = Deno.env.get('RESEND_API_KEY')
  // No API key is a configured (if degraded) state, not a failure: store the
  // metadata and don't burn retries on a fetch that can never succeed.
  if (!key) return { ok: true, full: null }
  try {
    const res = await fetch(`https://api.resend.com/emails/receiving/${emailId}`, {
      headers: { Authorization: `Bearer ${key}` },
    })
    if (!res.ok) return { ok: false, full: null }
    return { ok: true, full: await res.json() }
  } catch {
    return { ok: false, full: null }
  }
}

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

  const { ok: fetchOk, full } = await fetchFullEmail(emailId)

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
    received_at: toText(event.data?.created_at ?? event.created_at),
  }
  if (full) {
    row.text_body = toText(full.text)
    row.html_body = toText(full.html)
    row.attachments = full.attachments ?? event.data?.attachments ?? []
  }
  const { error } = await supabase.from('received_emails').upsert(row, { onConflict: 'email_id' })
  if (error) return json(500, { error: 'could not store email' })
  if (!fetchOk) return json(500, { error: 'stored metadata; body fetch failed — retry will backfill' })
  return json(200, { stored: emailId })
})

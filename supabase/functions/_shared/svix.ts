// Svix webhook signature verification (the scheme Resend signs with).
//
// Resend delivers webhooks through Svix: each request carries `svix-id`,
// `svix-timestamp` and `svix-signature` headers, and the signature is an
// HMAC-SHA256 over `${id}.${timestamp}.${rawBody}` keyed by the endpoint's
// signing secret (`whsec_` + base64 key). Verified here by hand rather than
// through the svix npm package because the check is ~30 lines of WebCrypto,
// and WebCrypto runs identically under Deno (the edge function) and node
// (vitest) — so the exact code the function trusts is the code the test
// suite exercises.
//
// Two properties matter and both are covered by svix.test.ts:
// - the timestamp is bounded (default ±5 minutes) so a captured request
//   can't be replayed later, and
// - the comparison is constant-time so the check doesn't leak signature
//   prefixes through timing.

export interface SvixHeaders {
  id: string
  timestamp: string
  signature: string
}

export const SVIX_TOLERANCE_SECONDS = 5 * 60

function base64ToBytes(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
  return diff === 0
}

export async function verifySvix(
  secret: string,
  payload: string,
  headers: SvixHeaders,
  nowSeconds: number = Math.floor(Date.now() / 1000),
  toleranceSeconds: number = SVIX_TOLERANCE_SECONDS,
): Promise<boolean> {
  const timestamp = Number(headers.timestamp)
  if (!Number.isFinite(timestamp)) return false
  if (Math.abs(nowSeconds - timestamp) > toleranceSeconds) return false

  let keyBytes: Uint8Array
  try {
    keyBytes = base64ToBytes(secret.startsWith('whsec_') ? secret.slice('whsec_'.length) : secret)
  } catch {
    return false
  }

  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes as unknown as ArrayBuffer,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signed = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`${headers.id}.${headers.timestamp}.${payload}`),
  )
  const expected = new Uint8Array(signed)

  // The header may carry several space-separated signatures ("v1,<b64>"),
  // e.g. while a secret is being rotated — any one match accepts.
  for (const candidate of headers.signature.split(' ')) {
    const [version, sig] = candidate.split(',', 2)
    if (version !== 'v1' || !sig) continue
    try {
      if (constantTimeEqual(expected, base64ToBytes(sig))) return true
    } catch {
      // unparseable candidate — keep checking the rest
    }
  }
  return false
}

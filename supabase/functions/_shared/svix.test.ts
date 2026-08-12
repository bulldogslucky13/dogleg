// The svix verifier is the only lock on the receive-email door — the
// function has verify_jwt off (Resend can't mint Supabase JWTs), so a bug
// here means anyone who knows the URL can forge inbound mail into the
// database. These tests sign real payloads with WebCrypto (the same
// primitive the verifier uses) and check both the accept path and every
// reject path the scheme depends on.
import { describe, expect, it } from 'vitest'
import { verifySvix } from './svix'

const SECRET = 'whsec_' + btoa('test-signing-key-material')
const NOW = 1_754_800_000

async function sign(secret: string, id: string, timestamp: number, payload: string): Promise<string> {
  const keyB64 = secret.startsWith('whsec_') ? secret.slice(6) : secret
  const keyBytes = Uint8Array.from(atob(keyB64), (c) => c.charCodeAt(0))
  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes as unknown as ArrayBuffer,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${id}.${timestamp}.${payload}`))
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
}

describe('verifySvix', () => {
  it('accepts a correctly signed payload', async () => {
    const payload = JSON.stringify({ type: 'email.received', data: { email_id: 'abc' } })
    const sig = await sign(SECRET, 'msg_1', NOW, payload)
    expect(
      await verifySvix(SECRET, payload, { id: 'msg_1', timestamp: String(NOW), signature: `v1,${sig}` }, NOW),
    ).toBe(true)
  })

  it('accepts when the right signature is one of several (secret rotation)', async () => {
    const payload = '{"ok":true}'
    const sig = await sign(SECRET, 'msg_1', NOW, payload)
    const stale = await sign('whsec_' + btoa('an-older-rotated-key'), 'msg_1', NOW, payload)
    expect(
      await verifySvix(
        SECRET,
        payload,
        { id: 'msg_1', timestamp: String(NOW), signature: `v1,${stale} v1,${sig}` },
        NOW,
      ),
    ).toBe(true)
  })

  it('rejects a signature made with a different secret', async () => {
    const payload = '{"ok":true}'
    const sig = await sign('whsec_' + btoa('wrong-key'), 'msg_1', NOW, payload)
    expect(
      await verifySvix(SECRET, payload, { id: 'msg_1', timestamp: String(NOW), signature: `v1,${sig}` }, NOW),
    ).toBe(false)
  })

  it('rejects a tampered payload', async () => {
    const sig = await sign(SECRET, 'msg_1', NOW, '{"amount":1}')
    expect(
      await verifySvix(SECRET, '{"amount":9}', { id: 'msg_1', timestamp: String(NOW), signature: `v1,${sig}` }, NOW),
    ).toBe(false)
  })

  it('rejects a swapped message id', async () => {
    const payload = '{"ok":true}'
    const sig = await sign(SECRET, 'msg_1', NOW, payload)
    expect(
      await verifySvix(SECRET, payload, { id: 'msg_2', timestamp: String(NOW), signature: `v1,${sig}` }, NOW),
    ).toBe(false)
  })

  it('rejects a timestamp outside the replay window, in either direction', async () => {
    const payload = '{"ok":true}'
    for (const ts of [NOW - 301, NOW + 301]) {
      const sig = await sign(SECRET, 'msg_1', ts, payload)
      expect(
        await verifySvix(SECRET, payload, { id: 'msg_1', timestamp: String(ts), signature: `v1,${sig}` }, NOW),
      ).toBe(false)
    }
  })

  it('accepts a timestamp just inside the window', async () => {
    const payload = '{"ok":true}'
    const ts = NOW - 299
    const sig = await sign(SECRET, 'msg_1', ts, payload)
    expect(
      await verifySvix(SECRET, payload, { id: 'msg_1', timestamp: String(ts), signature: `v1,${sig}` }, NOW),
    ).toBe(true)
  })

  it('rejects garbage headers without throwing', async () => {
    expect(await verifySvix(SECRET, '{}', { id: 'x', timestamp: 'not-a-number', signature: 'v1,!!' }, NOW)).toBe(false)
    expect(await verifySvix(SECRET, '{}', { id: 'x', timestamp: String(NOW), signature: '' }, NOW)).toBe(false)
    expect(await verifySvix(SECRET, '{}', { id: 'x', timestamp: String(NOW), signature: 'v2,abcd' }, NOW)).toBe(false)
    expect(await verifySvix('whsec_%%%', '{}', { id: 'x', timestamp: String(NOW), signature: 'v1,abcd' }, NOW)).toBe(
      false,
    )
  })
})

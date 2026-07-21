// Record-steal notification email: copy + Resend delivery.
//
// Deliberately pure (no Deno APIs, no supabase-js, no engine imports) so the
// module can be unit-tested by the regular vitest suite — fetch is injected
// rather than reached for globally.

export type StealEmailInput = { courseName: string; thiefName: string; siteUrl: string }

/** Clubhouse names allow apostrophes, angle brackets could sneak in — escape
 *  everything interpolated into the HTML variant. */
function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

export function buildStealEmail(input: StealEmailInput): { subject: string; text: string; html: string } {
  const { courseName, thiefName, siteUrl } = input
  const subject = `Your record at ${courseName} just got stolen`
  const text = [
    `${thiefName} just knocked you off the top of the board at ${courseName}.`,
    '',
    `Records don't defend themselves — grab your clubs.`,
    '',
    `Take it back: ${siteUrl}`,
  ].join('\n')
  const html = [
    `<p><strong>${escapeHtml(thiefName)}</strong> just knocked you off the top of the board at ${escapeHtml(courseName)}.</p>`,
    `<p>Records don&#39;t defend themselves &mdash; grab your clubs.</p>`,
    `<p><a href="${escapeHtml(siteUrl)}">Take it back</a></p>`,
  ].join('\n')
  return { subject, text, html }
}

/** One POST to Resend, no retries — the dedupe row was already written, so a
 *  failed send stays failed (at-most-once, by design). */
export async function sendViaResend(
  fetchFn: typeof fetch,
  apiKey: string,
  from: string,
  to: string,
  msg: { subject: string; text: string; html: string },
): Promise<{ ok: boolean; status: number }> {
  const res = await fetchFn('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ from, to, subject: msg.subject, html: msg.html, text: msg.text }),
  })
  return { ok: res.ok, status: res.status }
}

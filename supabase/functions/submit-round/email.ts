// Record-steal notification email: copy + Resend delivery.
//
// The card itself is the shared chassis in ../_shared/email-chassis.ts, which
// every DogLeg email renders through — including the sign-in and confirm-email
// templates that used to be dashboard-only. This file is just the copy.
//
// Deliberately pure (no Deno APIs, no supabase-js, no engine imports) so the
// module can be unit-tested by the regular vitest suite — fetch is injected
// rather than reached for globally.

import { escapeHtml, renderEmail } from '../_shared/email-chassis.ts'

export type StealEmailInput = { courseName: string; thiefName: string; siteUrl: string }

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

  const thief = escapeHtml(thiefName)
  const course = escapeHtml(courseName)
  const url = escapeHtml(siteUrl)

  // The who/where goes in the lower-third slab rather than the sentence: it is
  // the whole payload of this mail, and it survives being skimmed in a
  // notification shade. The lead carries the needle instead.
  const html = renderEmail({
    title: `Record stolen at ${course}`,
    preheader: `${thief} now holds the course record at ${course}.`,
    headline: 'Your record&rsquo;s been stolen',
    leadHtml:
      'Someone just knocked you off the top of the board. Records don&rsquo;t defend themselves &mdash; grab your clubs.',
    block: [
      { label: 'Course', value: course },
      { label: 'New record holder', value: thief },
    ],
    cta: { label: 'Take it back', url },
    fallbackUrl: url,
    footerFineHtml:
      'You&rsquo;re getting this because your clubhouse is linked to this email and someone took what&rsquo;s yours. At most one of these per course per day.',
  })

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

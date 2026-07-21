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
  const thief = escapeHtml(thiefName)
  const course = escapeHtml(courseName)
  const url = escapeHtml(siteUrl)
  // Mirrors the sign-in email's card: cream/forest palette, Georgia headings,
  // gold tagline, terracotta button, dl-* dark-mode overrides. Keep the two
  // templates visually in lockstep — the sign-in one lives in the Supabase
  // dashboard (Auth > Email Templates), not in this repo.
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title>Record stolen at ${course}</title>
  <style>
    :root { color-scheme: light dark; supported-color-schemes: light dark; }
    @media (prefers-color-scheme: dark) {
      .dl-outer   { background-color:#0d1a12 !important; }
      .dl-card    { border-color:rgba(244,239,227,0.10) !important; box-shadow:0 8px 28px rgba(0,0,0,0.45) !important; }
      .dl-header  { background-color:#0f2016 !important; }
      .dl-body    { background-color:#16281c !important; color:#e9e2cf !important; }
      .dl-h1      { color:#f4efe3 !important; }
      .dl-lead    { color:#c2cdbf !important; }
      .dl-hint    { color:#9aa89a !important; }
      .dl-link    { color:#6fbf66 !important; }
      .dl-footer  { background-color:#0f2016 !important; border-top-color:rgba(244,239,227,0.10) !important; }
      .dl-fine    { color:#8a9188 !important; }
      .dl-domain  { color:#9aa89a !important; }
      .dl-domain a{ color:#6fbf66 !important; }
    }
    u + .body .dl-body { background-color:#16281c; }
  </style>
</head>
<body class="body" style="margin:0;padding:0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="dl-outer" style="margin:0;padding:0;background-color:#e9e2cf;">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="dl-card" style="max-width:480px;width:100%;border-radius:16px;overflow:hidden;border:1px solid rgba(29,43,32,0.14);box-shadow:0 8px 28px rgba(20,42,28,0.18);">

        <tr>
          <td class="dl-header" style="background-color:#142a1c;padding:28px 32px;">
            <span style="font-family:Georgia,'Times New Roman',serif;font-size:24px;font-weight:700;letter-spacing:0.5px;color:#f4efe3;">
              &#9971; DogLeg
            </span>
            <div style="margin-top:4px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:#c9a227;">
              Daily golf strategy
            </div>
          </td>
        </tr>

        <tr>
          <td class="dl-body" style="background-color:#f4efe3;padding:36px 32px 32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1d2b20;">
            <h1 class="dl-h1" style="margin:0 0 12px;font-family:Georgia,'Times New Roman',serif;font-size:22px;font-weight:700;color:#142a1c;">
              Your record&rsquo;s been stolen
            </h1>
            <p class="dl-lead" style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#3a4a3d;">
              <strong>${thief}</strong> just knocked you off the top of the board at
              <strong>${course}</strong>. Records don&rsquo;t defend themselves &mdash; grab your clubs.
            </p>

            <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 8px;">
              <tr>
                <td align="center" style="border-radius:10px;background-color:#c05b4d;">
                  <a href="${url}" target="_blank" style="display:inline-block;padding:14px 40px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:16px;font-weight:600;color:#f8f4e9;text-decoration:none;border-radius:10px;">
                    Take it back
                  </a>
                </td>
              </tr>
            </table>

            <p class="dl-hint" style="margin:20px 0 6px;font-size:13px;line-height:1.5;color:#6b7a6d;">
              Button won&rsquo;t swing? Paste this into your browser:
            </p>
            <p style="margin:0;font-size:13px;line-height:1.5;word-break:break-all;">
              <a href="${url}" target="_blank" class="dl-link" style="color:#2e6329;text-decoration:underline;">${url}</a>
            </p>
          </td>
        </tr>

        <tr>
          <td class="dl-footer" style="background-color:#f8f4e9;padding:20px 32px;border-top:1px solid rgba(29,43,32,0.12);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
            <p class="dl-fine" style="margin:0;font-size:12px;line-height:1.5;color:#8a9188;">
              You&rsquo;re getting this because your clubhouse is linked to this email
              and someone took what&rsquo;s yours. At most one of these per course per day.
            </p>
            <p class="dl-domain" style="margin:10px 0 0;font-size:12px;color:#a9a494;">
              DogLeg &middot; <a href="https://dogleg.cameronbristol.xyz/" target="_blank" style="color:#2e6329;text-decoration:none;">dogleg.cameronbristol.xyz</a>
            </p>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>
</body>
</html>`
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

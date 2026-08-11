// The DogLeg transactional email chassis — one card, every email we send.
//
// WHY THIS FILE EXISTS
// The record-steal mail lives in this repo; the sign-in and confirm-email mails
// used to live only in the Supabase dashboard, with a comment in email.ts
// asking whoever edited one to please remember to hand-edit the other. They
// drifted, and a rebrand is exactly the moment that bites. Now all three render
// through renderEmail() below, and `pnpm gen:email-templates` writes the two
// auth ones out to supabase/templates/*.html for review and deploy.
//
// Deliberately pure — no Deno APIs, no supabase-js, no engine imports — so the
// vitest suite can render and assert on it like any other module.
//
// DESIGN: the "broadcast" theme, ported from src/ui/theme.css. Mail has no
// cascade worth trusting, no custom properties, and (in Outlook's Word engine)
// no rgba(), so the tokens are resolved to solid hex in INK below rather than
// referenced. theme.css stays the source of truth; when it moves, move these.
// The pre-composited values (textMid etc.) are theme.css's translucent text
// tiers flattened against the surface they sit on — see scripts/, or recompute
// as round(a*fg + (1-a)*bg).
//
// LAYOUT RULES, learned the hard way and cheap to keep:
//   - every colour and font is INLINE on the element; the <style> block only
//     carries the webfont import, which most clients ignore anyway
//   - tables, not divs; no flex, no grid
//   - the card is max-width:480px for real clients, with an MSO conditional
//     wrapper pinning 480px for Outlook, which honours neither max-width nor
//     border-radius (it gets square corners; that is fine)
//   - the wordmark is a hosted PNG: Gmail strips inline SVG. Images-off is the
//     common first-open case in Gmail, so the alt text is styled to stand in,
//     and no information lives only in the image.

/** theme.css, resolved for mail. Names mirror the token names there. */
export const INK = {
  // surfaces
  page: '#0e2114', // --turf-950 / --bg-page
  panel: '#142c1c', // --turf-900 / --bg-panel  (masthead + footer)
  card: '#1c3a26', // --turf-800 / --bg-card    (body)
  blocked: '#efe6cd', // --sand-200 / --bg-blocked (lower-third slabs)

  // text on dark, pre-composited
  textHi: '#f8f3e4', // --text-hi / --sand-100
  textMid: '#babfaf', // --text-mid  over --bg-card
  textLow: '#8a9685', // --text-low  over --bg-card
  textLowPanel: '#869080', // --text-low  over --bg-panel

  // text on the light slab
  onBlock: '#142c1c', // --text-on-block
  onBlockMid: '#5b6554', // --text-on-block-mid over --bg-blocked

  // edges, pre-composited
  hairlineCard: '#304b37', // --edge-hairline over --bg-card
  hairlinePanel: '#293e2e', // --edge-hairline over --bg-panel

  // actions + accents
  action: '#d94a32', // --action-primary / --flag-500
  onAction: '#ffffff', // --action-on-primary
  link: '#7cc36e', // --fairway-300
  kicker: '#c4ac72', // --sand-500
  trophy: '#f6c221', // --trophy-400
} as const

const FONT_DISPLAY = `'Archivo','Helvetica Neue',Helvetica,Arial,sans-serif`
const FONT_UI = `'Barlow',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif`

/** Canonical site. The wordmark is loaded absolute from here rather than from
 *  whatever siteUrl a caller passes: mail only ever goes out from production,
 *  and a localhost asset URL in someone's inbox is a broken image forever. */
export const SITE_URL = 'https://playdogleg.com'
export const WORDMARK_URL = `${SITE_URL}/brand/wordmark-email.png`
/** The same host, as the footer prints it — derived so the link and its label
 *  can never disagree the next time the domain moves. */
export const SITE_HOST = SITE_URL.replace(/^https?:\/\//, '')

/** Clubhouse names allow apostrophes, and angle brackets could sneak in —
 *  escape everything interpolated into the HTML variant. */
export function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

/** One row of the light "lower third" slab: a tracked label over a big value.
 *  Straight off the broadcast graphics in the app — used where the mail has
 *  real data to show (who took your record, and where). */
export type EmailBlockRow = { label: string; value: string }

export type EmailContent = {
  /** <title>, and the hidden preheader that becomes the inbox preview line. */
  title: string
  preheader: string
  headline: string
  /** Lead paragraph. HTML — <strong> welcome; ALREADY ESCAPED by the caller.
   *  The auth templates rely on this to pass Go template tokens through. */
  leadHtml: string
  block?: EmailBlockRow[]
  cta: { label: string; url: string }
  /** Shown under the button as "paste this" fallback. Usually the same as
   *  cta.url; omit only if there is no link at all. */
  fallbackUrl?: string
  /** Small print above the sign-off. HTML, already escaped. */
  footerFineHtml: string
}

function renderBlock(rows: EmailBlockRow[]): string {
  const cells = rows
    .map(
      (r, i) => `
              <tr>
                <td style="padding:${i === 0 ? '0' : '14px'} 0 0;">
                  <div style="font-family:${FONT_UI};font-size:11px;font-weight:600;letter-spacing:0.16em;text-transform:uppercase;color:${INK.onBlockMid};">${r.label}</div>
                  <div style="margin-top:3px;font-family:${FONT_DISPLAY};font-size:19px;font-weight:700;line-height:1.25;color:${INK.onBlock};">${r.value}</div>
                </td>
              </tr>`,
    )
    .join('')
  return `
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 26px;background-color:${INK.blocked};border-radius:10px;">
              <tr>
                <td style="padding:18px 20px;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${cells}
                  </table>
                </td>
              </tr>
            </table>`
}

export function renderEmail(c: EmailContent): string {
  const block = c.block?.length ? renderBlock(c.block) : ''
  const fallback = c.fallbackUrl
    ? `
            <p style="margin:22px 0 6px;font-family:${FONT_UI};font-size:13px;line-height:1.5;color:${INK.textLow};">
              Button won&rsquo;t swing? Paste this into your browser:
            </p>
            <p style="margin:0;font-family:${FONT_UI};font-size:13px;line-height:1.5;word-break:break-all;">
              <a href="${c.fallbackUrl}" target="_blank" style="color:${INK.link};text-decoration:underline;">${c.fallbackUrl}</a>
            </p>`
    : ''

  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <!-- The brand is dark. Declaring it stops Gmail/Outlook re-tinting a design
       that is already where it wants to be. -->
  <meta name="color-scheme" content="dark" />
  <meta name="supported-color-schemes" content="dark" />
  <title>${c.title}</title>
  <!--[if !mso]><!-->
  <style>
    :root { color-scheme: dark; supported-color-schemes: dark; }
    @import url('https://fonts.googleapis.com/css2?family=Archivo:wght@500;600;700&family=Barlow:wght@400;500;600&display=swap');
  </style>
  <!--<![endif]-->
  <!--[if mso]>
  <style>
    /* Word has no webfonts and no letter-spacing; keep it legible instead. */
    body, table, td, p, a, h1 { font-family: Arial, Helvetica, sans-serif !important; }
  </style>
  <![endif]-->
</head>
<body style="margin:0;padding:0;background-color:${INK.page};">

<!-- inbox preview line; never rendered in the body -->
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${c.preheader}</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0;padding:0;background-color:${INK.page};">
  <tr>
    <td align="center" style="padding:32px 16px;">

      <!--[if mso]><table role="presentation" width="480" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;width:100%;border-radius:14px;overflow:hidden;border:1px solid ${INK.hairlinePanel};">

        <!-- broadcast accent rule -->
        <tr>
          <td style="height:4px;line-height:4px;font-size:0;background-color:${INK.action};">&nbsp;</td>
        </tr>

        <!-- masthead -->
        <tr>
          <td style="background-color:${INK.panel};padding:26px 32px 22px;">
            <!-- No height attribute, deliberately. Gmail blocks remote images on
                 first open, and a broken <img> with a height keeps reserving that
                 box — the masthead ends up as alt text floating above a 105px
                 hole. Width alone lets it collapse to the styled alt text, which
                 is why the alt carries the display face and sand ink. -->
            <img src="${WORDMARK_URL}" width="200" alt="DogLeg"
                 style="display:block;border:0;outline:none;text-decoration:none;width:200px;max-width:200px;height:auto;font-family:${FONT_DISPLAY};font-size:30px;font-weight:700;color:${INK.textHi};" />
            <div style="margin-top:10px;font-family:${FONT_UI};font-size:11px;font-weight:600;letter-spacing:0.16em;text-transform:uppercase;color:${INK.kicker};">
              Daily golf challenge
            </div>
          </td>
        </tr>

        <!-- body -->
        <tr>
          <td style="background-color:${INK.card};padding:32px 32px 30px;">
            <h1 style="margin:0 0 12px;font-family:${FONT_DISPLAY};font-size:26px;font-weight:700;line-height:1.15;letter-spacing:-0.01em;color:${INK.textHi};">
              ${c.headline}
            </h1>
            <p style="margin:0 0 26px;font-family:${FONT_UI};font-size:15px;line-height:1.6;color:${INK.textMid};">
              ${c.leadHtml}
            </p>
${block}
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
              <tr>
                <td align="center" style="border-radius:10px;background-color:${INK.action};">
                  <a href="${c.cta.url}" target="_blank"
                     style="display:inline-block;padding:15px 40px;font-family:${FONT_UI};font-size:16px;font-weight:600;letter-spacing:0.01em;color:${INK.onAction};text-decoration:none;border-radius:10px;">
                    ${c.cta.label}
                  </a>
                </td>
              </tr>
            </table>
${fallback}
          </td>
        </tr>

        <!-- footer -->
        <tr>
          <td style="background-color:${INK.panel};padding:20px 32px;border-top:1px solid ${INK.hairlineCard};">
            <p style="margin:0;font-family:${FONT_UI};font-size:12px;line-height:1.55;color:${INK.textLowPanel};">
              ${c.footerFineHtml}
            </p>
            <p style="margin:10px 0 0;font-family:${FONT_UI};font-size:12px;color:${INK.textLowPanel};">
              DogLeg &middot; <a href="${SITE_URL}/" target="_blank" style="color:${INK.link};text-decoration:none;">${SITE_HOST}</a>
            </p>
          </td>
        </tr>

      </table>
      <!--[if mso]></td></tr></table><![endif]-->

    </td>
  </tr>
</table>
</body>
</html>`
}

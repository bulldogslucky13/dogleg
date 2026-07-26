/**
 * DEV-ONLY email gallery — mounted by /_emails.html, never by the app.
 *
 * Transactional mail is the one surface you cannot check by playing: the
 * record-steal note needs someone to actually take your record, and the auth
 * pair needs a real sign-in round trip. So they get looked at here, rendered
 * through the same chassis that ships.
 *
 * Two things worth toggling:
 *   - IMAGES OFF is the common first-open case in Gmail, which blocks remote
 *     images by default. The masthead has to still read as DogLeg.
 *   - 375px is the phone width the rest of the re-skin was verified at.
 *
 * The wordmark is rewritten to a local path here: the chassis points at the
 * production asset, which only exists once the site deploys.
 */
import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { WORDMARK_URL } from '../supabase/functions/_shared/email-chassis.ts'
import { AUTH_EMAILS } from '../supabase/functions/_shared/auth-emails.ts'
import { buildStealEmail } from '../supabase/functions/submit-round/email.ts'

const steal = buildStealEmail({
  courseName: 'Whistling Straits',
  // an apostrophe and an injection attempt, so the escaping is visible here too
  thiefName: "O'Brien <script>",
  siteUrl: 'https://dogleg.cameronbristol.xyz',
})

const EMAILS = [
  { name: 'Record stolen', subject: steal.subject, html: steal.html, text: steal.text },
  ...AUTH_EMAILS.map((e) => ({ name: e.file.replace('.html', ''), subject: e.subject, html: e.html, text: null })),
]

function Frame({ html, width, images }: { html: string; width: number; images: boolean }) {
  const src = html.replaceAll(WORDMARK_URL, images ? '/brand/wordmark-email.png' : '/brand/__blocked.png')
  return (
    <iframe
      title="email"
      srcDoc={src}
      style={{ width, height: 880, border: '1px solid #333', borderRadius: 6, background: '#0e2114' }}
    />
  )
}

function Gallery() {
  const [images, setImages] = useState(true)
  const [width, setWidth] = useState(560)

  return (
    <div style={{ font: '14px system-ui', background: '#111', color: '#eee', minHeight: '100vh', padding: 24 }}>
      <h1 style={{ font: '600 20px system-ui', margin: '0 0 4px' }}>DogLeg — transactional email (dev only)</h1>
      <p style={{ margin: '0 0 16px', color: '#999' }}>
        Rendered through <code>supabase/functions/_shared/email-chassis.ts</code>.
      </p>
      <div style={{ display: 'flex', gap: 16, marginBottom: 20, alignItems: 'center', flexWrap: 'wrap' }}>
        <label>
          <input type="checkbox" checked={images} onChange={(e) => setImages(e.target.checked)} /> images on
        </label>
        {[560, 375, 320].map((w) => (
          <button key={w} onClick={() => setWidth(w)} style={{ fontWeight: width === w ? 700 : 400 }}>
            {w}px
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {EMAILS.map((e) => (
          <div key={e.name}>
            <div style={{ marginBottom: 6, color: '#7cc36e', fontWeight: 600 }}>{e.name}</div>
            <div style={{ marginBottom: 8, color: '#999', maxWidth: width }}>subject: {e.subject}</div>
            <Frame html={e.html} width={width} images={images} />
            {e.text && (
              <details style={{ marginTop: 8, maxWidth: width }}>
                <summary style={{ cursor: 'pointer', color: '#999' }}>plain-text part</summary>
                <pre style={{ whiteSpace: 'pre-wrap', color: '#ccc', fontSize: 12 }}>{e.text}</pre>
              </details>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<Gallery />)

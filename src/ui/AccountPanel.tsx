import { useEffect, useState } from 'react'
import { backendEnabled } from '../lib/backend'
import { currentEmail, sendMagicLink, signOut, syncAccount } from '../lib/auth'
import { loadPlayer } from '../lib/leaderboard'

/**
 * Optional account sync, tucked under the home screen. Three states:
 * signed out (email form) → link sent → signed in (synced identity).
 * Magic-link redirects land on the home screen, so this panel also runs
 * the reconcile step that adopts your identity onto a new device.
 */
export function AccountPanel() {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [signedInAs, setSignedInAs] = useState<string | null>(null)
  const [playerName, setPlayerName] = useState<string | null>(loadPlayer()?.name ?? null)
  const [needsName, setNeedsName] = useState(false)
  const [nameInput, setNameInput] = useState('')
  const [error, setError] = useState<string | null>(null)

  // on mount: pick up a magic-link session and reconcile identities
  useEffect(() => {
    if (!backendEnabled) return
    void (async () => {
      const addr = await currentEmail()
      setSignedInAs(addr)
      if (!addr) return
      const out = await syncAccount()
      if (out.status === 'needsname') {
        setNeedsName(true)
        setOpen(true)
      } else if (out.player) {
        setPlayerName(out.player.name)
        if (out.status === 'adopted') setOpen(true) // show the win on a new device
      }
    })()
  }, [])

  if (!backendEnabled) return null

  const sendLink = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const r = await sendMagicLink(email.trim())
    setBusy(false)
    if (!r.ok) setError(r.error ?? 'could not send the link')
    else setSent(true)
  }

  const claimName = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const out = await syncAccount(nameInput.trim())
    setBusy(false)
    if (out.player) {
      setPlayerName(out.player.name)
      setNeedsName(false)
    } else setError(out.error ?? 'could not claim that name')
  }

  return (
    <div className="account-panel">
      <button className="home-link" onClick={() => setOpen((v) => !v)}>
        {signedInAs ? `⛅ Synced · ${playerName ?? signedInAs}` : '⛅ Sync across devices'}
      </button>
      {open && (
        <div className="account-body">
          {signedInAs ? (
            needsName ? (
              <>
                <p className="fine">You're signed in as {signedInAs} — pick your clubhouse name to finish.</p>
                <form className="name-form" onSubmit={claimName}>
                  <input
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    placeholder="Clubhouse name"
                    maxLength={18}
                    aria-label="Clubhouse name"
                  />
                  <button className="cta slim" disabled={busy || nameInput.trim().length < 2} type="submit">
                    Claim it
                  </button>
                </form>
              </>
            ) : (
              <>
                <p className="fine">
                  Signed in as <b>{signedInAs}</b>
                  {playerName ? (
                    <>
                      {' '}— <b>{playerName}</b> plays on every device you sign in on.
                    </>
                  ) : null}
                </p>
                <button
                  className="cta ghost slim"
                  onClick={async () => {
                    await signOut()
                    setSignedInAs(null)
                    setSent(false)
                  }}
                >
                  Sign out (this device keeps its name)
                </button>
              </>
            )
          ) : sent ? (
            <p className="fine">✉️ Check your email and tap the link — it lands you back here, synced.</p>
          ) : (
            <>
              <p className="fine">
                Optional: add an email to carry your clubhouse name to your phone, laptop, anywhere — and to
                recover it if a browser gets wiped.
              </p>
              <form className="name-form" onSubmit={sendLink}>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  aria-label="Email for magic link"
                />
                <button className="cta slim" disabled={busy || !email.includes('@')} type="submit">
                  Send magic link
                </button>
              </form>
            </>
          )}
          {error && <p className="fine board-error">{error}</p>}
        </div>
      )}
    </div>
  )
}

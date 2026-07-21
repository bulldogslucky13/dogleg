import { useEffect, useState } from 'react'
import { backendEnabled } from '../lib/backend'
import { currentEmail, sendMagicLink, signOut, syncAccount } from '../lib/auth'
import { fetchMyHistory, loadPlayer } from '../lib/leaderboard'
import { mergeHistory, type HistoryEntry } from '../state/store'
import { track } from '../lib/analytics'
import { Spinner } from './Spinner'

/**
 * Optional account sync, tucked under the home screen. Three states:
 * signed out (email form) → link sent → signed in (synced identity).
 * Magic-link redirects land on the home screen, so this panel also runs
 * the reconcile step that adopts your identity onto a new device — and then
 * pulls the account's submitted rounds into local history so streaks and
 * "played today" follow the player across devices.
 */
export function AccountPanel(props: { onHistorySynced?: (h: HistoryEntry[]) => void; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(props.defaultOpen ?? false)
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [signedInAs, setSignedInAs] = useState<string | null>(null)
  const [playerName, setPlayerName] = useState<string | null>(loadPlayer()?.name ?? null)
  const [needsName, setNeedsName] = useState(false)
  const [nameInput, setNameInput] = useState('')
  const [error, setError] = useState<string | null>(null)

  // after any successful sync: pull this player's submitted rounds down and
  // merge them into local history, so this device's streak catches up
  const pullHistory = async () => {
    const remote = await fetchMyHistory()
    if (remote?.length) props.onHistorySynced?.(mergeHistory(remote))
  }

  // on mount: pick up a magic-link session and reconcile identities
  useEffect(() => {
    if (!backendEnabled) return
    void (async () => {
      const addr = await currentEmail()
      setSignedInAs(addr)
      if (!addr) return
      const out = await syncAccount()
      // cross-device sign-in reconciled — status distinguishes a fresh adopt on
      // a new device from an existing identity re-confirming
      track('account_synced', { status: out.status })
      if (out.status === 'needsname') {
        setNeedsName(true)
        setOpen(true)
      } else if (out.player) {
        setPlayerName(out.player.name)
        if (out.status === 'adopted') setOpen(true) // show the win on a new device
        await pullHistory()
      }
    })()
    // mount-only: reruns would re-fire the whole reconcile
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!backendEnabled) return null

  const sendLink = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const r = await sendMagicLink(email.trim())
    setBusy(false)
    if (!r.ok) setError(r.error ?? 'could not send the link')
    else {
      // top of the cross-device funnel — email intentionally NOT sent as a prop
      track('magic_link_sent')
      setSent(true)
    }
  }

  const claimName = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const out = await syncAccount(nameInput.trim())
    setBusy(false)
    if (out.player) {
      track('clubhouse_name_claimed', { via: 'account' })
      setPlayerName(out.player.name)
      setNeedsName(false)
      await pullHistory()
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
                    disabled={busy}
                  />
                  <button className="cta slim" disabled={busy || nameInput.trim().length < 2} type="submit">
                    {busy ? (
                      <>
                        <Spinner />
                        Claiming…
                      </>
                    ) : (
                      'Claim it'
                    )}
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
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true)
                    await signOut()
                    track('signed_out')
                    setBusy(false)
                    setSignedInAs(null)
                    setSent(false)
                  }}
                >
                  {busy ? (
                    <>
                      <Spinner />
                      Signing out…
                    </>
                  ) : (
                    'Sign out (this device keeps its name)'
                  )}
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
                  disabled={busy}
                />
                <button className="cta slim" disabled={busy || !email.includes('@')} type="submit">
                  {busy ? (
                    <>
                      <Spinner />
                      Sending…
                    </>
                  ) : (
                    'Send magic link'
                  )}
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

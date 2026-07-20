import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { SUPABASE_ANON_KEY, SUPABASE_URL, backendEnabled } from './backend'
import { loadIdentity, savePlayerIdentity, type Player } from './leaderboard'

/**
 * Optional email accounts (magic links) for cross-device sync. Entirely
 * additive: clubhouse-name-only players never touch any of this. The email
 * proves you own the account; the link-account function moves your player
 * identity (name + secret) onto whatever device you sign in from.
 */

export const supabase: SupabaseClient | null = backendEnabled
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null

export async function sendMagicLink(email: string): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'sync disabled' }
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin },
  })
  return error ? { ok: false, error: error.message } : { ok: true }
}

export async function currentEmail(): Promise<string | null> {
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  return data.session?.user.email ?? null
}

export async function signOut(): Promise<void> {
  await supabase?.auth.signOut()
}

export interface SyncOutcome {
  status: 'signedout' | 'linked' | 'adopted' | 'needsname' | 'error'
  player?: Player
  error?: string
}

/**
 * Reconcile the signed-in account with this device's identity:
 * - device has a player, account doesn't → attach the player to the account
 * - account has a player, device doesn't (new device) → adopt it here
 * - both → the account's player wins (that's the synced identity)
 * - neither → the caller should ask for a clubhouse name
 */
export async function syncAccount(name?: string): Promise<SyncOutcome> {
  if (!supabase) return { status: 'signedout' }
  const { data } = await supabase.auth.getSession()
  const session = data.session
  if (!session) return { status: 'signedout' }
  // the full identity, named or not: an anonymous minted id must be the one
  // that gets linked (and named), or the daily its dice were salted for
  // would no longer belong to the player submitting it
  const local = loadIdentity()
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/link-account`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${session.access_token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        ...(local ? { playerId: local.id, playerSecret: local.secret } : {}),
        ...(name ? { name } : {}),
      }),
    })
    const body = (await res.json()) as { player?: Player; status?: string; error?: string }
    if (!res.ok) return { status: 'error', error: body.error ?? `sync failed (${res.status})` }
    if (!body.player) return { status: 'needsname' }
    savePlayerIdentity(body.player)
    return { status: local && body.player.id === local.id ? 'linked' : 'adopted', player: body.player }
  } catch {
    return { status: 'error', error: 'network hiccup — try again' }
  }
}

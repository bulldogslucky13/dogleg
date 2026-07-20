// Dogleg mint-player edge function (Deno).
//
// Mints an anonymous player identity: a nameless players row, returned as
// { id, secret }. The client calls this at app start so that even a player
// who has never claimed a clubhouse name has a server-minted id — which is
// what the per-player daily dice salt derives from. Server-minted matters:
// a client free to choose its own id could grind ids offline until the
// derived salt dealt a lucky round. The name (if the player ever posts a
// card) lands on this same row later via submit-round or link-account, so
// nothing ever needs merging.
//
// Rate-limited per hashed IP per UTC day so a script can't stockpile ids to
// grind salts through — the same Sybil surface name-registration already
// has, kept at the same (bounded) size. Only a salted hash of the IP is
// stored, and never on the player row.
// deno-lint-ignore-file no-explicit-any
import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'content-type': 'application/json' } })

const MINTS_PER_IP_PER_DAY = 20

function utcDateKey(): string {
  const d = new Date()
  return `${d.getUTCFullYear()}-${`${d.getUTCMonth() + 1}`.padStart(2, '0')}-${`${d.getUTCDate()}`.padStart(2, '0')}`
}

async function sha256Hex(s: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json(405, { error: 'POST only' })

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  // ---- per-IP daily cap ----
  const day = utcDateKey()
  const ip = (req.headers.get('x-forwarded-for') ?? 'unknown').split(',')[0].trim()
  const ipHash = await sha256Hex(`dogleg-mint:${day}:${ip}`) // day in the salt: no cross-day linkage
  const { data: count, error: bumpErr } = await supabase.rpc('bump_mint', { p_day: day, p_ip_hash: ipHash })
  if (bumpErr) return json(500, { error: 'could not mint a player' })
  if ((count ?? 0) > MINTS_PER_IP_PER_DAY) return json(429, { error: 'easy now — try again tomorrow' })

  // ---- mint the nameless identity ----
  const { data, error } = await supabase.from('players').insert({}).select('id, secret').single()
  if (error) return json(500, { error: 'could not mint a player' })
  return json(200, { player: { id: data.id, secret: data.secret } })
})

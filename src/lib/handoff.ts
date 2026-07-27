/**
 * Cross-origin clubhouse handoff — the playdogleg.com move.
 *
 * localStorage is per-origin, so nothing on the old domain follows a player
 * here on its own: not the clubhouse name, not the streak, and not the player
 * id the daily dice are salted from — losing that id deals you DIFFERENT dice
 * for a day you have already posted, which is the part that actually breaks
 * the game rather than just annoying someone.
 *
 * So the old domain keeps serving exactly one page (`handoff/index.html` in
 * this repo). It packs its localStorage into a URL fragment and bounces the
 * browser here; this module is the receiving half. An old bookmark migrates
 * its owner with zero clicks, and keeps doing so for as long as that page is
 * up.
 *
 * WHY A FRAGMENT. It never leaves the browser — fragments aren't sent to
 * servers and don't appear in a Referer — and we strip ours with replaceState
 * the moment it's read, so the player's own address bar is the whole exposure
 * window for their secret. A one-time server-minted token would close even
 * that; it was weighed and deliberately not built (README, "Moving the
 * domain"). `window.name` would carry more bytes with no URL at all, but
 * Chrome clears it across cross-site navigations — which is precisely this
 * navigation — so it silently transfers nothing.
 *
 * The pack sweeps EVERY `dogleg:` key rather than a hand-listed set: a new
 * persistence key is then carried across without anyone having to remember
 * this file exists.
 */

const KEY_PREFIX = 'dogleg:'
const PLAYER_KEY = 'dogleg:player:v1'
const HISTORY_KEY = 'dogleg:history:v1'
const ARCHIVE_KEY = 'dogleg:archive:v1'
const LIFETIME_KEY = 'dogleg:lifetime:v1'
const FORTUNE_KEY = 'dogleg:fortune:v1'

/** Codec markers. Both halves are hand-written on opposite sides of a domain
 *  move and can never share a bundle, so the wire format is explicit. */
const GZIP = 'z.'
const PLAIN = 'p.'

export interface HandoffPayload {
  v: 1
  keys: Record<string, string>
}

export type ImportOutcome =
  /** carried across (possibly merged into what was already here) */
  | 'imported'
  /** this device already holds a DIFFERENT named clubhouse — left untouched */
  | 'conflict'
  /** payload was truncated, corrupt, or not ours */
  | 'invalid'

// ---------------------------------------------------------------------------
// wire format
// ---------------------------------------------------------------------------

function toBase64Url(bytes: Uint8Array): string {
  let s = ''
  // chunked: String.fromCharCode(...bytes) blows the argument limit somewhere
  // north of 100k, which a fat archive would reach
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    s += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(s).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

function fromBase64Url(s: string): Uint8Array {
  const b64 = s.replaceAll('-', '+').replaceAll('_', '/')
  const bin = atob(b64.padEnd(b64.length + ((4 - (b64.length % 4)) % 4), '='))
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

/** Push bytes through a compression stream without Blob/Response, so the same
 *  code runs in a browser, in jsdom, and in node under vitest. */
async function through(bytes: Uint8Array, ts: TransformStream<Uint8Array, Uint8Array>): Promise<Uint8Array> {
  const writer = ts.writable.getWriter()
  // A malformed payload rejects on BOTH ends of the stream. The read side is
  // the one awaited below, so it carries the failure into unpackHandoff's
  // catch; without this the write side's twin rejection floats free and
  // surfaces as an unhandled rejection.
  void writer
    .write(bytes)
    .then(() => writer.close())
    .catch(() => {})
  const reader = ts.readable.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (value) {
      chunks.push(value)
      total += value.length
    }
  }
  const out = new Uint8Array(total)
  let at = 0
  for (const c of chunks) {
    out.set(c, at)
    at += c.length
  }
  return out
}

/** Pack a whole origin's DogLeg storage into one URL-safe string.
 *  Exported for the tests and for `handoff/index.html` to be checked against. */
export async function packHandoff(store: Storage): Promise<string> {
  const keys: Record<string, string> = {}
  for (let i = 0; i < store.length; i++) {
    const k = store.key(i)
    if (!k || !k.startsWith(KEY_PREFIX)) continue
    const v = store.getItem(k)
    if (v !== null) keys[k] = v
  }
  const json = JSON.stringify({ v: 1, keys } satisfies HandoffPayload)
  const bytes = new TextEncoder().encode(json)
  const CS = (globalThis as { CompressionStream?: typeof CompressionStream }).CompressionStream
  // gzip is what makes carrying the full round archive viable in a URL: the
  // archive is already pruned (10 recent + PRs + trophies), and JSON of that
  // shape packs roughly 8x
  if (!CS) return PLAIN + toBase64Url(bytes)
  return GZIP + toBase64Url(await through(bytes, new CS('gzip') as TransformStream<Uint8Array, Uint8Array>))
}

export async function unpackHandoff(payload: string): Promise<HandoffPayload | null> {
  try {
    const body = payload.slice(2)
    let bytes: Uint8Array
    if (payload.startsWith(GZIP)) {
      const DS = (globalThis as { DecompressionStream?: typeof DecompressionStream }).DecompressionStream
      if (!DS) return null
      bytes = await through(fromBase64Url(body), new DS('gzip') as TransformStream<Uint8Array, Uint8Array>)
    } else if (payload.startsWith(PLAIN)) {
      bytes = fromBase64Url(body)
    } else {
      return null
    }
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as HandoffPayload
    if (parsed?.v !== 1 || !parsed.keys || typeof parsed.keys !== 'object') return null
    return { v: 1, keys: parsed.keys }
  } catch {
    // truncated by a chat client, hand-edited, or simply not ours
    return null
  }
}

// ---------------------------------------------------------------------------
// merge
// ---------------------------------------------------------------------------

interface StoredIdentity {
  id: string
  secret: string
  name: string | null
}

function readIdentity(raw: string | null): StoredIdentity | null {
  if (!raw) return null
  try {
    const p = JSON.parse(raw) as StoredIdentity
    return p?.id && p.secret ? { id: p.id, secret: p.secret, name: p.name ?? null } : null
  } catch {
    return null
  }
}

function parseArray<T>(raw: string | null): T[] {
  if (!raw) return []
  try {
    const j = JSON.parse(raw) as T[]
    return Array.isArray(j) ? j : []
  } catch {
    return []
  }
}

/** Union by day, local winning ties — the same rule `mergeHistory` applies to
 *  server-fetched rounds (the device that played the round holds the
 *  authoritative entry). Kept as raw JSON so this module stays independent of
 *  the store's types. */
function mergeHistoryJson(local: string, incoming: string): string {
  const mine = parseArray<{ dateKey: string }>(local)
  const theirs = parseArray<{ dateKey: string }>(incoming)
  if (!theirs.length) return local
  const have = new Set(mine.map((e) => e.dateKey))
  const merged = [...mine, ...theirs.filter((e) => !have.has(e.dateKey))]
  merged.sort((a, b) => a.dateKey.localeCompare(b.dateKey))
  return JSON.stringify(merged)
}

/** Rounds are identified by their seed — a daily seed already includes the day
 *  and the per-player salt, and a practice seed is minted per round. */
function mergeArchiveJson(local: string, incoming: string): string {
  const mine = parseArray<{ seed: string; playedAt: number }>(local)
  const theirs = parseArray<{ seed: string; playedAt: number }>(incoming)
  if (!theirs.length) return local
  const have = new Set(mine.map((r) => r.seed))
  const merged = [...mine, ...theirs.filter((r) => !have.has(r.seed))]
  merged.sort((a, b) => b.playedAt - a.playedAt)
  return JSON.stringify(merged)
}

/** Counters toward the destiny guarantee. Highest wins per counter: a player
 *  carrying progress across should never be set back by an empty device, and
 *  can't gain by bouncing through the handoff twice either. */
function mergeFortuneJson(local: string, incoming: string): string {
  try {
    const a = JSON.parse(local) as { p?: Record<string, number> }
    const b = JSON.parse(incoming) as { p?: Record<string, number> }
    if (!a?.p) return incoming
    if (!b?.p) return local
    const p: Record<string, number> = { ...a.p }
    for (const [k, v] of Object.entries(b.p)) {
      if (typeof v === 'number' && (typeof p[k] !== 'number' || v > p[k])) p[k] = v
    }
    return JSON.stringify({ p })
  } catch {
    return local
  }
}

function mergeInto(store: Storage, key: string, incoming: string): void {
  const local = store.getItem(key)
  if (local === null) {
    store.setItem(key, incoming)
    return
  }
  switch (key) {
    case HISTORY_KEY:
      store.setItem(key, mergeHistoryJson(local, incoming))
      return
    case ARCHIVE_KEY:
      store.setItem(key, mergeArchiveJson(local, incoming))
      return
    case FORTUNE_KEY:
      store.setItem(key, mergeFortuneJson(local, incoming))
      return
    case LIFETIME_KEY: {
      const n = Math.max(Number(local) || 0, Number(incoming) || 0)
      store.setItem(key, String(n))
      return
    }
    default:
      // acks, tutorial flags, view mode, an in-progress round: whatever this
      // device already believes wins. None of it is worth overwriting a live
      // round for.
      return
  }
}

/**
 * Apply a packed payload to this origin.
 *
 * The one refusal: a device that already holds a NAMED clubhouse of its own
 * keeps it. Anything else would have to guess which of two identities a person
 * meant, and guessing wrong posts one player's rounds under the other's name.
 * A nameless identity is always safe to replace — a name is claimed on first
 * submission, so an anonymous row has no posted rounds to strand.
 */
export async function importHandoff(payload: string, store: Storage): Promise<ImportOutcome> {
  const unpacked = await unpackHandoff(payload)
  if (!unpacked) return 'invalid'
  const incoming = readIdentity(unpacked.keys[PLAYER_KEY] ?? null)
  const local = readIdentity(store.getItem(PLAYER_KEY))
  if (local?.name && local.id !== incoming?.id) return 'conflict'
  for (const [key, value] of Object.entries(unpacked.keys)) {
    if (!key.startsWith(KEY_PREFIX) || typeof value !== 'string') continue
    if (key === PLAYER_KEY) {
      // local is absent or anonymous (guarded above) — the arriving identity
      // is the one with rounds behind it
      if (incoming) store.setItem(key, JSON.stringify(incoming))
      continue
    }
    mergeInto(store, key, value)
  }
  return 'imported'
}

// ---------------------------------------------------------------------------
// entry point
// ---------------------------------------------------------------------------

/** Cheap synchronous probe so boot only ever waits on the unpack when there
 *  is genuinely something to unpack. */
export function handoffPending(): boolean {
  return typeof window !== 'undefined' && /[#&]handoff=/.test(window.location.hash)
}

/** Read `#handoff=…` and strip it in the same breath: the payload must not
 *  survive in the address bar, in a copied link, or across a reload. */
export function takeHandoffFromUrl(): string | null {
  if (typeof window === 'undefined') return null
  const m = /[#&]handoff=([A-Za-z0-9_.-]+)/.exec(window.location.hash)
  if (!m) return null
  const cleaned = window.location.hash.replace(m[0], m[0].startsWith('&') ? '' : '#').replace(/^#&/, '#')
  try {
    window.history.replaceState(null, '', window.location.pathname + window.location.search + (cleaned === '#' ? '' : cleaned))
  } catch {
    /* about:blank in a test harness — the import still stands */
  }
  return m[1]
}

/**
 * Called once at boot, before React mounts, so the app never renders a frame
 * as the wrong player and `ensureIdentity` never mints a competing id.
 * Returns null when there was no handoff to do — the overwhelmingly common
 * case, and it costs one regex.
 */
export async function runHandoff(): Promise<ImportOutcome | null> {
  const payload = takeHandoffFromUrl()
  if (!payload) return null
  try {
    return await importHandoff(payload, localStorage)
  } catch {
    return 'invalid'
  }
}

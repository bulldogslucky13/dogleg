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
 * this file exists. Only a handful of keys need bespoke MERGE behavior
 * (below) — everything else either takes the incoming value (device had
 * nothing of its own) or keeps what's already here.
 *
 * WHY THE STORAGE KEYS ARE RE-DECLARED RATHER THAN IMPORTED. This module has
 * zero imports on purpose. It runs unconditionally, eagerly, before mount, on
 * every single load (main.tsx) — importing `leaderboard.ts`, `store.ts`,
 * `stats.ts`, or `records.ts` for their key constants would pull the
 * identity/backend/engine module graph into that path for the 99.9% of loads
 * that never touch a handoff. A handful of duplicated string literals is a
 * cheaper cost than that.
 */

const KEY_PREFIX = 'dogleg:'
const PLAYER_KEY = 'dogleg:player:v1'
const HISTORY_KEY = 'dogleg:history:v1'
const ARCHIVE_KEY = 'dogleg:archive:v1'
const ROUNDLOG_KEY = 'dogleg:roundlog:v1'
const RECORDS_KEY = 'dogleg:records:v1'
const POSTED_KEY = 'dogleg:posted:v1'
const LIFETIME_KEY = 'dogleg:lifetime:v1'
const FORTUNE_KEY = 'dogleg:fortune:v1'
/** An in-progress round is device/session state, not identity state — it
 *  never follows a handoff in EITHER direction. Carrying one across could
 *  hand a brand-new device someone else's mid-round shot decisions, or
 *  resume a round for a day the merged history already shows as posted. */
const ROUND_KEY = 'dogleg:round:v1'

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

/** Push bytes through a compression stream. Response/arrayBuffer does the
 *  draining for us — a browser or Node new enough to have
 *  CompressionStream/DecompressionStream also has this. (The standalone twin
 *  in handoff/index.html deliberately does NOT use this shortcut: that page
 *  has to keep working on whatever ancient browser opens a years-old
 *  bookmark, unattended, forever, so it hand-rolls the identical drain with
 *  no dependency on Response accepting a streaming body. This module ships
 *  inside the normal app bundle, targeting the same browsers the rest of the
 *  app already requires, so the shortcut is safe here.) */
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
  return new Uint8Array(await new Response(ts.readable).arrayBuffer())
}

/** Pack a whole origin's DogLeg storage into one URL-safe string.
 *  Exported for the tests and for `handoff/index.html` to be checked against. */
export async function packHandoff(store: Storage): Promise<string> {
  const keys: Record<string, string> = {}
  try {
    for (let i = 0; i < store.length; i++) {
      const k = store.key(i)
      if (!k || !k.startsWith(KEY_PREFIX)) continue
      const v = store.getItem(k)
      if (v !== null) keys[k] = v
    }
  } catch {
    // storage enumeration blocked (private mode) — pack whatever we already
    // have, which for a throw on the first access is nothing; matches the
    // same guard handoff/index.html's collect() applies to the identical loop
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

/** Union two JSON arrays by a key, local winning ties, then sort. Shared by
 *  every "keep both, dedup by identity" merge below — history and the round
 *  archive are the same shape of problem (dedup by day / dedup by seed),
 *  and the round log makes a third. */
function mergeUnionByKey<T>(local: string, incoming: string, keyOf: (item: T) => string, compare: (a: T, b: T) => number): string {
  const mine = parseArray<T>(local)
  const theirs = parseArray<T>(incoming)
  if (!theirs.length) return local
  const have = new Set(mine.map(keyOf))
  const fresh = theirs.filter((item) => !have.has(keyOf(item)))
  if (!fresh.length) return local
  return JSON.stringify([...mine, ...fresh].sort(compare))
}

/** Union by day, local winning ties — the same rule `mergeHistory` applies to
 *  server-fetched rounds (the device that played the round holds the
 *  authoritative entry). Kept as raw JSON so this module stays independent of
 *  the store's types. */
function mergeHistoryJson(local: string, incoming: string): string {
  return mergeUnionByKey<{ dateKey: string }>(
    local,
    incoming,
    (e) => e.dateKey,
    (a, b) => a.dateKey.localeCompare(b.dateKey),
  )
}

/** Rounds are identified by their seed — a daily seed already includes the day
 *  and the per-player salt, and a practice seed is minted per round. Merged
 *  unpruned: the local archive is already prune-bounded by normal play, and
 *  the very next round finished re-applies pruneArchive's retention rule. */
function mergeArchiveJson(local: string, incoming: string): string {
  return mergeUnionByKey<{ seed: string; playedAt: number }>(
    local,
    incoming,
    (r) => r.seed,
    (a, b) => b.playedAt - a.playedAt,
  )
}

/** The round log (`dogleg:roundlog:v1`) is what "every lifetime stat, the
 *  handicap window, and every scorecard in the Locker computes FROM"
 *  (stats.ts) — losing half of it on a handoff would quietly understate a
 *  migrated player's whole history. Unlike the archive it's never pruned, so
 *  the union just grows; same dedup-by-seed shape one level inside a
 *  `{v, rounds}` envelope instead of a bare array. */
function mergeRoundLogJson(local: string, incoming: string): string {
  let mine: { v: 1; rounds: { seed: string; playedAt: number }[] } | null
  let theirs: { v: 1; rounds: { seed: string; playedAt: number }[] } | null
  try {
    const j = JSON.parse(local) as { v: 1; rounds: unknown }
    mine = Array.isArray(j?.rounds) ? (j as typeof mine) : null
  } catch {
    mine = null
  }
  try {
    const j = JSON.parse(incoming) as { v: 1; rounds: unknown }
    theirs = Array.isArray(j?.rounds) ? (j as typeof theirs) : null
  } catch {
    theirs = null
  }
  if (!theirs?.rounds.length) return local
  if (!mine) return incoming
  const have = new Set(mine.rounds.map((r) => r.seed))
  const fresh = theirs.rounds.filter((r) => !have.has(r.seed))
  if (!fresh.length) return local
  const rounds = [...mine.rounds, ...fresh].sort((a, b) => b.playedAt - a.playedAt)
  return JSON.stringify({ v: 1, rounds })
}

/** The course-record ledger (`dogleg:records:v1`) is a courtesy cache the app
 *  reconciles against server truth on open (records.ts) — losing an entry
 *  costs a missed "your record fell" notification, not data corruption, so a
 *  plain shallow union (local wins per-slug conflicts, same convention as
 *  everywhere else in this file) is enough. */
function mergeRecordsJson(local: string, incoming: string): string {
  let mine: { held?: Record<string, unknown>; stolen?: Record<string, unknown> } | null
  let theirs: { held?: Record<string, unknown>; stolen?: Record<string, unknown> } | null
  try {
    mine = JSON.parse(local) as typeof mine
  } catch {
    mine = null
  }
  try {
    theirs = JSON.parse(incoming) as typeof theirs
  } catch {
    theirs = null
  }
  if (!theirs) return local
  if (!mine) return incoming
  return JSON.stringify({
    v: 1,
    held: { ...(theirs.held ?? {}), ...(mine.held ?? {}) },
    stolen: { ...(theirs.stolen ?? {}), ...(mine.stolen ?? {}) },
  })
}

/** Date keys this device has successfully posted — the OTHER half of the
 *  fortune-streak/ace-drought math in store.ts's postedStreak/
 *  postedDailyCounters, which filter `dogleg:history:v1` down through this
 *  set. History is unioned above; if this key were left on "local wins" (the
 *  default for everything not specially handled) the two would desync the
 *  moment a handoff adds older posted days that history now knows about but
 *  this device doesn't — undercounting a real streak and re-opening an
 *  ace/albatross drought that was already closed. Capped at 400 like the
 *  write path that produces it (leaderboard.ts). */
function mergePostedJson(local: string, incoming: string): string {
  const mine = parseArray<string>(local)
  const theirs = parseArray<string>(incoming)
  if (!theirs.length) return local
  const merged = Array.from(new Set([...mine, ...theirs])).sort()
  if (merged.length === mine.length) return local
  return JSON.stringify(merged.slice(-400))
}

/** A count stored as plain text can't be trusted to parse to a normal number
 *  — a crafted payload's `"1e400"` parses to `Infinity`, which is truthy and
 *  survives a naive `Number(x) || 0` fallback, then poisons every future
 *  Math.max forever. Clamp to a finite non-negative integer or treat as 0. */
function safeCount(raw: string): number {
  const n = Number(raw)
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0
}

/** Counters toward the destiny guarantee. Highest wins per counter: a player
 *  carrying progress across should never be set back by an empty device, and
 *  can't gain by bouncing through the handoff twice either. If ONE side
 *  failed to parse (a corrupted local write, say), the valid side always
 *  wins outright rather than the corruption perpetuating itself forever. */
function mergeFortuneJson(local: string, incoming: string): string {
  const parse = (raw: string): Record<string, number> | null => {
    try {
      const j = JSON.parse(raw) as { p?: Record<string, number> }
      return j?.p && typeof j.p === 'object' ? j.p : null
    } catch {
      return null
    }
  }
  const a = parse(local)
  const b = parse(incoming)
  if (!a) return b ? JSON.stringify({ p: b }) : local
  if (!b) return local
  const p: Record<string, number> = { ...a }
  for (const [k, v] of Object.entries(b)) {
    if (typeof v === 'number' && Number.isFinite(v) && (typeof p[k] !== 'number' || v > p[k])) p[k] = v
  }
  return JSON.stringify({ p })
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
    case ROUNDLOG_KEY:
      store.setItem(key, mergeRoundLogJson(local, incoming))
      return
    case RECORDS_KEY:
      store.setItem(key, mergeRecordsJson(local, incoming))
      return
    case POSTED_KEY:
      store.setItem(key, mergePostedJson(local, incoming))
      return
    case FORTUNE_KEY:
      store.setItem(key, mergeFortuneJson(local, incoming))
      return
    case LIFETIME_KEY: {
      const n = Math.max(safeCount(local), safeCount(incoming))
      store.setItem(key, String(n))
      return
    }
    default:
      // acks, tutorial flags, view mode, season awards cache: whatever this
      // device already believes wins. None of it is worth overwriting for —
      // the season-awards cache self-invalidates on a player-name mismatch,
      // and an ack replayed once more costs nothing but a splash screen.
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
 *
 * Every OTHER key is written before the identity swap, deliberately: if a
 * write throws partway through (a near-full origin hitting its quota, say),
 * the device's identity — and the dice it salts — has not moved yet. A
 * partial merge of secondary data under the OLD identity is a far smaller
 * failure than the device believing it's a different player with only some
 * of that player's history.
 */
export async function importHandoff(payload: string, store: Storage): Promise<ImportOutcome> {
  const unpacked = await unpackHandoff(payload)
  if (!unpacked) return 'invalid'
  const incoming = readIdentity(unpacked.keys[PLAYER_KEY] ?? null)
  const local = readIdentity(store.getItem(PLAYER_KEY))
  if (local?.name && local.id !== incoming?.id) return 'conflict'
  for (const [key, value] of Object.entries(unpacked.keys)) {
    if (key === PLAYER_KEY || key === ROUND_KEY || !key.startsWith(KEY_PREFIX) || typeof value !== 'string') continue
    mergeInto(store, key, value)
  }
  if (incoming) store.setItem(PLAYER_KEY, JSON.stringify(incoming))
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
 *  survive in the address bar, in a copied link, or across a reload. Removes
 *  EVERY `handoff=` fragment param, not just the first — a duplicated or
 *  concatenated link must not leave a second copy of the secret behind. */
export function takeHandoffFromUrl(): string | null {
  if (typeof window === 'undefined' || !window.location.hash) return null
  const isHandoff = (part: string) => part.startsWith('handoff=')
  const parts = window.location.hash.slice(1).split('&')
  if (!parts.some(isHandoff)) return null
  const payload = parts.find(isHandoff)!.slice('handoff='.length)
  const kept = parts.filter((part) => !isHandoff(part))
  const newHash = kept.length ? '#' + kept.join('&') : ''
  try {
    window.history.replaceState(null, '', window.location.pathname + window.location.search + newHash)
  } catch {
    /* about:blank in a test harness — the import still stands */
  }
  return payload && /^[A-Za-z0-9_.-]+$/.test(payload) ? payload : null
}

function afterDelay<T>(ms: number, value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms))
}

/**
 * Called once at boot, before React mounts, so the app never renders a frame
 * as the wrong player and `ensureIdentity` never mints a competing id.
 * Returns null when there was no handoff to do — the overwhelmingly common
 * case, and it costs one regex.
 *
 * Bounded to 5s no matter what: the stream plumbing in `through()` rejects
 * cleanly on a malformed payload (caught below), but a boot path has no
 * business being able to hang forever on an anomalous browser condition —
 * mount() (main.tsx) has to fire eventually either way.
 */
export async function runHandoff(): Promise<ImportOutcome | null> {
  const payload = takeHandoffFromUrl()
  if (!payload) return null
  try {
    return await Promise.race([importHandoff(payload, localStorage), afterDelay<ImportOutcome>(5000, 'invalid')])
  } catch {
    return 'invalid'
  }
}

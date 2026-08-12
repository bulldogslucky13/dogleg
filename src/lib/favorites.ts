/**
 * Favorite courses — the record-hunter's target shortlist.
 *
 * One versioned JSON document, same "local now, portable later" pattern as
 * the round log and the achievements ledger: when accounts/leagues arrive it
 * ships to the server wholesale. Pure course-list UI data — nothing here
 * touches play, scoring, or records.
 */

const KEY = 'dogleg:favorites:v1'

interface StoredFavorites {
  v: 1
  slugs: string[]
}

export function loadFavorites(): Set<string> {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const j = JSON.parse(raw) as StoredFavorites
      if (j?.v === 1 && Array.isArray(j.slugs)) return new Set(j.slugs)
    }
  } catch {
    /* fall through */
  }
  return new Set()
}

export function toggleFavorite(slug: string): Set<string> {
  const favs = loadFavorites()
  if (favs.has(slug)) favs.delete(slug)
  else favs.add(slug)
  try {
    localStorage.setItem(KEY, JSON.stringify({ v: 1, slugs: [...favs] } satisfies StoredFavorites))
  } catch {
    /* private mode — the star just won't stick */
  }
  return favs
}

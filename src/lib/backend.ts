/**
 * Leaderboard backend (Supabase) configuration.
 *
 * The anon key is public by design — it ships in the bundle and can only do
 * what row-level security allows: read the boards. All writes go through the
 * submit-round edge function, which replays every round with the game engine.
 *
 * Empty values (or test mode) disable every leaderboard feature gracefully.
 */
export const SUPABASE_URL = 'https://cphmpypnvopoylwxsrlk.supabase.co'
export const SUPABASE_ANON_KEY = 'sb_publishable_4X58DiRIlGfGeMHAwHynTg_rGWnvu10'

export const backendEnabled = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY) && import.meta.env.MODE !== 'test'

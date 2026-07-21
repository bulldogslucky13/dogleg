-- DogLeg leaderboard schema. Run once in the Supabase SQL editor (or via CLI).
--
-- Trust model: the anon key (shipped in the site) can only READ the boards.
-- All writes go through the submit-round edge function, which replays every
-- round with the game engine and writes with the service role. The players
-- table is not readable at all from the client — it holds device secrets.

create table if not exists players (
  id uuid primary key default gen_random_uuid(),
  secret uuid not null default gen_random_uuid(),
  -- null until the player claims a clubhouse name: anonymous identities are
  -- minted up front (mint-player) so daily dice can be salted per player,
  -- and the first posted card names this same row
  name text,
  -- set when a player optionally attaches an email account (cross-device sync)
  user_id uuid unique references auth.users (id),
  created_at timestamptz not null default now()
);
create unique index if not exists players_name_ci on players (lower(name));
alter table players add column if not exists user_id uuid unique references auth.users (id);
alter table players alter column name drop not null;

-- mint-player rate limiting: one counter per (utc day, hashed ip). The hash
-- is salted with the day, so rows can't be correlated across days — and the
-- ip never touches the players table.
create table if not exists mint_log (
  day text not null,
  ip_hash text not null,
  count int not null default 0,
  primary key (day, ip_hash)
);

-- atomic bump, called by the mint-player function (service role)
create or replace function bump_mint(p_day text, p_ip_hash text) returns int
language sql as $$
  insert into mint_log (day, ip_hash, count) values (p_day, p_ip_hash, 1)
  on conflict (day, ip_hash) do update set count = mint_log.count + 1
  returning count;
$$;
-- functions are EXECUTE-able by public by default; this one is service-role only
revoke execute on function bump_mint(text, text) from public, anon, authenticated;

create table if not exists daily_scores (
  id bigint generated always as identity primary key,
  date_key text not null,
  puzzle_number int not null,
  course_slug text not null,
  player_id uuid not null references players (id),
  player_name text not null,
  character text,
  to_par int not null,
  strokes int not null,
  results jsonb not null,
  created_at timestamptz not null default now(),
  unique (date_key, player_id)
);
create index if not exists daily_scores_board on daily_scores (date_key, to_par, created_at);

create table if not exists course_records (
  course_slug text primary key,
  player_id uuid not null references players (id),
  player_name text not null,
  to_par int not null,
  character text,
  set_at timestamptz not null default now()
);

-- One row per record-steal email actually attempted, keyed by day. The row is
-- inserted BEFORE the send, so a duplicate key means "already emailed today"
-- and the send is skipped. At-most-once beats at-least-once here: a lost
-- email on a crashed send is fine, a double email is not.
create table if not exists record_steal_emails (
  course_slug text not null,
  player_id uuid not null references players (id),
  date_key text not null,
  sent_at timestamptz not null default now(),
  primary key (course_slug, player_id, date_key)
);

alter table players enable row level security;
alter table daily_scores enable row level security;
alter table course_records enable row level security;
alter table mint_log enable row level security;
alter table record_steal_emails enable row level security;

-- boards are public reading material; players (and their secrets) are not
drop policy if exists "anyone can read daily scores" on daily_scores;
create policy "anyone can read daily scores" on daily_scores for select using (true);
drop policy if exists "anyone can read course records" on course_records;
create policy "anyone can read course records" on course_records for select using (true);
-- no insert/update/delete policies anywhere: only the service role writes

-- Retire the per-player tally table (never shipped; superseded by the
-- aggregate counter below, which is O(holes·stages·choices) not O(players)).
drop table if exists daily_hole_choices;

-- Clubhouse decision tallies (Layer 2): one counter row per
-- (date_key, hole, stage, choice), incremented on each validated daily card.
-- Flat ~190 rows/day regardless of how many people play — the whole day fits
-- well under PostgREST's row cap for the client read. Public reading material;
-- written ONLY by submit-round via bump_choice_tallies() (service role).
-- `names` keeps up to 5 clubhouse names for the small-n "named" display tier
-- (names are already public on the leaderboard); past that we show plain counts.
create table if not exists daily_choice_tallies (
  date_key text not null,
  course_slug text not null,
  hole smallint not null check (hole between 1 and 18),
  stage text not null check (stage in ('tee', 'second', 'approach', 'putt', 'shortgame')),
  choice text not null check (choice in ('safe', 'normal', 'aggressive')),
  count integer not null default 0,
  names text[] not null default '{}',
  updated_at timestamptz not null default now(),
  -- course_slug is a function of date_key (one course per daily rotation), so
  -- it's redundant for uniqueness — but keeping it in the PK makes the counter
  -- explicitly per-course and future-proofs any change to that invariant.
  primary key (date_key, course_slug, hole, stage, choice)
);
-- the PK (date_key first) already serves the day-scoped client read; no extra index.

-- Known/accepted gap: this policy is a flat public read, so any anon-key
-- holder can query `hole=eq.N` for a hole they haven't personally reached
-- yet — the client's post-hole-only fetch (fetchHoleChoices) is a UX
-- courtesy, not enforcement. True enforcement would need server-tracked
-- per-player hole progress, which nothing today provides (round state is
-- local-only until the final validated submit-round replay, and that
-- replay writes all 18 holes' tallies in one shot at round end — so in
-- practice every hole's tallies for the day exist as soon as the first
-- player finishes, not gated by hole order at all). Accepted because the
-- worst case is a spoiler (seeing what the field did on a hole before
-- playing it), not an exploit: nothing here affects the odds, the score,
-- or the leaderboard. Revisit only if that trust model changes (e.g. real
-- money/ranking stakes).
alter table daily_choice_tallies enable row level security;
drop policy if exists "anyone can read daily choice tallies" on daily_choice_tallies;
create policy "anyone can read daily choice tallies" on daily_choice_tallies for select using (true);
-- no insert/update/delete policies: only the service role (via the function) writes

-- Atomic batch increment: one call per validated round. unnest() expands the
-- round's (hole,stage,choice) rows; ON CONFLICT bumps the counter and appends
-- the player's name until 5 are held. SECURITY DEFINER so the function writes
-- under the table owner while the caller (service role) holds no direct DML grant.
-- choiceRowsFromReplay dedups to one (hole,stage) per player, so no two source
-- rows in a single call share the PK — ON CONFLICT can't fire twice on one row.
create or replace function bump_choice_tallies(
  p_date_key text,
  p_course_slug text,
  p_player_name text,
  p_holes smallint[],
  p_stages text[],
  p_choices text[]
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into daily_choice_tallies (date_key, course_slug, hole, stage, choice, count, names, updated_at)
  select p_date_key, p_course_slug, h, s, c, 1,
         case when p_player_name is null then '{}'::text[] else array[p_player_name] end,
         now()
  from unnest(p_holes, p_stages, p_choices) as t(h, s, c)
  on conflict (date_key, course_slug, hole, stage, choice) do update
    set count = daily_choice_tallies.count + 1,
        names = case
          when p_player_name is null then daily_choice_tallies.names
          when coalesce(array_length(daily_choice_tallies.names, 1), 0) < 5
            then daily_choice_tallies.names || p_player_name
          else daily_choice_tallies.names
        end,
        updated_at = now();
end;
$$;
-- Lock the function down to the one caller: strip the implicit PUBLIC grant
-- (which covers anon/authenticated), then grant EXECUTE to service_role only —
-- submit-round runs under the service role. The explicit grant does not rely on
-- service_role happening to retain a privilege after the revoke.
revoke all on function bump_choice_tallies(text, text, text, smallint[], text[], text[]) from public, anon, authenticated;
grant execute on function bump_choice_tallies(text, text, text, smallint[], text[], text[]) to service_role;

-- Optional retention (needs pg_cron): the client only reads TODAY, so prune
-- anything older than yesterday to keep the table permanently near ~2 days.
-- select cron.schedule('prune-choice-tallies', '17 8 * * *',
--   $$delete from daily_choice_tallies where date_key < to_char((now() at time zone 'utc')::date - 2, 'YYYY-MM-DD')$$);

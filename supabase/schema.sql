-- DogLeg leaderboard schema. Applied to the live database IN FULL on every
-- push to main (the "Apply database schema" step in
-- .github/workflows/deploy.yml), so every statement here must stay idempotent
-- — safe to re-run: guarded creates (if not exists), create-or-replace,
-- drop-policy-then-create. It can also still be run by hand in the SQL editor.
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
alter table players add column if not exists user_id uuid unique references auth.users (id);
alter table players alter column name drop not null;

-- ---------------------------------------------------------------------------
-- Clubhouse names: SHARED by default, RESERVED only by an email account.
-- ---------------------------------------------------------------------------
-- Names used to be globally unique (`players_name_ci`, a unique index on
-- lower(name)), and that index was the whole rule. It cost more than it
-- bought. Identity here is a device-held secret with no login, so the common
-- way to meet "that name is taken" was not squatting — it was YOUR OWN old
-- row, orphaned by a cleared browser, a new phone, or a reinstall. The game
-- answered a player typing their own name with a flat refusal and no way
-- forward, because names are permanent and there is no rename door.
--
-- So the rule is now: two anonymous players may both be "Jacob". A name stops
-- being available only once a player who has linked an email account holds it
-- — an account is a real, recoverable claim on a name, and reserving it is
-- what that account is FOR. Anonymous rows that already share a reserved name
-- keep it (grandfathered); they simply stop being joined by new ones.
--
-- Enforced in layers, because different writers need different guarantees:
--
-- 1. name_reserved() below, called by all three claim doors (submit-round,
--    claim-name, link-account) BEFORE they write, is what turns a collision
--    into a clean "that name belongs to a synced player" instead of a raw
--    23505. On its own it's a courtesy, not a guarantee — checked, then
--    written, a round trip apart.
--
-- 2. players_name_reserved_ci below is a real guarantee for any write that
--    sets user_id and name TOGETHER (link-account's two claim branches
--    always do): a PARTIAL unique index over only the linked rows (`where
--    user_id is not null`) enforces "at most one linked row per name" the
--    same way any unique index enforces anything — Postgres serializes
--    concurrent writers of the same key regardless of which row they're on.
--    It does NOT touch anonymous rows — two anonymous "Jacob"s are still
--    fine, unindexed, exactly as the design intends.
--
-- 3. claim_name_if_free() below is for the two doors that write name WITHOUT
--    ever setting user_id (submit-round's and claim-name's anonymous
--    claims) — an index can't protect a write that never touches the
--    indexed condition (user_id is not null), so the check and the write are
--    folded into one atomic statement instead of two round trips.
--
-- An earlier version of this file rejected a reserved-name index entirely,
-- reasoning that it would refuse the one flow that must never fail: an
-- anonymous player linking an email while ALREADY holding the name they play
-- under. That reasoning missed the difference between two cases a plain
-- unique index can't tell apart but a PARTIAL one can: linking your own
-- unclaimed name (nobody else has linked it — the index permits this, same
-- row, nothing to collide with) versus linking a name a DIFFERENT account
-- already linked first (two anonymous rows landed on the same shared name
-- before either synced, and both later add email — the index is exactly
-- right to refuse the second one, because letting it through is what breaks
-- "an account is a real, recoverable claim on a name": two different accounts
-- would both read as reserving "Jacob", and neither recovery flow could tell
-- them apart). That second case has no rename door to fall back to and reads
-- to the losing player as the name being taken with no recourse — a real,
-- accepted rough edge, not a bug: it is what the failed race SHOULD produce,
-- because the alternative is a silent, undetectable double-reservation.
--
-- The plain (non-partial) lookup index remains for name_reserved()'s read.
drop index if exists players_name_ci;
create index if not exists players_name_ci_lookup on players (lower(name));
create unique index if not exists players_name_reserved_ci on players (lower(name)) where user_id is not null;

-- True when an EMAIL-LINKED player already holds this clubhouse name. The
-- comparison is case-insensitive and trims, exactly as the edge functions do
-- before they write, so "Jacob ", "jacob" and "JACOB" cannot slip past a
-- reservation on "Jacob". SECURITY DEFINER + a service_role-only grant: this
-- is an existence oracle over the players table, which is otherwise unreadable
-- from the client, and it stays that way.
create or replace function name_reserved(p_name text) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from players
    where user_id is not null and lower(name) = lower(btrim(p_name))
  );
$$;
revoke all on function name_reserved(text) from public, anon, authenticated;
grant execute on function name_reserved(text) to service_role;

-- Atomically claims p_name onto a row that is already known nameless — the
-- write path for submit-round's and claim-name's anonymous claims.
--
-- Those two doors never set user_id, so players_name_reserved_ci (linked
-- rows only) never applies to their write and can't protect it — an
-- anonymous claim has no unique index backing it at all, by design, since
-- anonymous rows must be free to share any name. That leaves name_reserved()
-- as the only guard, and calling it as a SEPARATE read before a separate
-- guarded write is check-then-act: a linked reservation for the same name
-- can land in the round trip between the two. Folding both into one
-- statement narrows that gap from a full network round trip down to this
-- statement's own snapshot — the same level of rigor an ordinary
-- NOT EXISTS-guarded write gets anywhere else, and the best available
-- without a cross-transaction lock, which link-account's writes don't need
-- because they get a real index instead (see the note above).
--
-- Always returns exactly one row (the row's state AFTER the attempt) rather
-- than nothing-on-failure, so the caller can tell apart, in one round trip:
-- claimed=true (this call set it), claimed=false with a name (someone else
-- named this exact row first — an ordinary race, not a reservation), and
-- claimed=false with no name (blocked — p_name is reserved).
create or replace function claim_name_if_free(p_id uuid, p_name text)
returns table(id uuid, name text, claimed boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := btrim(p_name);
  v_claimed boolean := false;
begin
  update players
  set name = v_name
  where players.id = p_id
    and players.name is null
    and not exists (
      select 1 from players r where r.user_id is not null and lower(r.name) = lower(v_name)
    )
  returning true into v_claimed;

  return query
    select players.id, players.name, coalesce(v_claimed, false)
    from players
    where players.id = p_id;
end;
$$;
revoke all on function claim_name_if_free(uuid, text) from public, anon, authenticated;
grant execute on function claim_name_if_free(uuid, text) to service_role;

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

-- The record ROUND itself (seed + decision list), kept from the very replay
-- the referee verified when the record was confirmed. Lets challengers race
-- the true record as a ghost. Nullable: records set before this column
-- existed have no stored round (the ghost falls back to the challenger's own
-- best until the record is next broken). Public read is deliberate — this is
-- the same payload a replay share link carries, and record rounds are
-- bragging material by design.
alter table course_records add column if not exists seed text;
alter table course_records add column if not exists decisions jsonb;

-- Which mode set the record. Daily-set records are the harder feat — one
-- attempt, fixed conditions — and the UI crowns them for it. The default is
-- historically accurate: every record set before dailies counted (2026-08)
-- came from unlimited play, by the very bug the backfill below repairs.
-- (season_records gets the same column after its create, below.)
alter table course_records add column if not exists mode text not null default 'practice';

-- SEASON course records: one holder per (scope, season, course). Seasons
-- follow the fixed ET calendar in src/engine/season.ts; the referee stamps
-- season_key at submission time, which is what makes rollover need no cron
-- and no finalize step — a season's rows simply stop changing when
-- submissions start carrying the next key, and past seasons ARE the archive
-- (podium, awards, and holder lists all derive from these immutable rows).
-- `scope` is 'global' today; a future League feature filters this same table
-- by scope ('league:<id>') rather than rebuilding it.
create table if not exists season_records (
  scope text not null default 'global',
  season_key text not null,
  course_slug text not null,
  player_id uuid not null references players (id),
  player_name text not null,
  to_par int not null,
  character text,
  seed text,
  decisions jsonb,
  set_at timestamptz not null default now(),
  primary key (scope, season_key, course_slug)
);

alter table season_records enable row level security;
drop policy if exists "anyone can read season records" on season_records;
create policy "anyone can read season records" on season_records for select using (true);

-- which mode set the record — see the note at course_records' matching column
alter table season_records add column if not exists mode text not null default 'practice';

-- One row per record-steal email actually attempted, keyed by day. The row is
-- inserted BEFORE the send, so a duplicate key means "already emailed today"
-- and the send is skipped. At-most-once beats at-least-once here: a lost
-- email on a crashed send is fine, a double email is not.
-- one row per steal email sent: the at-most-once dedupe ledger. `scope`
-- separates the two boards ('alltime' course records vs 'season' records) —
-- one round can legitimately trigger both mails to the same holder on the
-- same course and day, and neither may burn the other's slot.
create table if not exists record_steal_emails (
  scope text not null default 'alltime',
  course_slug text not null,
  player_id uuid not null references players (id),
  date_key text not null,
  sent_at timestamptz not null default now(),
  primary key (scope, course_slug, player_id, date_key)
);

-- migrate databases created before scope existed (idempotent: the alter
-- no-ops once the column exists, and the do-block only rebuilds the primary
-- key while scope is still missing from it)
alter table record_steal_emails add column if not exists scope text not null default 'alltime';
do $$ begin
  if not exists (
    select from information_schema.key_column_usage
    where table_name = 'record_steal_emails'
      and constraint_name = 'record_steal_emails_pkey'
      and column_name = 'scope'
  ) then
    alter table record_steal_emails drop constraint record_steal_emails_pkey;
    alter table record_steal_emails add primary key (scope, course_slug, player_id, date_key);
  end if;
end $$;

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

-- Retention (pg_cron, enabled on the project 2026-07-22): the client only
-- reads TODAY's date_key (fetchHoleChoices), so anything older than yesterday
-- is dead weight — prune daily to keep the table permanently at ~2-3 days
-- (~600 rows). cron.schedule() by name is an upsert, so re-running this file
-- updates the job in place instead of duplicating it. The job runs as the
-- scheduling role (postgres), which owns the table.
create extension if not exists pg_cron;
select cron.schedule('prune-choice-tallies', '17 8 * * *',
  $$delete from public.daily_choice_tallies where date_key < to_char((now() at time zone 'utc')::date - 2, 'YYYY-MM-DD')$$);

-- Inbound mail. Resend receives everything addressed to @playdogleg.com and
-- webhooks the receive-email function, which verifies the svix signature,
-- fetches the full message back from Resend's Received Emails API, and lands
-- it here. Keyed on Resend's own email id because webhook delivery is
-- at-least-once — the function upserts, so a redelivery updates in place
-- instead of duplicating.
create table if not exists received_emails (
  email_id text primary key,
  message_id text,
  from_address text,
  to_addresses text[] not null default '{}',
  cc_addresses text[] not null default '{}',
  subject text,
  text_body text,
  html_body text,
  attachments jsonb not null default '[]'::jsonb, -- metadata only; files stay on Resend
  received_at timestamptz,
  -- why this row has no body, when it has none. The body needs a SECOND call to
  -- Resend (the webhook is metadata only), and that call has its own failure
  -- modes — a key without permission to read inbound mail, a message not
  -- readable back yet, an outage. The function records the status and Resend's
  -- own error here and clears it on the fetch that finally lands, so
  --   select email_id, subject, body_error from received_emails
  --   where text_body is null and html_body is null
  -- is the whole "what's missing and why" query. Null against no body means the
  -- fetch worked and the message genuinely had neither part — or the row
  -- predates this column.
  body_error text,
  created_at timestamptz not null default now()
);
-- for databases created before body_error existed
alter table received_emails add column if not exists body_error text;

-- RLS on, and deliberately NO policies: inbound mail is other people's
-- private correspondence, not public reading material like the boards. Only
-- the service role (the receive-email function, or an operator in the
-- dashboard) can touch it.
alter table received_emails enable row level security;

-- ============================================================================
-- The records catch-up pass (daily rounds joining the record boards) used to
-- live here. It now lives in supabase/catch-up-records.sql and is applied by
-- the deploy workflow AFTER the edge functions deploy: it is the only writer
-- that stamps mode = 'daily', and stamping while an older referee is still
-- live would let a practice round inherit a daily crown permanently. Its own
-- header carries the full reasoning. Everything above must keep running
-- BEFORE the functions, for the opposite reason — no function may ship ahead
-- of a table or column it writes to.

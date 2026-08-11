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
  created_at timestamptz not null default now()
);

-- RLS on, and deliberately NO policies: inbound mail is other people's
-- private correspondence, not public reading material like the boards. Only
-- the service role (the receive-email function, or an operator in the
-- dashboard) can touch it.
alter table received_emails enable row level security;

-- ============================================================================
-- CATCH-UP PASS (2026-08): daily rounds join the record boards.
--
-- Course records were unlimited-play-only by accident of code path — the
-- daily branch of submit-round returned before the record claims. A course
-- record is the best score anyone has posted on the course from ANY
-- competitive play, so the function now writes both boards for both modes,
-- and this pass reconstructs history: for each course (and each season,
-- attributed by the puzzle's date_key on the ET calendar), the best daily
-- takes the record it should have held. Strictly-better beats; exact ties go
-- to the EARLIER round — the referee's live rule projected onto history.
--
-- Quiet by construction: nothing here sends mail (only the edge function
-- does), and past-season rows never surface on a client diff. Caught-up
-- records carry no seed/decisions (daily_scores never stored them), so their
-- ghosts fall back to the challenger's own best until the record next breaks.
--
-- Deliberately NOT a one-shot behind a marker: the deploy applies schema.sql
-- BEFORE the new submit-round goes live, so daily cards posted to the OLD
-- function during that handoff would be snapshotted past by a single run and
-- then never reconsidered. Instead the pass runs on EVERY deploy and stays
-- safe to re-run because the updates only ever displace records set by
-- PRACTICE play: a record the live function stamped mode 'daily' is never
-- touched again (re-running could only null its stored ghost round), while a
-- practice-held record a missed daily deserved falls on the next deploy.
-- Every statement is also strictly-better-or-earlier-gated, so a re-run with
-- nothing to catch up writes nothing.

-- all-time board: displace a standing PRACTICE record only when the best
-- daily on that course was strictly better, or equal and earlier
with best_daily as (
  select distinct on (course_slug)
    course_slug, player_id, player_name, "character", to_par, created_at
  from daily_scores
  order by course_slug, to_par asc, created_at asc
)
update course_records cr
set player_id = bd.player_id,
    player_name = bd.player_name,
    "character" = bd."character",
    to_par = bd.to_par,
    set_at = bd.created_at,
    seed = null,
    decisions = null,
    mode = 'daily'
from best_daily bd
where bd.course_slug = cr.course_slug
  and cr.mode = 'practice'
  and (bd.to_par < cr.to_par or (bd.to_par = cr.to_par and bd.created_at < cr.set_at));

with best_daily as (
  select distinct on (course_slug)
    course_slug, player_id, player_name, "character", to_par, created_at
  from daily_scores
  order by course_slug, to_par asc, created_at asc
)
insert into course_records (course_slug, player_id, player_name, "character", to_par, set_at, mode)
select bd.course_slug, bd.player_id, bd.player_name, bd."character", bd.to_par, bd.created_at, 'daily'
from best_daily bd
where not exists (select from course_records cr where cr.course_slug = bd.course_slug);

-- season boards: same reconstruction per (season, course). The season is
-- the PUZZLE's season — date_key on the fixed ET calendar (Feb-Apr
-- spring, May-Jul summer, Aug-Oct fall, Nov-Jan off keyed to the year it
-- starts) — so a daily from a past season lands in that season's archive.
with keyed as (
  select course_slug, player_id, player_name, "character", to_par, created_at,
    case
      when substr(date_key, 6, 2)::int between 2 and 4 then substr(date_key, 1, 4) || '-q1-spring'
      when substr(date_key, 6, 2)::int between 5 and 7 then substr(date_key, 1, 4) || '-q2-summer'
      when substr(date_key, 6, 2)::int between 8 and 10 then substr(date_key, 1, 4) || '-q3-fall'
      when substr(date_key, 6, 2)::int >= 11 then substr(date_key, 1, 4) || '-q4-off'
      else (substr(date_key, 1, 4)::int - 1)::text || '-q4-off'
    end as season_key
  from daily_scores
), best_daily_season as (
  select distinct on (season_key, course_slug)
    season_key, course_slug, player_id, player_name, "character", to_par, created_at
  from keyed
  order by season_key, course_slug, to_par asc, created_at asc
)
update season_records sr
set player_id = bd.player_id,
    player_name = bd.player_name,
    "character" = bd."character",
    to_par = bd.to_par,
    set_at = bd.created_at,
    seed = null,
    decisions = null,
    mode = 'daily'
from best_daily_season bd
where sr.scope = 'global'
  and sr.season_key = bd.season_key
  and sr.course_slug = bd.course_slug
  and sr.mode = 'practice'
  and (bd.to_par < sr.to_par or (bd.to_par = sr.to_par and bd.created_at < sr.set_at));

with keyed as (
  select course_slug, player_id, player_name, "character", to_par, created_at,
    case
      when substr(date_key, 6, 2)::int between 2 and 4 then substr(date_key, 1, 4) || '-q1-spring'
      when substr(date_key, 6, 2)::int between 5 and 7 then substr(date_key, 1, 4) || '-q2-summer'
      when substr(date_key, 6, 2)::int between 8 and 10 then substr(date_key, 1, 4) || '-q3-fall'
      when substr(date_key, 6, 2)::int >= 11 then substr(date_key, 1, 4) || '-q4-off'
      else (substr(date_key, 1, 4)::int - 1)::text || '-q4-off'
    end as season_key
  from daily_scores
), best_daily_season as (
  select distinct on (season_key, course_slug)
    season_key, course_slug, player_id, player_name, "character", to_par, created_at
  from keyed
  order by season_key, course_slug, to_par asc, created_at asc
)
insert into season_records (scope, season_key, course_slug, player_id, player_name, "character", to_par, set_at, mode)
select 'global', bd.season_key, bd.course_slug, bd.player_id, bd.player_name, bd."character", bd.to_par, bd.created_at, 'daily'
from best_daily_season bd
where not exists (
  select from season_records sr
  where sr.scope = 'global' and sr.season_key = bd.season_key and sr.course_slug = bd.course_slug
);

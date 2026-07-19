-- Dogleg leaderboard schema. Run once in the Supabase SQL editor (or via CLI).
--
-- Trust model: the anon key (shipped in the site) can only READ the boards.
-- All writes go through the submit-round edge function, which replays every
-- round with the game engine and writes with the service role. The players
-- table is not readable at all from the client — it holds device secrets.

create table if not exists players (
  id uuid primary key default gen_random_uuid(),
  secret uuid not null default gen_random_uuid(),
  name text not null,
  -- set when a player optionally attaches an email account (cross-device sync)
  user_id uuid unique references auth.users (id),
  created_at timestamptz not null default now()
);
create unique index if not exists players_name_ci on players (lower(name));
alter table players add column if not exists user_id uuid unique references auth.users (id);

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

alter table players enable row level security;
alter table daily_scores enable row level security;
alter table course_records enable row level security;

-- boards are public reading material; players (and their secrets) are not
drop policy if exists "anyone can read daily scores" on daily_scores;
create policy "anyone can read daily scores" on daily_scores for select using (true);
drop policy if exists "anyone can read course records" on course_records;
create policy "anyone can read course records" on course_records for select using (true);
-- no insert/update/delete policies anywhere: only the service role writes

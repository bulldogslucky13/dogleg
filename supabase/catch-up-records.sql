-- DogLeg records catch-up pass: daily rounds join the record boards.
--
-- Applied to the live database on every push to main by the "Catch up record
-- boards" step in .github/workflows/deploy.yml — deliberately AFTER the edge
-- functions deploy, which is the opposite of schema.sql. See the ordering
-- note below; it is the whole reason this lives in its own file.
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
-- ORDERING — why this is not in schema.sql. This pass is the only writer that
-- stamps `mode = 'daily'`, and only the NEW referee writes the mode column at
-- all: the old one updates a record's holder, score and ghost while leaving
-- mode untouched. Run before the function deploy, the pass would stamp rows
-- 'daily' while the old referee was still live, and a practice round beating
-- one of those rows would inherit its crown permanently — later passes cannot
-- repair it, because the historical daily is by then the worse score. Running
-- after the deploy removes the window entirely: nothing is stamped 'daily'
-- until every writer understands the column. schema.sql keeps the opposite
-- order for the opposite reason — a function must never ship ahead of a table
-- or column it writes to.
--
-- Deliberately NOT a one-shot behind a marker: a card posted during the
-- deploy would be snapshotted past by a single run and then never
-- reconsidered. Instead the pass runs on EVERY deploy, and two properties
-- make re-running safe against the live function:
--
--   * A STRICTLY better daily displaces any holder — strict inequality can
--     never match the standing record's own card, so a re-run cannot rewrite
--     an unchanged live record or null its stored ghost round. This is what
--     lets a better daily posted during a deploy land on the next one.
--   * The tie-goes-to-earlier rule only displaces PRACTICE holders. A tie
--     against a daily-mode row is left with the live function's outcome:
--     re-fighting it could only strip the ghost from a record that is
--     already correct to within the tie.
--
-- The inserts take the empty-course slot with on-conflict-do-nothing: the
-- live referee can claim the same empty course mid-pass, and losing that race
-- must leave the referee's row standing rather than fail the deploy (a lost
-- race that deserved the record is swept up by the update on the next one).
--
-- The pass only considers cards at least an hour old. The referee commits the
-- daily_scores insert BEFORE its record claims, so a pass running in that gap
-- would install the brand-new card itself — null ghost, and the referee's own
-- claim then loses its upsert and reports broken: false, costing the player
-- the celebration and the stored round. The race window is seconds; an hour
-- buries it. Nothing is lost to the cutoff: any card it defers is either
-- claimed live by the referee moments later (the normal path) or old enough
-- to be swept up by the next deploy's pass.

-- all-time board
with best_daily as (
  select distinct on (course_slug)
    course_slug, player_id, player_name, "character", to_par, created_at
  from daily_scores
  where created_at < now() - interval '1 hour'
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
  and (
    bd.to_par < cr.to_par
    or (cr.mode = 'practice' and bd.to_par = cr.to_par and bd.created_at < cr.set_at)
  );

with best_daily as (
  select distinct on (course_slug)
    course_slug, player_id, player_name, "character", to_par, created_at
  from daily_scores
  where created_at < now() - interval '1 hour'
  order by course_slug, to_par asc, created_at asc
)
insert into course_records (course_slug, player_id, player_name, "character", to_par, set_at, mode)
select bd.course_slug, bd.player_id, bd.player_name, bd."character", bd.to_par, bd.created_at, 'daily'
from best_daily bd
where not exists (select from course_records cr where cr.course_slug = bd.course_slug)
on conflict (course_slug) do nothing;

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
  where created_at < now() - interval '1 hour'
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
  and (
    bd.to_par < sr.to_par
    or (sr.mode = 'practice' and bd.to_par = sr.to_par and bd.created_at < sr.set_at)
  );

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
  where created_at < now() - interval '1 hour'
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
)
on conflict (scope, season_key, course_slug) do nothing;

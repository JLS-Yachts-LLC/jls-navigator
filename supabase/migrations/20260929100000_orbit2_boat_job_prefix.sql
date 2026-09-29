-- Orbit 2 — Managed Boats: each boat numbers its own jobs (client request, 29 Sep 2026).
--
--   MV Tornado → MVT26-0001, MVT26-0002 …
--   Southern Bight → SB26-0001 …        Imperium → IMP26-0001 …
--
-- Until now every boat shared one counter under the MVT prefix. Now each boat
-- carries a short prefix (job_prefix), unique across the fleet so two boats can
-- never produce the same number, and its jobs count from 0001 per prefix per
-- year. A default prefix is derived from the name when a boat is created — the
-- initials of a multi-word name, the first three letters of a single word — and
-- the office can change it on the boat's profile. The number itself is fixed
-- once a job has one; renaming the boat or changing its prefix does not rewrite
-- history.

alter table public.orbit2_boats
  add column if not exists job_prefix text;

-- 2–5 letters or digits, upper case. Case-insensitive uniqueness so "sb" and
-- "SB" cannot both exist.
alter table public.orbit2_boats drop constraint if exists orbit2_boats_job_prefix_check;
alter table public.orbit2_boats add constraint orbit2_boats_job_prefix_check
  check (job_prefix is null or job_prefix ~ '^[A-Z0-9]{2,5}$');
create unique index if not exists orbit2_boats_job_prefix_uidx
  on public.orbit2_boats (upper(job_prefix)) where job_prefix is not null;

/** The default prefix for a boat name: initials of each word, or the first three letters of a single word. */
create or replace function public.orbit2_default_job_prefix(p_name text)
returns text language sql immutable as $fn$
  with words as (
    select w from regexp_split_to_table(upper(regexp_replace(coalesce(p_name, ''), '[^A-Za-z0-9 ]', ' ', 'g')), '\s+') w
    where w <> ''
  ),
  initials as (select string_agg(left(w, 1), '' order by ord) s from (select w, row_number() over () ord from words) x)
  select case
    when (select count(*) from words) >= 2 then left((select s from initials), 5)
    when (select count(*) from words) = 1 then left((select w from words), 3)
    else 'BOAT'
  end
$fn$;

/** On insert: fill an empty prefix from the name, and keep it unique by appending 2, 3 … if taken. */
create or replace function public.orbit2_boat_prefix_default()
returns trigger language plpgsql as $fn$
declare base text; candidate text; n int := 1; other text;
begin
  if new.job_prefix is not null then
    new.job_prefix := upper(trim(new.job_prefix));
    -- A prefix typed by hand that another boat already uses is an error to
    -- report plainly, not something to quietly alter.
    select b.name into other from public.orbit2_boats b
      where upper(b.job_prefix) = new.job_prefix and b.id <> new.id limit 1;
    if other is not null then
      raise exception using errcode = '23505',
        message = format('The prefix %s is already used by %s — choose another.', new.job_prefix, other);
    end if;
    return new;
  end if;
  base := public.orbit2_default_job_prefix(new.name);
  if length(base) < 2 then base := rpad(base, 2, 'X'); end if;
  candidate := base;
  while exists (select 1 from public.orbit2_boats b where upper(b.job_prefix) = candidate and b.id <> new.id) loop
    n := n + 1;
    candidate := left(base, 5 - length(n::text)) || n::text;
  end loop;
  new.job_prefix := candidate;
  return new;
end $fn$;

drop trigger if exists orbit2_boats_prefix_default on public.orbit2_boats;
create trigger orbit2_boats_prefix_default
  before insert or update of job_prefix, name on public.orbit2_boats
  for each row execute function public.orbit2_boat_prefix_default();

-- Job numbers: <prefix><YY>-<NNNN>, counting per prefix per year. The advisory
-- lock keyed on the prefix serialises two jobs being added to the same boat at
-- the same moment, so they cannot be handed the same number.
create or replace function public.orbit2_assign_boat_job_no()
returns trigger language plpgsql as $fn$
declare v_prefix text; v_year text := to_char(now(), 'YY'); v_next int;
begin
  if new.job_no is null or new.job_no = '' then
    select coalesce(job_prefix, public.orbit2_default_job_prefix(name)) into v_prefix
      from public.orbit2_boats where id = new.boat_id;
    v_prefix := coalesce(v_prefix, 'BOAT');
    perform pg_advisory_xact_lock(hashtext('orbit2_boat_job_no:' || v_prefix || v_year));
    select coalesce(max(substring(job_no from '^' || v_prefix || v_year || '-(\d+)$')::int), 0) + 1
      into v_next from public.orbit2_boat_tasks
      where job_no ~ ('^' || v_prefix || v_year || '-\d+$');
    new.job_no := v_prefix || v_year || '-' || lpad(v_next::text, 4, '0');
  end if;
  new.updated_at := now();
  return new;
end $fn$;

-- The shared counter is no longer read; drop it so nothing can fall back to it.
drop sequence if exists public.orbit2_boat_job_seq;

-- The three boats on file, with the prefixes the client gave. "MY TORNADO" is
-- the example's "MV Tornado" (MVT); its one job, MVT26-0001, already fits.
update public.orbit2_boats set job_prefix = 'MVT' where upper(name) = 'MY TORNADO'     and job_prefix is null;
update public.orbit2_boats set job_prefix = 'SB'  where upper(name) = 'SOUTHERN BIGHT' and job_prefix is null;
update public.orbit2_boats set job_prefix = 'IMP' where upper(name) = 'IMPERIUM'       and job_prefix is null;
-- Anything else gets the derived default.
update public.orbit2_boats set job_prefix = job_prefix where job_prefix is null;

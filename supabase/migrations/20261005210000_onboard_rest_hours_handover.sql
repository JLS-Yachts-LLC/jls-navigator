-- Client Portal · On board (Management module) — hours of rest and the handover log.
--
--   onboard_rest_hours      one row per crew member per day: the hours of rest
--                           they had in that 24 h, so the vessel can see at a
--                           glance anyone short of the MLC minimums (10 h in any
--                           24 h, 77 h in any 7 days)
--   onboard_handover_notes  notes the crew leave for each other — the relief,
--                           the next watch, the next rotation — by department,
--                           with the important ones pinned
--
-- Same isolation as the other On board tables: staff manage everything; a portal
-- login reads only its own vessel's rows from an MFA-verified session; writes go
-- through /api/portal/onboard with the service role.

create table if not exists public.onboard_rest_hours (
  id uuid primary key default gen_random_uuid(),
  yacht_id uuid not null references public.yachts(id) on delete cascade,
  crew_member_id uuid not null references public.crew_members(id) on delete cascade,
  day date not null,
  rest_hours numeric not null check (rest_hours >= 0 and rest_hours <= 24),
  notes text,
  recorded_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (crew_member_id, day)
);
create index if not exists onboard_rest_hours_yacht_day_idx on public.onboard_rest_hours (yacht_id, day);

create table if not exists public.onboard_handover_notes (
  id uuid primary key default gen_random_uuid(),
  yacht_id uuid not null references public.yachts(id) on delete cascade,
  department text not null default 'deck'
    check (department in ('galley', 'interior', 'bar', 'deck', 'engine', 'safety', 'other')),
  title text not null,
  body text,
  pinned boolean not null default false,
  author_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists onboard_handover_notes_yacht_idx on public.onboard_handover_notes (yacht_id, created_at desc);

drop trigger if exists onboard_rest_hours_updated on public.onboard_rest_hours;
create trigger onboard_rest_hours_updated before update on public.onboard_rest_hours
  for each row execute function public.set_updated_at();
drop trigger if exists onboard_handover_notes_updated on public.onboard_handover_notes;
create trigger onboard_handover_notes_updated before update on public.onboard_handover_notes
  for each row execute function public.set_updated_at();

do $$
declare t text;
begin
  foreach t in array array['onboard_rest_hours', 'onboard_handover_notes'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists staff_manage on public.%I', t);
    execute format($p$create policy staff_manage on public.%I for all to authenticated
      using (not public.is_portal_captain()) with check (not public.is_portal_captain())$p$, t);
    execute format('drop policy if exists captain_select on public.%I', t);
    execute format($p$create policy captain_select on public.%I for select to authenticated
      using (public.is_portal_captain() and public.portal_aal2() and yacht_id in (select public.captain_yacht_ids()))$p$, t);
    execute format('drop policy if exists portal_captain_block_insert on public.%I', t);
    execute format($p$create policy portal_captain_block_insert on public.%I as restrictive for insert to authenticated
      with check (not public.is_portal_captain())$p$, t);
    execute format('drop policy if exists portal_captain_block_update on public.%I', t);
    execute format($p$create policy portal_captain_block_update on public.%I as restrictive for update to authenticated
      using (not public.is_portal_captain())$p$, t);
    execute format('drop policy if exists portal_captain_block_delete on public.%I', t);
    execute format($p$create policy portal_captain_block_delete on public.%I as restrictive for delete to authenticated
      using (not public.is_portal_captain())$p$, t);
  end loop;
end $$;

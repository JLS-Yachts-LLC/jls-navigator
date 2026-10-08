-- On board: crew rota (leave, training, sick, travel) and crew certificates.
--
--   onboard_crew_rotation   a period a crew member is away from the vessel —
--                           otherwise they're on board. A leave period can raise
--                           a crew-change request with JLS (jls_request_id).
--   training_certifications (existing, staff Training area) — the portal now
--                           reads its own vessel's crew certificates; writes go
--                           through /api/portal/rota with the service role.

create table if not exists public.onboard_crew_rotation (
  id uuid primary key default gen_random_uuid(),
  yacht_id uuid not null references public.yachts(id) on delete cascade,
  crew_member_id uuid not null references public.crew_members(id) on delete cascade,
  kind text not null default 'leave' check (kind in ('leave', 'training', 'sick', 'travel', 'other')),
  start_date date not null,
  end_date date not null,
  status text not null default 'planned' check (status in ('planned', 'confirmed')),
  notes text,
  jls_request_id uuid references public.captain_requests(id) on delete set null,
  created_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date)
);
create index if not exists onboard_crew_rotation_yacht_idx on public.onboard_crew_rotation (yacht_id, start_date);
create index if not exists onboard_crew_rotation_crew_idx on public.onboard_crew_rotation (crew_member_id);
create index if not exists onboard_crew_rotation_request_idx on public.onboard_crew_rotation (jls_request_id) where jls_request_id is not null;

drop trigger if exists onboard_crew_rotation_updated on public.onboard_crew_rotation;
create trigger onboard_crew_rotation_updated before update on public.onboard_crew_rotation
  for each row execute function public.set_updated_at();

alter table public.onboard_crew_rotation enable row level security;
revoke all on public.onboard_crew_rotation from anon;
drop policy if exists staff_manage on public.onboard_crew_rotation;
create policy staff_manage on public.onboard_crew_rotation for all to authenticated
  using (not public.is_portal_captain()) with check (not public.is_portal_captain());
drop policy if exists captain_select on public.onboard_crew_rotation;
create policy captain_select on public.onboard_crew_rotation for select to authenticated
  using (public.is_portal_captain() and public.portal_aal2() and yacht_id in (select public.captain_yacht_ids()));
drop policy if exists portal_captain_block_insert on public.onboard_crew_rotation;
create policy portal_captain_block_insert on public.onboard_crew_rotation as restrictive for insert to authenticated
  with check (not public.is_portal_captain());
drop policy if exists portal_captain_block_update on public.onboard_crew_rotation;
create policy portal_captain_block_update on public.onboard_crew_rotation as restrictive for update to authenticated
  using (not public.is_portal_captain());
drop policy if exists portal_captain_block_delete on public.onboard_crew_rotation;
create policy portal_captain_block_delete on public.onboard_crew_rotation as restrictive for delete to authenticated
  using (not public.is_portal_captain());

-- training_certifications: portal logins may READ their own vessel's crew
-- certificates (MFA-verified), still never write. Staff are unchanged
-- (authenticated_all). The old restrictive ALL block is split so reads can be
-- narrowed instead of refused. (Verified 8 Oct 2026: an Aquila login sees only
-- Aquila crew certificates.)
drop policy if exists portal_captain_block on public.training_certifications;
drop policy if exists portal_captain_block_insert on public.training_certifications;
create policy portal_captain_block_insert on public.training_certifications as restrictive for insert to authenticated
  with check (not public.is_portal_captain());
drop policy if exists portal_captain_block_update on public.training_certifications;
create policy portal_captain_block_update on public.training_certifications as restrictive for update to authenticated
  using (not public.is_portal_captain());
drop policy if exists portal_captain_block_delete on public.training_certifications;
create policy portal_captain_block_delete on public.training_certifications as restrictive for delete to authenticated
  using (not public.is_portal_captain());
drop policy if exists portal_captain_own_crew_select on public.training_certifications;
create policy portal_captain_own_crew_select on public.training_certifications as restrictive for select to authenticated
  using (
    not public.is_portal_captain()
    or (public.portal_aal2() and crew_member_id in (
      select cm.id from public.crew_members cm where cm.yacht_id in (select public.captain_yacht_ids())
    ))
  );

-- Certificates can carry a scan.
alter table public.portal_files drop constraint if exists portal_files_ref_table_check;
alter table public.portal_files add constraint portal_files_ref_table_check check (ref_table = any (array[
  'onboard_checklist_runs', 'ism_drills', 'pms_tasks', 'onboard_handover_notes',
  'onboard_tasks', 'onboard_inventory_items', 'onboard_expenses', 'training_certifications'
]));

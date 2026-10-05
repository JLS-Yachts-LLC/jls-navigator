-- Client Portal — gate pass requests.
--
-- A vessel asks JLS for a gate pass (contractors, visitors, a vehicle, crew, a
-- delivery): who, which company, which dates, where. Each request raises a
-- Client Request (category "permits") that the team works in Client Requests;
-- the request's status is what the client sees (requested → with JLS → applied
-- → issued). Renewing a pass copies the people and details into a new request
-- with new dates.
--
-- This deliberately doesn't read or write the gate_pass rows in `permits`:
-- those are fed by the SharePoint "Gate Pass" list, whose rows are currently
-- unreliable (see the permits sync notes), so they aren't shown to clients.
--
-- Same isolation as the portal's other tables: staff manage everything; a portal
-- login reads its own vessel's rows from an MFA-verified session and never
-- writes directly — /api/portal/gatepasses writes with the service role.

create table if not exists public.portal_gate_pass_requests (
  id uuid primary key default gen_random_uuid(),
  yacht_id uuid not null references public.yachts(id) on delete cascade,
  pass_type text not null default 'contractor'
    check (pass_type in ('contractor', 'visitor', 'vehicle', 'crew', 'delivery')),
  people jsonb not null default '[]'::jsonb check (jsonb_typeof(people) = 'array'),
  company text,
  vehicle_plate text,
  purpose text,
  location text,
  valid_from date not null,
  valid_to date not null,
  contact_name text,
  contact_phone text,
  notes text,
  renewal_of uuid references public.portal_gate_pass_requests(id) on delete set null,
  requested_by uuid references auth.users(id) on delete set null,
  requested_by_name text,
  captain_request_id uuid references public.captain_requests(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint portal_gate_pass_dates check (valid_to >= valid_from)
);
create index if not exists portal_gate_pass_requests_yacht_idx on public.portal_gate_pass_requests (yacht_id, valid_to desc);

alter table public.portal_gate_pass_requests enable row level security;

drop policy if exists staff_manage on public.portal_gate_pass_requests;
create policy staff_manage on public.portal_gate_pass_requests for all to authenticated
  using (not public.is_portal_captain()) with check (not public.is_portal_captain());
drop policy if exists captain_select on public.portal_gate_pass_requests;
create policy captain_select on public.portal_gate_pass_requests for select to authenticated
  using (public.is_portal_captain() and public.portal_aal2() and yacht_id in (select public.captain_yacht_ids()));
drop policy if exists portal_captain_block_insert on public.portal_gate_pass_requests;
create policy portal_captain_block_insert on public.portal_gate_pass_requests as restrictive for insert to authenticated
  with check (not public.is_portal_captain());
drop policy if exists portal_captain_block_update on public.portal_gate_pass_requests;
create policy portal_captain_block_update on public.portal_gate_pass_requests as restrictive for update to authenticated
  using (not public.is_portal_captain());
drop policy if exists portal_captain_block_delete on public.portal_gate_pass_requests;
create policy portal_captain_block_delete on public.portal_gate_pass_requests as restrictive for delete to authenticated
  using (not public.is_portal_captain());

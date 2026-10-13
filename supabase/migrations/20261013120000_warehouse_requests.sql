-- Warehouse requests: ONE standard way for any department to ask the Warehouse for an incoming shipment, a picking, or a
-- dispatch — with the documents and photos attached — instead of loose emails.
--
--   incoming  an expected delivery: ETA, delivery order / packing list / invoice, items, big-crate dimensions + weight
--   picking   goods to be picked and prepared: items and quantities, AWB / shipment reference, required date
--   dispatch  goods to go out: items, AWB, destination (yacht + berth), recipient, required delivery date/time
--
-- A request keeps one number (WRQ0001 …) for life. A change is made on the SAME request with a written reason, so the
-- original is always identifiable; two people giving conflicting instructions is handled by putting the request On Hold with
-- a reason until it is agreed. Everything that happens is recorded in warehouse_request_events.
--
-- Access: any Polaris staff member can raise and read requests (coordination between departments needs the visibility);
-- only the person who raised it, or a ShipSync editor (the Warehouse / Logistics team), can change one. Client-portal
-- captains are never staff and see nothing.
--
-- Additive only: new tables, one sequence, two functions. Safe to run once.

create sequence if not exists public.warehouse_request_seq start 1;

create or replace function public.next_warehouse_request_number() returns text
language sql security definer set search_path = public as $$
  select 'WRQ' || lpad(nextval('public.warehouse_request_seq')::text, 4, '0');
$$;
revoke execute on function public.next_warehouse_request_number() from public, anon;

-- Staff = has a Polaris profile and is not a client-portal captain. Used by the policies below.
create or replace function public.is_polaris_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_profiles p where p.user_id = auth.uid() and coalesce(p.active, true))
     and not public.is_portal_captain();
$$;
revoke execute on function public.is_polaris_staff() from public, anon;

create table if not exists public.warehouse_requests (
  id uuid primary key default gen_random_uuid(),
  number text not null unique,
  type text not null check (type in ('incoming', 'picking', 'dispatch')),
  -- submitted: raised, waiting for the Warehouse   confirmed: Warehouse has accepted it   in_progress: being worked
  -- completed: done   on_hold: waiting for an instruction to be clarified   cancelled: withdrawn
  status text not null default 'submitted'
    check (status in ('submitted', 'confirmed', 'in_progress', 'completed', 'on_hold', 'cancelled')),
  department text,
  requester_id uuid references auth.users(id) on delete set null default auth.uid(),
  requester_name text,
  requester_email text,
  yacht text,                              -- yacht or project reference
  reference text,                          -- AWB / shipment reference / delivery order number
  eta timestamptz,                         -- incoming: expected arrival (date and time)
  required_at timestamptz,                 -- picking / dispatch: when it is needed
  destination text,                        -- dispatch: yacht name
  berth text,                              -- dispatch: berth / location
  recipient_name text,
  recipient_phone text,
  recipient_email text,
  urgent boolean not null default false,
  urgent_reason text,
  deadline timestamptz,                    -- urgent: the deadline that makes it urgent
  notes text,
  hold_reason text,                        -- why it is On Hold (what has to be clarified)
  amended_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.warehouse_request_lines (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.warehouse_requests(id) on delete cascade,
  position integer not null default 0,
  description text not null,
  quantity numeric,
  unit text,
  oversized boolean not null default false,   -- a large crate / oversized cargo: dimensions and weight are given
  length_cm numeric,
  width_cm numeric,
  height_cm numeric,
  weight_kg numeric,
  created_at timestamptz not null default now()
);

create table if not exists public.warehouse_request_files (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.warehouse_requests(id) on delete cascade,
  kind text not null check (kind in ('document', 'photo')),
  doc_type text,                           -- Delivery order / Packing list / Invoice / Shipping document / Photo / Other
  name text not null,
  url text not null,                       -- a "<bucket>/<path>" storage reference
  uploaded_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists public.warehouse_request_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.warehouse_requests(id) on delete cascade,
  kind text not null check (kind in ('submitted', 'status', 'comment', 'amended', 'file')),
  actor_id uuid references auth.users(id) on delete set null default auth.uid(),
  actor_name text,
  body text,
  from_status text,
  to_status text,
  created_at timestamptz not null default now()
);

create index if not exists idx_warehouse_requests_status on public.warehouse_requests (status, created_at desc);
create index if not exists idx_warehouse_requests_requester on public.warehouse_requests (requester_id);
create index if not exists idx_warehouse_requests_type on public.warehouse_requests (type);
create index if not exists idx_warehouse_request_lines_request on public.warehouse_request_lines (request_id, position);
create index if not exists idx_warehouse_request_files_request on public.warehouse_request_files (request_id);
create index if not exists idx_warehouse_request_events_request on public.warehouse_request_events (request_id, created_at);

drop trigger if exists set_warehouse_requests_updated_at on public.warehouse_requests;
create trigger set_warehouse_requests_updated_at before update on public.warehouse_requests
  for each row execute function public.update_updated_at_column();

alter table public.warehouse_requests enable row level security;
alter table public.warehouse_request_lines enable row level security;
alter table public.warehouse_request_files enable row level security;
alter table public.warehouse_request_events enable row level security;

-- Requests: staff read all; staff raise their own; the requester or a ShipSync editor changes one. No deletes (cancel instead).
drop policy if exists warehouse_requests_select on public.warehouse_requests;
create policy warehouse_requests_select on public.warehouse_requests
  for select using (public.is_polaris_staff());
drop policy if exists warehouse_requests_insert on public.warehouse_requests;
create policy warehouse_requests_insert on public.warehouse_requests
  for insert with check (public.is_polaris_staff() and requester_id = auth.uid());
drop policy if exists warehouse_requests_update on public.warehouse_requests;
create policy warehouse_requests_update on public.warehouse_requests
  for update using (public.is_polaris_staff() and (requester_id = auth.uid() or public.has_module_permission(auth.uid(), 'shipsync', 'edit')))
  with check (public.is_polaris_staff() and (requester_id = auth.uid() or public.has_module_permission(auth.uid(), 'shipsync', 'edit')));

-- Lines and files follow their request: anyone on staff reads; the requester or a ShipSync editor writes.
drop policy if exists warehouse_request_lines_select on public.warehouse_request_lines;
create policy warehouse_request_lines_select on public.warehouse_request_lines for select using (public.is_polaris_staff());
drop policy if exists warehouse_request_lines_write on public.warehouse_request_lines;
create policy warehouse_request_lines_write on public.warehouse_request_lines for all
  using (public.is_polaris_staff() and exists (select 1 from public.warehouse_requests r where r.id = request_id
         and (r.requester_id = auth.uid() or public.has_module_permission(auth.uid(), 'shipsync', 'edit'))))
  with check (public.is_polaris_staff() and exists (select 1 from public.warehouse_requests r where r.id = request_id
         and (r.requester_id = auth.uid() or public.has_module_permission(auth.uid(), 'shipsync', 'edit'))));

drop policy if exists warehouse_request_files_select on public.warehouse_request_files;
create policy warehouse_request_files_select on public.warehouse_request_files for select using (public.is_polaris_staff());
drop policy if exists warehouse_request_files_write on public.warehouse_request_files;
create policy warehouse_request_files_write on public.warehouse_request_files for all
  using (public.is_polaris_staff() and exists (select 1 from public.warehouse_requests r where r.id = request_id
         and (r.requester_id = auth.uid() or public.has_module_permission(auth.uid(), 'shipsync', 'edit'))))
  with check (public.is_polaris_staff() and exists (select 1 from public.warehouse_requests r where r.id = request_id
         and (r.requester_id = auth.uid() or public.has_module_permission(auth.uid(), 'shipsync', 'edit'))));

-- Events (the activity log): any staff member can read and add to it (a comment from another department is the point);
-- it is only ever added to, as themselves.
drop policy if exists warehouse_request_events_select on public.warehouse_request_events;
create policy warehouse_request_events_select on public.warehouse_request_events for select using (public.is_polaris_staff());
drop policy if exists warehouse_request_events_insert on public.warehouse_request_events;
create policy warehouse_request_events_insert on public.warehouse_request_events for insert
  with check (public.is_polaris_staff() and actor_id = auth.uid());

-- ── Saving and changing a request: each in ONE transaction ───────────────────────────────────────────────────────────
-- security invoker: the table policies above still apply on top of the rules written here.

-- Raise a request with its items and files. All of it saves, or none of it does.
create or replace function public.create_warehouse_request(p_request jsonb, p_lines jsonb, p_files jsonb)
returns public.warehouse_requests
language plpgsql security invoker set search_path = public as $$
declare r public.warehouse_requests;
begin
  if not public.is_polaris_staff() then raise exception 'Only Polaris staff can raise a warehouse request'; end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'A request needs at least one item';
  end if;

  insert into public.warehouse_requests (
    number, type, department, requester_id, requester_name, requester_email, yacht, reference, eta, required_at,
    destination, berth, recipient_name, recipient_phone, recipient_email, urgent, urgent_reason, deadline, notes)
  values (
    public.next_warehouse_request_number(), p_request->>'type', nullif(p_request->>'department', ''), auth.uid(),
    nullif(p_request->>'requester_name', ''), nullif(p_request->>'requester_email', ''),
    nullif(p_request->>'yacht', ''), nullif(p_request->>'reference', ''),
    nullif(p_request->>'eta', '')::timestamptz, nullif(p_request->>'required_at', '')::timestamptz,
    nullif(p_request->>'destination', ''), nullif(p_request->>'berth', ''),
    nullif(p_request->>'recipient_name', ''), nullif(p_request->>'recipient_phone', ''), nullif(p_request->>'recipient_email', ''),
    coalesce((p_request->>'urgent')::boolean, false), nullif(p_request->>'urgent_reason', ''),
    nullif(p_request->>'deadline', '')::timestamptz, nullif(p_request->>'notes', ''))
  returning * into r;

  insert into public.warehouse_request_lines (request_id, position, description, quantity, unit, oversized, length_cm, width_cm, height_cm, weight_kg)
  select r.id, (t.ord - 1)::int, btrim(t.l->>'description'), nullif(t.l->>'quantity', '')::numeric, nullif(t.l->>'unit', ''),
         coalesce((t.l->>'oversized')::boolean, false), nullif(t.l->>'length_cm', '')::numeric, nullif(t.l->>'width_cm', '')::numeric,
         nullif(t.l->>'height_cm', '')::numeric, nullif(t.l->>'weight_kg', '')::numeric
  from jsonb_array_elements(p_lines) with ordinality as t(l, ord);

  if p_files is not null and jsonb_typeof(p_files) = 'array' and jsonb_array_length(p_files) > 0 then
    insert into public.warehouse_request_files (request_id, kind, doc_type, name, url)
    select r.id, f->>'kind', nullif(f->>'doc_type', ''), f->>'name', f->>'url' from jsonb_array_elements(p_files) as f;
  end if;

  insert into public.warehouse_request_events (request_id, kind, actor_name, body)
  values (r.id, 'submitted', nullif(p_request->>'requester_name', ''), null);
  return r;
end $$;
revoke execute on function public.create_warehouse_request(jsonb, jsonb, jsonb) from public, anon;

-- Move a request to another status. The Warehouse / Logistics team (ShipSync editors) can make any move; the person who raised
-- it can only withdraw it. Completed and cancelled are final. On Hold and Cancelled need a written reason.
create or replace function public.warehouse_request_set_status(p_id uuid, p_status text, p_note text default null)
returns public.warehouse_requests
language plpgsql security invoker set search_path = public as $$
declare r public.warehouse_requests; editor boolean; old text;
begin
  select * into r from public.warehouse_requests where id = p_id for update;
  if not found then raise exception 'Request not found'; end if;
  editor := public.has_module_permission(auth.uid(), 'shipsync', 'edit');
  if p_status not in ('submitted', 'confirmed', 'in_progress', 'completed', 'on_hold', 'cancelled') then
    raise exception 'Unknown status %', p_status;
  end if;
  if r.status in ('completed', 'cancelled') then raise exception 'This request is already %', r.status; end if;
  if r.status = p_status then raise exception 'It is already %', replace(p_status, '_', ' '); end if;
  if not editor and not (r.requester_id = auth.uid() and p_status = 'cancelled') then
    raise exception 'Only the Warehouse team can change the status (you can withdraw your own request)';
  end if;
  if p_status in ('on_hold', 'cancelled') and btrim(coalesce(p_note, '')) = '' then
    raise exception 'Say why (it is recorded on the request)';
  end if;

  old := r.status;
  update public.warehouse_requests
     set status = p_status,
         hold_reason = case when p_status = 'on_hold' then btrim(p_note) else null end
   where id = p_id returning * into r;
  insert into public.warehouse_request_events (request_id, kind, actor_name, body, from_status, to_status)
  values (p_id, 'status', (select display_name from public.user_profiles where user_id = auth.uid()), nullif(btrim(coalesce(p_note, '')), ''), old, p_status);
  return r;
end $$;
revoke execute on function public.warehouse_request_set_status(uuid, text, text) from public, anon;

-- Change a request. It keeps its number, the change needs a written reason, and the reason and the count are recorded so the
-- original is always identifiable. The requester or the Warehouse team can amend, until it is completed or cancelled.
create or replace function public.amend_warehouse_request(p_id uuid, p_patch jsonb, p_lines jsonb, p_reason text)
returns public.warehouse_requests
language plpgsql security invoker set search_path = public as $$
declare r public.warehouse_requests;
begin
  select * into r from public.warehouse_requests where id = p_id for update;
  if not found then raise exception 'Request not found'; end if;
  if r.status in ('completed', 'cancelled') then raise exception 'A % request can no longer be changed', r.status; end if;
  if not (r.requester_id = auth.uid() or public.has_module_permission(auth.uid(), 'shipsync', 'edit')) then
    raise exception 'Only the person who raised the request, or the Warehouse team, can change it';
  end if;
  if btrim(coalesce(p_reason, '')) = '' then raise exception 'Say what changed and why (it is recorded on the request)'; end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'A request needs at least one item';
  end if;

  update public.warehouse_requests set
    yacht = nullif(p_patch->>'yacht', ''), reference = nullif(p_patch->>'reference', ''),
    eta = nullif(p_patch->>'eta', '')::timestamptz, required_at = nullif(p_patch->>'required_at', '')::timestamptz,
    destination = nullif(p_patch->>'destination', ''), berth = nullif(p_patch->>'berth', ''),
    recipient_name = nullif(p_patch->>'recipient_name', ''), recipient_phone = nullif(p_patch->>'recipient_phone', ''),
    recipient_email = nullif(p_patch->>'recipient_email', ''),
    urgent = coalesce((p_patch->>'urgent')::boolean, false), urgent_reason = nullif(p_patch->>'urgent_reason', ''),
    deadline = nullif(p_patch->>'deadline', '')::timestamptz, notes = nullif(p_patch->>'notes', ''),
    amended_count = amended_count + 1
  where id = p_id returning * into r;

  delete from public.warehouse_request_lines where request_id = p_id;
  insert into public.warehouse_request_lines (request_id, position, description, quantity, unit, oversized, length_cm, width_cm, height_cm, weight_kg)
  select p_id, (t.ord - 1)::int, btrim(t.l->>'description'), nullif(t.l->>'quantity', '')::numeric, nullif(t.l->>'unit', ''),
         coalesce((t.l->>'oversized')::boolean, false), nullif(t.l->>'length_cm', '')::numeric, nullif(t.l->>'width_cm', '')::numeric,
         nullif(t.l->>'height_cm', '')::numeric, nullif(t.l->>'weight_kg', '')::numeric
  from jsonb_array_elements(p_lines) with ordinality as t(l, ord);

  insert into public.warehouse_request_events (request_id, kind, actor_name, body)
  values (p_id, 'amended', (select display_name from public.user_profiles where user_id = auth.uid()), btrim(p_reason));
  return r;
end $$;
revoke execute on function public.amend_warehouse_request(uuid, jsonb, jsonb, text) from public, anon;

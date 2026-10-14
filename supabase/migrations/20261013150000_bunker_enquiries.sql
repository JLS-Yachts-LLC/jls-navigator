-- Bunkering enquiries: ONE record for each bunkering enquiry, from the yacht's request through the supplier quotations to the
-- vessel's approval and the delivery — so what was requested, quoted and approved is on record, and follow-ups are visible.
--
--   enquiry     the vessel, what it needs (fuel, quantity, port, date), how it will be delivered, and the vessel's confirmation
--               that the fuel type, specification and quantity have been checked against its requirements
--   quotations  one row per supplier quote: supplier, reference, fuel, quantity quoted, price, validity, status
--   approval    which quotation the Captain / Chief Engineer approved, who, when, and how it was confirmed
--   log         everything that happened, in order (warehouse-request style audit trail)
--
-- The vessel sees its own enquiries in the Client Portal — read-only, served by the portal API (never by these tables' policies):
-- an enquiry is linked to a Polaris yacht (yacht_id) and only linked ones are shown; a quotation is shown only when the Agency team
-- marks it shared_with_vessel; internal notes, comments and supplier costs the team has not shared are never sent.
--
-- Any Polaris staff member can log an enquiry and read them all; the Agency team (Agency & Destinations editors) manages the
-- quotations, moves the status along, and records the approval. Client-portal captains are never staff and see nothing.
--
-- Additive only: new tables, one sequence, four functions. Safe to run once.

create sequence if not exists public.bunker_enquiry_seq start 1;

create or replace function public.next_bunker_enquiry_number() returns text
language sql security definer set search_path = public as $$
  select 'BNK' || lpad(nextval('public.bunker_enquiry_seq')::text, 4, '0');
$$;
revoke execute on function public.next_bunker_enquiry_number() from public, anon;

create table if not exists public.bunker_enquiries (
  id uuid primary key default gen_random_uuid(),
  number text not null unique,
  -- new: logged   quotes_requested: sent to suppliers   quotes_received: quotations in   awaiting_vessel: with the vessel to approve
  -- approved: the vessel approved a quotation   delivered: fuel delivered   cancelled: withdrawn
  status text not null default 'new'
    check (status in ('new', 'quotes_requested', 'quotes_received', 'awaiting_vessel', 'approved', 'delivered', 'cancelled')),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_by_name text,
  -- 1. vessel
  yacht_id uuid references public.yachts(id) on delete set null,   -- the Polaris yacht; only linked enquiries show in the Client Portal
  yacht_name text not null,
  flag text,
  loa_m numeric,
  imo_no text,
  captain_name text,
  chief_engineer_name text,
  contact_number text,
  contact_email text,
  -- 2. requirements
  port text,
  berth text,
  preferred_date date,
  preferred_time text,
  fuel_type text,
  fuel_other text,
  quantity numeric,
  quantity_unit text,
  spec_notes text,                         -- required fuel specification / sulphur limit
  -- 3. delivery
  delivery_method text,
  fuel_remaining text,
  tank_capacity text,
  special_requirements text,
  -- 4. the vessel's declaration: fuel type, specification and quantity checked against its requirements
  declared_by_role text check (declared_by_role is null or declared_by_role in ('Captain', 'Chief Engineer')),
  declared_by_name text,
  declared_at timestamptz,
  declaration_method text,                 -- how it was given: signed on screen / signed form attached / email or WhatsApp
  declaration_signature_url text,
  -- JLS office
  date_enquiry_sent date,
  -- approval of ONE quotation by the vessel
  approved_quote_id uuid,
  approved_by_role text,
  approved_by_name text,
  approved_at timestamptz,
  approval_method text,
  approval_note text,
  -- delivery
  delivered_date date,
  delivered_quantity numeric,
  delivered_unit text,
  bdn_number text,                         -- the bunker delivery note number
  cancel_reason text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.bunker_quotes (
  id uuid primary key default gen_random_uuid(),
  enquiry_id uuid not null references public.bunker_enquiries(id) on delete cascade,
  supplier text not null,
  supplier_contact text,
  supplier_phone text,
  supplier_email text,
  quote_ref text,
  date_requested date,
  date_received date,
  fuel_type text,
  quantity numeric,                        -- quantity QUOTED (may differ from what was asked for)
  quantity_unit text,
  unit_price numeric,
  price_unit text,                         -- per MT / per litre / per US gallon …
  currency text not null default 'USD',
  total numeric,
  valid_until date,
  delivery_terms text,
  status text not null default 'requested' check (status in ('requested', 'received', 'approved', 'rejected', 'expired')),
  shared_with_vessel boolean not null default false,   -- shown to the vessel in the Client Portal (the team chooses what the vessel sees)
  notes text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.bunker_enquiry_files (
  id uuid primary key default gen_random_uuid(),
  enquiry_id uuid not null references public.bunker_enquiries(id) on delete cascade,
  kind text not null check (kind in ('document', 'photo')),
  doc_type text,                           -- Quotation / Vessel confirmation / Signed form / BDN / Other
  name text not null,
  url text not null,                       -- a "<bucket>/<path>" storage reference
  uploaded_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists public.bunker_enquiry_events (
  id uuid primary key default gen_random_uuid(),
  enquiry_id uuid not null references public.bunker_enquiries(id) on delete cascade,
  kind text not null check (kind in ('created', 'status', 'quote', 'approved', 'delivered', 'comment', 'file', 'edited')),
  actor_id uuid references auth.users(id) on delete set null default auth.uid(),
  actor_name text,
  body text,
  from_status text,
  to_status text,
  created_at timestamptz not null default now()
);

create index if not exists idx_bunker_enquiries_status on public.bunker_enquiries (status, created_at desc);
create index if not exists idx_bunker_enquiries_yacht on public.bunker_enquiries (yacht_name);
create index if not exists idx_bunker_enquiries_yacht_id on public.bunker_enquiries (yacht_id) where yacht_id is not null;
create index if not exists idx_bunker_quotes_enquiry on public.bunker_quotes (enquiry_id);
create index if not exists idx_bunker_files_enquiry on public.bunker_enquiry_files (enquiry_id);
create index if not exists idx_bunker_events_enquiry on public.bunker_enquiry_events (enquiry_id, created_at);

drop trigger if exists set_bunker_enquiries_updated_at on public.bunker_enquiries;
create trigger set_bunker_enquiries_updated_at before update on public.bunker_enquiries
  for each row execute function public.update_updated_at_column();
drop trigger if exists set_bunker_quotes_updated_at on public.bunker_quotes;
create trigger set_bunker_quotes_updated_at before update on public.bunker_quotes
  for each row execute function public.update_updated_at_column();

alter table public.bunker_enquiries enable row level security;
alter table public.bunker_quotes enable row level security;
alter table public.bunker_enquiry_files enable row level security;
alter table public.bunker_enquiry_events enable row level security;

-- Enquiries: staff read all and log their own; the Agency team (Agency & Destinations editors) changes them.
drop policy if exists bunker_enquiries_select on public.bunker_enquiries;
create policy bunker_enquiries_select on public.bunker_enquiries for select using (public.is_polaris_staff());
drop policy if exists bunker_enquiries_insert on public.bunker_enquiries;
create policy bunker_enquiries_insert on public.bunker_enquiries for insert
  with check (public.is_polaris_staff() and created_by = auth.uid());
drop policy if exists bunker_enquiries_update on public.bunker_enquiries;
create policy bunker_enquiries_update on public.bunker_enquiries for update
  using (public.is_polaris_staff() and (created_by = auth.uid() or public.has_module_permission(auth.uid(), 'agency', 'edit')))
  with check (public.is_polaris_staff() and (created_by = auth.uid() or public.has_module_permission(auth.uid(), 'agency', 'edit')));

-- Quotations are the office's: staff read; only Agency editors write.
drop policy if exists bunker_quotes_select on public.bunker_quotes;
create policy bunker_quotes_select on public.bunker_quotes for select using (public.is_polaris_staff());
drop policy if exists bunker_quotes_write on public.bunker_quotes;
create policy bunker_quotes_write on public.bunker_quotes for all
  using (public.is_polaris_staff() and public.has_module_permission(auth.uid(), 'agency', 'edit'))
  with check (public.is_polaris_staff() and public.has_module_permission(auth.uid(), 'agency', 'edit'));

drop policy if exists bunker_files_select on public.bunker_enquiry_files;
create policy bunker_files_select on public.bunker_enquiry_files for select using (public.is_polaris_staff());
drop policy if exists bunker_files_write on public.bunker_enquiry_files;
create policy bunker_files_write on public.bunker_enquiry_files for all
  using (public.is_polaris_staff() and exists (select 1 from public.bunker_enquiries e where e.id = enquiry_id
         and (e.created_by = auth.uid() or public.has_module_permission(auth.uid(), 'agency', 'edit'))))
  with check (public.is_polaris_staff() and exists (select 1 from public.bunker_enquiries e where e.id = enquiry_id
         and (e.created_by = auth.uid() or public.has_module_permission(auth.uid(), 'agency', 'edit'))));

-- The log is read by staff and only ever added to, as yourself.
drop policy if exists bunker_events_select on public.bunker_enquiry_events;
create policy bunker_events_select on public.bunker_enquiry_events for select using (public.is_polaris_staff());
drop policy if exists bunker_events_insert on public.bunker_enquiry_events;
create policy bunker_events_insert on public.bunker_enquiry_events for insert
  with check (public.is_polaris_staff() and actor_id = auth.uid());

-- ── Each change in ONE transaction. security invoker: the policies above still apply on top of these rules. ─────────────────

-- Log an enquiry with its attached files. All of it saves, or none of it does.
create or replace function public.create_bunker_enquiry(p jsonb, p_files jsonb)
returns public.bunker_enquiries
language plpgsql security invoker set search_path = public as $$
declare r public.bunker_enquiries; who text;
begin
  if not public.is_polaris_staff() then raise exception 'Only Polaris staff can log a bunkering enquiry'; end if;
  if btrim(coalesce(p->>'yacht_name', '')) = '' then raise exception 'The yacht name is needed'; end if;
  select display_name into who from public.user_profiles where user_id = auth.uid();

  insert into public.bunker_enquiries (
    number, created_by, created_by_name, yacht_id, yacht_name, flag, loa_m, imo_no, captain_name, chief_engineer_name, contact_number, contact_email,
    port, berth, preferred_date, preferred_time, fuel_type, fuel_other, quantity, quantity_unit, spec_notes,
    delivery_method, fuel_remaining, tank_capacity, special_requirements,
    declared_by_role, declared_by_name, declared_at, declaration_method, declaration_signature_url, date_enquiry_sent, notes)
  values (
    public.next_bunker_enquiry_number(), auth.uid(), who, nullif(p->>'yacht_id', '')::uuid, btrim(p->>'yacht_name'), nullif(p->>'flag', ''), nullif(p->>'loa_m', '')::numeric,
    nullif(p->>'imo_no', ''), nullif(p->>'captain_name', ''), nullif(p->>'chief_engineer_name', ''), nullif(p->>'contact_number', ''), nullif(p->>'contact_email', ''),
    nullif(p->>'port', ''), nullif(p->>'berth', ''), nullif(p->>'preferred_date', '')::date, nullif(p->>'preferred_time', ''),
    nullif(p->>'fuel_type', ''), nullif(p->>'fuel_other', ''), nullif(p->>'quantity', '')::numeric, nullif(p->>'quantity_unit', ''), nullif(p->>'spec_notes', ''),
    nullif(p->>'delivery_method', ''), nullif(p->>'fuel_remaining', ''), nullif(p->>'tank_capacity', ''), nullif(p->>'special_requirements', ''),
    nullif(p->>'declared_by_role', ''), nullif(p->>'declared_by_name', ''), nullif(p->>'declared_at', '')::timestamptz,
    nullif(p->>'declaration_method', ''), nullif(p->>'declaration_signature_url', ''), nullif(p->>'date_enquiry_sent', '')::date, nullif(p->>'notes', ''))
  returning * into r;

  if p_files is not null and jsonb_typeof(p_files) = 'array' and jsonb_array_length(p_files) > 0 then
    insert into public.bunker_enquiry_files (enquiry_id, kind, doc_type, name, url)
    select r.id, f->>'kind', nullif(f->>'doc_type', ''), f->>'name', f->>'url' from jsonb_array_elements(p_files) as f;
  end if;

  insert into public.bunker_enquiry_events (enquiry_id, kind, actor_name, body) values (r.id, 'created', who, null);
  return r;
end $$;
revoke execute on function public.create_bunker_enquiry(jsonb, jsonb) from public, anon;

-- Move an enquiry along. The Agency team can make any move except Approved (that is recorded with the vessel's approval, below)
-- and Delivered (recorded with its delivery details); the person who logged it can only withdraw it. Cancelled needs a reason.
create or replace function public.bunker_set_status(p_id uuid, p_status text, p_note text default null)
returns public.bunker_enquiries
language plpgsql security invoker set search_path = public as $$
declare r public.bunker_enquiries; editor boolean; old text;
begin
  select * into r from public.bunker_enquiries where id = p_id for update;
  if not found then raise exception 'Enquiry not found'; end if;
  editor := public.has_module_permission(auth.uid(), 'agency', 'edit');
  if p_status not in ('new', 'quotes_requested', 'quotes_received', 'awaiting_vessel', 'cancelled') then
    raise exception 'Approval and delivery are recorded with their own details, not by changing the status';
  end if;
  if r.status in ('delivered', 'cancelled') then raise exception 'This enquiry is already %', r.status; end if;
  if r.status = p_status then raise exception 'It is already %', replace(p_status, '_', ' '); end if;
  if not editor and not (r.created_by = auth.uid() and p_status = 'cancelled') then
    raise exception 'Only the Agency team can change the status (you can withdraw your own enquiry)';
  end if;
  if p_status = 'cancelled' and btrim(coalesce(p_note, '')) = '' then raise exception 'Say why it is being cancelled'; end if;
  -- The vessel must have confirmed its requirements (fuel type, specification, quantity) before anything goes to suppliers.
  if p_status = 'quotes_requested' and (r.declared_by_name is null or r.declared_by_role is null) then
    raise exception 'The Captain or Chief Engineer must confirm the requirements before enquiries go to suppliers';
  end if;

  old := r.status;
  update public.bunker_enquiries set status = p_status,
    cancel_reason = case when p_status = 'cancelled' then btrim(p_note) else cancel_reason end,
    date_enquiry_sent = case when p_status = 'quotes_requested' and date_enquiry_sent is null then current_date else date_enquiry_sent end
  where id = p_id returning * into r;
  insert into public.bunker_enquiry_events (enquiry_id, kind, actor_name, body, from_status, to_status)
  values (p_id, 'status', (select display_name from public.user_profiles where user_id = auth.uid()), nullif(btrim(coalesce(p_note, '')), ''), old, p_status);
  return r;
end $$;
revoke execute on function public.bunker_set_status(uuid, text, text) from public, anon;

-- Record the vessel's approval of ONE quotation: that quotation becomes Approved, the other received ones are marked Rejected, and the
-- enquiry becomes Approved — with who approved it (Captain or Chief Engineer), when, and how it was confirmed.
create or replace function public.bunker_approve_quote(
  p_enquiry uuid, p_quote uuid, p_role text, p_name text, p_method text, p_note text default null)
returns public.bunker_enquiries
language plpgsql security invoker set search_path = public as $$
declare r public.bunker_enquiries; q public.bunker_quotes; old text;
begin
  if not public.has_module_permission(auth.uid(), 'agency', 'edit') then raise exception 'Only the Agency team can record an approval'; end if;
  select * into r from public.bunker_enquiries where id = p_enquiry for update;
  if not found then raise exception 'Enquiry not found'; end if;
  if r.status in ('approved', 'delivered', 'cancelled') then raise exception 'This enquiry is already %', r.status; end if;
  select * into q from public.bunker_quotes where id = p_quote and enquiry_id = p_enquiry;
  if not found then raise exception 'That quotation is not on this enquiry'; end if;
  if q.status not in ('received') then raise exception 'Only a received quotation can be approved (this one is %)', q.status; end if;
  if p_role not in ('Captain', 'Chief Engineer') then raise exception 'The approval must come from the Captain or the Chief Engineer'; end if;
  if btrim(coalesce(p_name, '')) = '' then raise exception 'Give the name of the person who approved it'; end if;
  if btrim(coalesce(p_method, '')) = '' then raise exception 'Say how it was confirmed (signed form, email, WhatsApp…)'; end if;

  old := r.status;
  update public.bunker_quotes set status = 'approved' where id = p_quote;
  update public.bunker_quotes set status = 'rejected' where enquiry_id = p_enquiry and id <> p_quote and status = 'received';
  update public.bunker_enquiries set status = 'approved', approved_quote_id = p_quote, approved_by_role = p_role, approved_by_name = btrim(p_name),
    approved_at = now(), approval_method = btrim(p_method), approval_note = nullif(btrim(coalesce(p_note, '')), '')
  where id = p_enquiry returning * into r;
  insert into public.bunker_enquiry_events (enquiry_id, kind, actor_name, body, from_status, to_status)
  values (p_enquiry, 'approved', (select display_name from public.user_profiles where user_id = auth.uid()),
          q.supplier || ' — ' || coalesce(q.quantity::text, '?') || ' ' || coalesce(q.quantity_unit, '') || ' at ' || coalesce(q.unit_price::text, '?') || ' ' || q.currency
          || ' ' || coalesce(q.price_unit, '') || ' — approved by ' || btrim(p_name) || ' (' || p_role || ') via ' || btrim(p_method),
          old, 'approved');
  return r;
end $$;
revoke execute on function public.bunker_approve_quote(uuid, uuid, text, text, text, text) from public, anon;

-- Record the delivery. Only an approved enquiry can be delivered.
create or replace function public.bunker_mark_delivered(
  p_id uuid, p_date date, p_quantity numeric, p_unit text, p_bdn text default null, p_note text default null)
returns public.bunker_enquiries
language plpgsql security invoker set search_path = public as $$
declare r public.bunker_enquiries;
begin
  if not public.has_module_permission(auth.uid(), 'agency', 'edit') then raise exception 'Only the Agency team can record a delivery'; end if;
  select * into r from public.bunker_enquiries where id = p_id for update;
  if not found then raise exception 'Enquiry not found'; end if;
  if r.status <> 'approved' then raise exception 'Only an approved enquiry can be marked delivered (this one is %)', replace(r.status, '_', ' '); end if;
  if p_date is null or coalesce(p_quantity, 0) <= 0 then raise exception 'Give the delivery date and the quantity delivered'; end if;
  update public.bunker_enquiries set status = 'delivered', delivered_date = p_date, delivered_quantity = p_quantity,
    delivered_unit = nullif(btrim(coalesce(p_unit, '')), ''), bdn_number = nullif(btrim(coalesce(p_bdn, '')), '')
  where id = p_id returning * into r;
  insert into public.bunker_enquiry_events (enquiry_id, kind, actor_name, body, from_status, to_status)
  values (p_id, 'delivered', (select display_name from public.user_profiles where user_id = auth.uid()),
          p_quantity::text || ' ' || coalesce(p_unit, '') || ' on ' || p_date::text || case when btrim(coalesce(p_bdn, '')) <> '' then ' (BDN ' || btrim(p_bdn) || ')' else '' end
          || case when btrim(coalesce(p_note, '')) <> '' then ' — ' || btrim(p_note) else '' end, 'approved', 'delivered');
  return r;
end $$;
revoke execute on function public.bunker_mark_delivered(uuid, date, numeric, text, text, text) from public, anon;


-- Record the vessel's confirmation that the fuel type, specification and quantity have been checked against its requirements. The
-- person who logged the enquiry or the Agency team can record it; it can be given again if the requirements change.
create or replace function public.bunker_record_declaration(
  p_id uuid, p_role text, p_name text, p_method text, p_signature_url text default null)
returns public.bunker_enquiries
language plpgsql security invoker set search_path = public as $$
declare r public.bunker_enquiries;
begin
  select * into r from public.bunker_enquiries where id = p_id for update;
  if not found then raise exception 'Enquiry not found'; end if;
  if not (r.created_by = auth.uid() or public.has_module_permission(auth.uid(), 'agency', 'edit')) then
    raise exception 'Only the person who logged the enquiry, or the Agency team, can record this';
  end if;
  if r.status in ('approved', 'delivered', 'cancelled') then raise exception 'This enquiry is already %', r.status; end if;
  if p_role not in ('Captain', 'Chief Engineer') then raise exception 'The confirmation must come from the Captain or the Chief Engineer'; end if;
  if btrim(coalesce(p_name, '')) = '' then raise exception 'Give the name of the person who confirmed it'; end if;
  if btrim(coalesce(p_method, '')) = '' then raise exception 'Say how it was confirmed (signed on screen, signed form, email, WhatsApp…)'; end if;
  update public.bunker_enquiries set declared_by_role = p_role, declared_by_name = btrim(p_name), declared_at = now(),
    declaration_method = btrim(p_method), declaration_signature_url = nullif(btrim(coalesce(p_signature_url, '')), '')
  where id = p_id returning * into r;
  insert into public.bunker_enquiry_events (enquiry_id, kind, actor_name, body)
  values (p_id, 'edited', (select display_name from public.user_profiles where user_id = auth.uid()),
          'Requirements confirmed by ' || btrim(p_name) || ' (' || p_role || ') via ' || btrim(p_method));
  return r;
end $$;
revoke execute on function public.bunker_record_declaration(uuid, text, text, text, text) from public, anon;

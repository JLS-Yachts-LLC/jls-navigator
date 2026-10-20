-- Zebra label printers: print straight from Polaris, through a connector on the office network.
--
-- Polaris runs in the cloud and can't reach a printer on the warehouse LAN. A small
-- connector (tools/print-connector, a PowerShell script run as a scheduled task on a
-- member server) calls OUT to Polaris over HTTPS, collects queued jobs and sends each
-- one to its printer's IP on port 9100. Nothing is opened inbound.
--
--   print_connectors  one row per installed connector. The token it signs in with is
--                     shown once when it is created; only its SHA-256 is kept here, and
--                     staff sessions cannot read even that (column grants below).
--   label_printers    the printers: where they are, their IP, label size and DPI, which
--                     connector reaches them, and the last status the connector read
--                     from them (paper out, head open, paused, unreachable).
--   print_jobs        the queue. A job holds the LABEL CONTENTS (code, title, lines),
--                     never printer commands: Polaris renders the ZPL itself when the
--                     connector collects the job (src/lib/printing/zpl.ts). So a
--                     signed-in account can waste labels at worst — it cannot send a
--                     printer a command that changes its settings or network.
--
-- Who may do what:
--   • queue a job, see printers and job results: any signed-in staff account — the same
--     reach the warehouse tables these labels describe already have. Portal captains
--     are refused by the restrictive deny below.
--   • add/edit printers and connectors: ShipSync edit (or global admin).
--   • collect jobs / report results: only the connector, through the Worker, with the
--     service role (claim_print_jobs is not granted to anyone else).

create table if not exists public.print_connectors (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  token_hash    text not null unique,
  active        boolean not null default true,
  hostname      text,
  version       text,
  last_ip       text,
  last_seen_at  timestamptz,
  created_by    uuid default auth.uid(),
  created_at    timestamptz not null default now()
);

create table if not exists public.label_printers (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  location         text,
  host             text,                       -- IP or DNS name on the office network; null = not set up yet
  port             integer not null default 9100 check (port in (9100, 6101)),
  dpi              integer not null default 203 check (dpi in (203, 300, 600)),
  label_width_mm   numeric(5,1) not null default 100 check (label_width_mm between 20 and 120),
  label_height_mm  numeric(5,1) not null default 50 check (label_height_mm between 10 and 300),
  connector_id     uuid references public.print_connectors(id) on delete set null,
  active           boolean not null default true,
  status           text not null default 'unknown'
                   check (status in ('unknown','ready','paper_out','ribbon_out','head_open','paused','unreachable','error')),
  status_detail    text,
  status_at        timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table if not exists public.print_jobs (
  id            uuid primary key default gen_random_uuid(),
  printer_id    uuid not null references public.label_printers(id) on delete cascade,
  labels        jsonb not null
                check (jsonb_typeof(labels) = 'array' and jsonb_array_length(labels) between 1 and 200 and length(labels::text) <= 100000),
  copies        integer not null default 1 check (copies between 1 and 20),
  source        text,                         -- what printed it, e.g. 'warehouse', 'test'
  ref           text,                         -- the reference the labels are for, e.g. JLSWH26-00001
  status        text not null default 'queued' check (status in ('queued','sending','printed','failed','cancelled')),
  error         text,
  attempts      integer not null default 0,
  connector_id  uuid references public.print_connectors(id) on delete set null,
  requested_by  uuid default auth.uid(),
  created_at    timestamptz not null default now(),
  claimed_at    timestamptz,
  completed_at  timestamptz
);

create index if not exists print_jobs_queue_idx on public.print_jobs (status, created_at) where status in ('queued','sending');
create index if not exists print_jobs_printer_idx on public.print_jobs (printer_id, created_at desc);

alter table public.print_connectors enable row level security;
alter table public.label_printers  enable row level security;
alter table public.print_jobs      enable row level security;

-- Portal captains: nothing here is theirs (see 20260909140000_portal_captain_default_deny).
create policy portal_captain_denied on public.print_connectors as restrictive for all to authenticated using ((select not public.is_portal_captain())) with check ((select not public.is_portal_captain()));
create policy portal_captain_denied on public.label_printers  as restrictive for all to authenticated using ((select not public.is_portal_captain())) with check ((select not public.is_portal_captain()));
create policy portal_captain_denied on public.print_jobs      as restrictive for all to authenticated using ((select not public.is_portal_captain())) with check ((select not public.is_portal_captain()));

-- Connectors: ShipSync editors manage them. The token hash is never readable from a session.
create policy print_connectors_select on public.print_connectors for select to authenticated
  using (public.has_module_permission(auth.uid(), 'shipsync', 'edit'));
create policy print_connectors_update on public.print_connectors for update to authenticated
  using (public.has_module_permission(auth.uid(), 'shipsync', 'edit'))
  with check (public.has_module_permission(auth.uid(), 'shipsync', 'edit'));
create policy print_connectors_delete on public.print_connectors for delete to authenticated
  using (public.has_module_permission(auth.uid(), 'shipsync', 'edit'));
-- (no insert policy: connectors are created by create_print_connector(), which makes the token)
revoke all on public.print_connectors from anon, authenticated;
grant select (id, name, active, hostname, version, last_ip, last_seen_at, created_by, created_at) on public.print_connectors to authenticated;
grant update (name, active) on public.print_connectors to authenticated;
grant delete on public.print_connectors to authenticated;

-- Printers: every staff account can see them (to pick one); ShipSync editors change them.
create policy label_printers_select on public.label_printers for select to authenticated using (true);
create policy label_printers_insert on public.label_printers for insert to authenticated
  with check (public.has_module_permission(auth.uid(), 'shipsync', 'edit'));
create policy label_printers_update on public.label_printers for update to authenticated
  using (public.has_module_permission(auth.uid(), 'shipsync', 'edit'))
  with check (public.has_module_permission(auth.uid(), 'shipsync', 'edit'));
create policy label_printers_delete on public.label_printers for delete to authenticated
  using (public.has_module_permission(auth.uid(), 'shipsync', 'edit'));
revoke all on public.label_printers from anon;

-- Jobs: staff queue their own; everyone sees the queue (to know it printed); ShipSync editors may cancel.
create policy print_jobs_select on public.print_jobs for select to authenticated using (true);
create policy print_jobs_insert on public.print_jobs for insert to authenticated
  with check (requested_by = auth.uid() and status = 'queued' and attempts = 0 and connector_id is null
              and claimed_at is null and completed_at is null and error is null);
create policy print_jobs_update on public.print_jobs for update to authenticated
  using (status = 'queued' and (requested_by = auth.uid() or public.has_module_permission(auth.uid(), 'shipsync', 'edit')))
  with check (status = 'cancelled');
revoke all on public.print_jobs from anon;
revoke update on public.print_jobs from authenticated;
grant update (status) on public.print_jobs to authenticated;

create or replace function public.label_printers_touch() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists label_printers_touch on public.label_printers;
create trigger label_printers_touch before update on public.label_printers for each row execute function public.label_printers_touch();

-- Create a connector and hand back its token, once. Only the hash is stored.
create or replace function public.create_print_connector(p_name text)
returns table (id uuid, token text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_token text;
  v_id    uuid;
begin
  if not public.has_module_permission(auth.uid(), 'shipsync', 'edit') then
    raise exception 'You need ShipSync edit access to add a print connector';
  end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Give the connector a name'; end if;
  v_token := 'pc_' || encode(gen_random_bytes(32), 'hex');
  insert into public.print_connectors (name, token_hash)
    values (trim(p_name), encode(digest(v_token, 'sha256'), 'hex'))
    returning print_connectors.id into v_id;
  return query select v_id, v_token;
end $$;

-- Replace a connector's token (the old one stops working at once).
create or replace function public.rotate_print_connector_token(p_id uuid)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v_token text;
begin
  if not public.has_module_permission(auth.uid(), 'shipsync', 'edit') then
    raise exception 'You need ShipSync edit access to change a print connector';
  end if;
  v_token := 'pc_' || encode(gen_random_bytes(32), 'hex');
  update public.print_connectors set token_hash = encode(digest(v_token, 'sha256'), 'hex') where id = p_id;
  if not found then raise exception 'Connector not found'; end if;
  return v_token;
end $$;

revoke all on function public.create_print_connector(text) from public, anon;
revoke all on function public.rotate_print_connector_token(uuid) from public, anon;
grant execute on function public.create_print_connector(text) to authenticated;
grant execute on function public.rotate_print_connector_token(uuid) to authenticated;

-- The connector collects its jobs (called by the Worker with the service role only).
-- A job a connector took but never reported on within two minutes (the connector or
-- the server went down mid-print) goes back in the queue; after three tries it fails.
create or replace function public.claim_print_jobs(p_connector uuid, p_limit integer default 10)
returns setof public.print_jobs
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.print_jobs j
     set status = case when j.attempts >= 3 then 'failed' else 'queued' end,
         error  = case when j.attempts >= 3 then 'The print connector stopped answering while printing this' else j.error end,
         completed_at = case when j.attempts >= 3 then now() else null end
   where j.status = 'sending' and j.claimed_at < now() - interval '2 minutes';

  -- A job nobody collected for a day (the connector is off) is given up on, so it can't print by surprise later.
  update public.print_jobs j
     set status = 'failed', error = 'Not printed within a day — the print connector was offline', completed_at = now()
   where j.status = 'queued' and j.created_at < now() - interval '1 day';

  return query
  update public.print_jobs j
     set status = 'sending', claimed_at = now(), attempts = j.attempts + 1, connector_id = p_connector
   where j.id in (
     select q.id from public.print_jobs q
       join public.label_printers p on p.id = q.printer_id
      where q.status = 'queued' and p.active and p.host is not null and p.connector_id = p_connector
      order by q.created_at
      limit greatest(1, least(p_limit, 50))
      for update of q skip locked)
  returning j.*;
end $$;

revoke all on function public.claim_print_jobs(uuid, integer) from public, anon, authenticated;
grant execute on function public.claim_print_jobs(uuid, integer) to service_role;

-- Placeholders for the two printers Logistics asked about. Fill in the IP, label size
-- and connector under ShipSync → Printers once the printer details are in.
insert into public.label_printers (name, location, active)
select v.name, v.location, false
from (values ('Receiving', 'Warehouse — receiving desk'), ('Storage', 'Warehouse — storage')) as v(name, location)
where not exists (select 1 from public.label_printers);

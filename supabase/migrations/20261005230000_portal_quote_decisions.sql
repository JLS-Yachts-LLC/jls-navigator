-- Client Portal — a client's decision on a JLS quotation.
--
-- Quotations are QuickBooks Estimates. The client reviews one in the portal
-- (line items, totals, the branded PDF) and approves, declines or asks a
-- question. The decision is recorded HERE, not written back to QuickBooks:
-- marking an Estimate "Accepted" in QuickBooks is the team's own step when they
-- convert it to a Sales Order, and it generates the pro-forma invoice
-- automatically (estimate-docgen → maybeSalesOrderProforma). So a decision
-- raises a Client Request telling the team, and they accept it in QuickBooks as
-- they do today.
--
-- Same isolation as the portal's other tables: staff manage everything; a
-- portal login reads its own vessel's decisions from an MFA-verified session and
-- never writes directly — /api/portal/quotes writes with the service role.

create table if not exists public.portal_quote_decisions (
  id uuid primary key default gen_random_uuid(),
  yacht_id uuid not null references public.yachts(id) on delete cascade,
  qbo_estimate_id text not null,
  doc_number text,
  decision text not null check (decision in ('approved', 'declined', 'query')),
  note text,
  total numeric,
  currency text,
  decided_by uuid references auth.users(id) on delete set null,
  decided_by_name text,
  captain_request_id uuid references public.captain_requests(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists portal_quote_decisions_lookup_idx
  on public.portal_quote_decisions (yacht_id, qbo_estimate_id, created_at desc);

alter table public.portal_quote_decisions enable row level security;

drop policy if exists staff_manage on public.portal_quote_decisions;
create policy staff_manage on public.portal_quote_decisions for all to authenticated
  using (not public.is_portal_captain()) with check (not public.is_portal_captain());
drop policy if exists captain_select on public.portal_quote_decisions;
create policy captain_select on public.portal_quote_decisions for select to authenticated
  using (public.is_portal_captain() and public.portal_aal2() and yacht_id in (select public.captain_yacht_ids()));
drop policy if exists portal_captain_block_insert on public.portal_quote_decisions;
create policy portal_captain_block_insert on public.portal_quote_decisions as restrictive for insert to authenticated
  with check (not public.is_portal_captain());
drop policy if exists portal_captain_block_update on public.portal_quote_decisions;
create policy portal_captain_block_update on public.portal_quote_decisions as restrictive for update to authenticated
  using (not public.is_portal_captain());
drop policy if exists portal_captain_block_delete on public.portal_quote_decisions;
create policy portal_captain_block_delete on public.portal_quote_decisions as restrictive for delete to authenticated
  using (not public.is_portal_captain());

-- A vessel's billing accounts in QuickBooks companies other than JLS's own
-- (e.g. Waypoint Trading LLC). yachts.qbo_customer_id stays the JLS customer and
-- every JLS-only feature (visa invoicing, fleet finance, sync matching) keeps
-- using it; the Client Portal reads invoices from both.
create table if not exists public.yacht_qbo_accounts (
  id uuid primary key default gen_random_uuid(),
  yacht_id uuid not null references public.yachts(id) on delete cascade,
  realm_id text not null,
  customer_id text not null,
  company_label text not null,
  customer_name text,
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (yacht_id, realm_id)
);

alter table public.yacht_qbo_accounts enable row level security;
drop policy if exists "staff read" on public.yacht_qbo_accounts;
create policy "staff read" on public.yacht_qbo_accounts for select to authenticated
  using (not (select public.is_portal_captain()));
revoke all on public.yacht_qbo_accounts from anon;
revoke insert, update, delete on public.yacht_qbo_accounts from authenticated;
grant select on public.yacht_qbo_accounts to authenticated;

-- AQUILA is billed only by Waypoint (realm 9341456599242940): "SY Aquila- Captain Mike".
insert into public.yacht_qbo_accounts (yacht_id, realm_id, customer_id, company_label, customer_name, created_by)
values ('47321d28-1cfd-4525-a63f-3fd935dfe1af', '9341456599242940', '946', 'Waypoint Trading LLC', 'SY Aquila- Captain Mike',
        '2b0476e5-ba30-488a-b943-2edf2b6bfe87')
on conflict (yacht_id, realm_id) do nothing;

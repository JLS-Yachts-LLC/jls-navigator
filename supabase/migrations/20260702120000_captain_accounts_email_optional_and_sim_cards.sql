-- 1. Captain accounts can now exist before a login is linked:
--    user_id becomes nullable and an email column records the intended login.
alter table public.captain_accounts alter column user_id drop not null;
alter table public.captain_accounts add column if not exists email text;
alter table public.captain_accounts drop constraint if exists captain_accounts_user_id_yacht_id_key;
create unique index if not exists captain_accounts_user_yacht_uniq
  on public.captain_accounts (user_id, yacht_id) where user_id is not null;

-- 2. SIM Cards register (Etisalat / Du SIMs resold to yachts)
create table if not exists public.sim_cards (
  id            uuid primary key default gen_random_uuid(),
  provider      text not null check (provider in ('etisalat','du')),
  phone_number  text,
  iccid         text,
  plan_name     text,
  yacht_id      uuid references public.yachts(id) on delete set null,
  assigned_to   text,
  status        text not null default 'active' check (status in ('active','suspended','cancelled','spare')),
  monthly_cost  numeric,
  cost_currency text not null default 'AED',
  sell_price    numeric,
  sell_currency text not null default 'AED',
  data_allowance text,
  activated_on  date,
  renewal_date  date,
  notes         text,
  created_by    uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

drop trigger if exists sim_cards_touch on public.sim_cards;
create trigger sim_cards_touch before update on public.sim_cards
  for each row execute function public.portal_touch_updated_at();

alter table public.sim_cards enable row level security;
drop policy if exists staff_all on public.sim_cards;
create policy staff_all on public.sim_cards
  for all to authenticated using (true) with check (true);
-- portal captains never see SIM stock/cost data
drop policy if exists portal_captain_block on public.sim_cards;
create policy portal_captain_block on public.sim_cards
  as restrictive for all to authenticated
  using (not public.is_portal_captain()) with check (not public.is_portal_captain());

-- 3. Test captain (no login linked yet): Captain Matthew Peeters aboard AQUILA
insert into public.captain_accounts (user_id, yacht_id, display_name, email)
select null, '47321d28-1cfd-4525-a63f-3fd935dfe1af', 'Captain Matthew Peeters', null
where not exists (
  select 1 from public.captain_accounts
  where yacht_id = '47321d28-1cfd-4525-a63f-3fd935dfe1af'
    and display_name = 'Captain Matthew Peeters'
);

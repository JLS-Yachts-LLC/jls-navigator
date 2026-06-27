alter table public.orbit_projects add column if not exists charge_amount numeric;
alter table public.orbit_projects add column if not exists billing_status text not null default 'pending_review';
alter table public.orbit_projects add column if not exists invoice_ref text;
alter table public.orbit_projects add column if not exists invoice_amount numeric;

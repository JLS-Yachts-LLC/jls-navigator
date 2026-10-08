-- Automated reports, opted in per vessel. Nothing is sent to a vessel unless a
-- row here is enabled, and each row names its own recipients — there is no
-- fleet-wide default. Written by staff from Reports → Automated Reports; sent
-- by the worker cron (lib/vessel-reports).
create table if not exists public.vessel_report_subscriptions (
  id uuid primary key default gen_random_uuid(),
  yacht_id uuid not null references public.yachts(id) on delete cascade,
  report_key text not null check (report_key in ('visa_status', 'sign_on_off')),
  enabled boolean not null default false,
  recipients text[] not null default '{}',
  cc text[] not null default '{}',
  schedule jsonb not null default '{"day":"mon","time":"08:00","tz":"Asia/Dubai"}'::jsonb,
  note text,
  last_sent_at timestamptz,
  last_status text,
  last_error text,
  created_by uuid default auth.uid(),
  updated_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (yacht_id, report_key),
  -- Switched on only with someone to send it to.
  constraint vessel_report_needs_recipient check (not enabled or cardinality(recipients) > 0)
);

-- Every send (scheduled, manual or test). The unique slot is the cron's
-- once-only guard: two overlapping ticks can't both claim the same run.
create table if not exists public.vessel_report_runs (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid references public.vessel_report_subscriptions(id) on delete set null,
  yacht_id uuid not null references public.yachts(id) on delete cascade,
  report_key text not null,
  trigger text not null check (trigger in ('schedule', 'manual', 'test')),
  slot text,
  status text not null default 'sending' check (status in ('sending', 'sent', 'failed', 'skipped')),
  recipients text[] not null default '{}',
  summary text,
  error text,
  sent_by uuid,
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  unique (subscription_id, slot)
);
create index if not exists vessel_report_runs_yacht_idx on public.vessel_report_runs (yacht_id, created_at desc);

create or replace function public.vessel_report_subscriptions_touch() returns trigger
language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end $$;
drop trigger if exists vessel_report_subscriptions_touch on public.vessel_report_subscriptions;
create trigger vessel_report_subscriptions_touch before update on public.vessel_report_subscriptions
  for each row execute function public.vessel_report_subscriptions_touch();

alter table public.vessel_report_subscriptions enable row level security;
alter table public.vessel_report_runs enable row level security;

drop policy if exists "staff manage" on public.vessel_report_subscriptions;
create policy "staff manage" on public.vessel_report_subscriptions for all to authenticated
  using (not (select public.is_portal_captain())) with check (not (select public.is_portal_captain()));
drop policy if exists "staff read" on public.vessel_report_runs;
create policy "staff read" on public.vessel_report_runs for select to authenticated
  using (not (select public.is_portal_captain()));

revoke all on public.vessel_report_subscriptions from anon;
revoke all on public.vessel_report_runs from anon;
-- Staff edit the settings; the send-state columns are the worker's.
revoke update on public.vessel_report_subscriptions from authenticated;
grant select, insert, delete on public.vessel_report_subscriptions to authenticated;
grant update (enabled, recipients, cc, schedule, note) on public.vessel_report_subscriptions to authenticated;
revoke insert, update, delete on public.vessel_report_runs from authenticated;
grant select on public.vessel_report_runs to authenticated;

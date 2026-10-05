-- Automatic expiry reminders over WhatsApp. Three layers of off-by-default:
-- the Worker's WHATSAPP_AUTOMATIONS_ENABLED, each reminder's `enabled`, and each
-- yacht's opt-in for that reminder. The log guarantees one message per person
-- per document per stage, however often the job runs.

create table if not exists public.wa_automations (
  id uuid primary key default gen_random_uuid(),
  kind text not null unique check (kind in ('crew_visa', 'crew_passport', 'vessel_permit')),
  name text not null,
  description text,
  template_id uuid references public.wa_templates(id) on delete set null,
  -- One entry per template placeholder: {"field": "<key>"} or {"text": "<fixed>"}.
  variable_map jsonb not null default '[]'::jsonb check (jsonb_typeof(variable_map) = 'array'),
  days_before int[] not null default '{30,14,7}',
  enabled boolean not null default false,
  options jsonb not null default '{}'::jsonb,
  last_run_at timestamptz,
  last_run_summary jsonb,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (cardinality(days_before) between 1 and 6 and 0 <= all(days_before) and 365 >= all(days_before))
);

create table if not exists public.wa_automation_vessels (
  automation_id uuid not null references public.wa_automations(id) on delete cascade,
  yacht_id uuid not null references public.yachts(id) on delete cascade,
  enabled boolean not null default false,
  updated_by uuid,
  updated_at timestamptz not null default now(),
  primary key (automation_id, yacht_id)
);

create table if not exists public.wa_automation_log (
  id uuid primary key default gen_random_uuid(),
  automation_id uuid not null references public.wa_automations(id) on delete cascade,
  source_id text not null,
  threshold int not null,
  contact_id uuid not null references public.wa_contacts(id) on delete cascade,
  yacht_id uuid references public.yachts(id) on delete set null,
  expiry_date date,
  message_id uuid references public.wa_messages(id) on delete set null,
  status text not null check (status in ('sent', 'failed')),
  detail text,
  created_at timestamptz not null default now(),
  unique (automation_id, source_id, threshold, contact_id)
);
create index if not exists wa_automation_log_recent_idx on public.wa_automation_log (automation_id, created_at desc);

drop trigger if exists wa_automations_updated on public.wa_automations;
create trigger wa_automations_updated before update on public.wa_automations
  for each row execute function public.set_updated_at();
drop trigger if exists wa_automation_vessels_updated on public.wa_automation_vessels;
create trigger wa_automation_vessels_updated before update on public.wa_automation_vessels
  for each row execute function public.set_updated_at();

insert into public.wa_automations (kind, name, description) values
  ('crew_visa', 'Crew visa expiry', 'Reminds the vessel''s contacts before a crew member''s UAE visa expires. Approved visas only; skipped once a newer visa exists.'),
  ('crew_passport', 'Crew passport expiry', 'Reminds the vessel''s contacts before a crew member''s passport expires. Passport numbers are never included.'),
  ('vessel_permit', 'Vessel permit expiry', 'Reminds the vessel''s contacts before an active permit expires (gate pass, sanitation, DMA, cruising, TDRA, …). Skipped once a newer permit of the same type exists.')
on conflict (kind) do nothing;

alter table public.wa_automations enable row level security;
alter table public.wa_automation_vessels enable row level security;
alter table public.wa_automation_log enable row level security;

do $$
declare t text;
begin
  foreach t in array array['wa_automations', 'wa_automation_vessels', 'wa_automation_log'] loop
    execute format('drop policy if exists "communications view" on public.%I', t);
    execute format('create policy "communications view" on public.%I for select to authenticated
       using ((select public.has_module_permission(auth.uid(), ''communications'', ''view''))
              and not (select public.is_portal_captain()))', t);
  end loop;
  foreach t in array array['wa_automations', 'wa_automation_vessels'] loop
    execute format('drop policy if exists "communications update" on public.%I', t);
    execute format('create policy "communications update" on public.%I for update to authenticated
       using ((select public.has_module_permission(auth.uid(), ''communications'', ''edit''))
              and not (select public.is_portal_captain()))
       with check ((select public.has_module_permission(auth.uid(), ''communications'', ''edit''))
                   and not (select public.is_portal_captain()))', t);
  end loop;
end $$;

drop policy if exists "communications insert" on public.wa_automation_vessels;
create policy "communications insert" on public.wa_automation_vessels for insert to authenticated
  with check ((select public.has_module_permission(auth.uid(), 'communications', 'edit'))
              and not (select public.is_portal_captain()));

-- The reminder kinds are fixed; staff change settings, not rows. The log is server-written.
revoke all on public.wa_automations, public.wa_automation_vessels, public.wa_automation_log from anon;
revoke insert, delete on public.wa_automations from authenticated;
revoke delete on public.wa_automation_vessels from authenticated;
revoke insert, update, delete on public.wa_automation_log from authenticated;
grant select on public.wa_automations, public.wa_automation_vessels, public.wa_automation_log to authenticated;
grant update (template_id, variable_map, days_before, enabled, options, updated_by) on public.wa_automations to authenticated;
grant insert, update on public.wa_automation_vessels to authenticated;

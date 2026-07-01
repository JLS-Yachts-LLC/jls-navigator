-- Migration 077: Automation engine essentials (FRS §14)
-- Auto-starts the candidate_recruitment workflow the moment an application
-- is created — "Application Received" begins without a manual step — plus
-- resolver functions for certificate-expiry and inactive-candidate reminders
-- that a UI widget or a future automation flow can read from.
--
-- The original zip also queued a candidate-facing "application acknowledged"
-- notification via a new recruitment_notifications table with a staff_id
-- recipient. Not built here: there is no "assigned consultant" concept on
-- crew_vacancies/placement_applications yet, so there's no real recipient to
-- notify — inventing one would be fabricated behavior, not a genuine
-- automation. The real public.notifications table (already used elsewhere,
-- e.g. propagate_crew_movement) is the right vehicle for that once an
-- assignment concept exists; this migration only wires the workflow side,
-- which needs no recipient.

create or replace function public.handle_new_placement_application()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.start_placement_workflow('application', new.id, 'candidate_recruitment');
  perform public.advance_placement_step('application', new.id, 'application_received', 'completed', null);

  return new;
end;
$$;

revoke all on function public.handle_new_placement_application() from public, anon, authenticated;

drop trigger if exists trg_handle_new_placement_application on public.placement_applications;
create trigger trg_handle_new_placement_application
  after insert on public.placement_applications
  for each row execute function public.handle_new_placement_application();

-- Resolver: candidate certifications expiring within N days.
create or replace function public.get_expiring_placement_certificates(p_days_ahead int default 60)
returns table (
  candidate_id uuid,
  candidate_name text,
  certification_type text,
  expiry_date date,
  days_remaining int
)
language sql
security invoker
stable
as $$
  select
    cp.id, cp.full_name, pcc.certification_type, pcc.expiry_date,
    (pcc.expiry_date - current_date)::int
  from public.placement_candidate_certifications pcc
  join public.placement_candidates cp on cp.id = pcc.candidate_id
  where pcc.expiry_date is not null
    and pcc.expiry_date <= current_date + p_days_ahead
    and pcc.expiry_date >= current_date
  order by pcc.expiry_date asc;
$$;

-- Resolver: candidates with no CRM interaction logged in the last N days —
-- "inactive candidate" reminder source per FRS §14.
create or replace function public.get_inactive_placement_candidates(p_days int default 30)
returns table (candidate_id uuid, candidate_name text, last_activity timestamptz)
language sql
security invoker
stable
as $$
  select cp.id, cp.full_name, last_activity.ts
  from public.placement_candidates cp
  left join lateral (
    select max(occurred_at) as ts
    from public.placement_crm_interactions
    where entity_type = 'candidate' and entity_id = cp.id
  ) last_activity on true
  where cp.is_active
    and (last_activity.ts is null or last_activity.ts < now() - (p_days || ' days')::interval);
$$;

revoke all on function public.get_expiring_placement_certificates(int) from public, anon;
revoke all on function public.get_inactive_placement_candidates(int) from public, anon;
grant execute on function public.get_expiring_placement_certificates(int) to authenticated;
grant execute on function public.get_inactive_placement_candidates(int) to authenticated;

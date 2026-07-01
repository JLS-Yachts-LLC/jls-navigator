-- Migration 078: Dashboard & reporting resolver views (FRS §3, §16)
-- Retargeted onto the real tables from migrations 069-072/065. Sole source
-- for every dashboard widget — UI must read these, not the underlying
-- tables directly, per the established Polaris rule.
--
-- security_invoker = true is set on every view immediately (not as a
-- follow-up fix) — lesson learned from v_inward_clearance_active earlier
-- this session, where omitting it let a view silently bypass the RLS of
-- its underlying tables.

create or replace view public.v_recruitment_dashboard as
select
  (select count(*) from public.placement_applications where applied_at >= now() - interval '30 days') as new_applications_30d,
  (select count(*) from public.placement_candidates where is_active) as active_candidates,
  (select count(*) from public.placement_interviews where status = 'scheduled' and scheduled_at >= now()) as interviews_scheduled,
  (select count(*) from public.placement_applications where status = 'offered') as offers_pending,
  (select count(*) from public.placement_records where status in ('joined', 'in_followup', 'completed')
     and created_at >= date_trunc('month', now())) as placements_this_month;
alter view public.v_recruitment_dashboard set (security_invoker = true);

create or replace view public.v_vacancy_dashboard as
select
  (select count(*) from public.crew_vacancies where status in ('open', 'shortlisting', 'interviewing', 'offer_made')) as open_positions,
  (select count(*) from public.crew_vacancies where status = 'open' and start_date <= now() + interval '14 days') as urgent_vacancies,
  (select count(*) from public.crew_vacancies where created_at >= now() - interval '7 days') as new_requests,
  (select count(*) from public.crew_vacancies where status = 'filled' and created_at >= date_trunc('month', now())) as positions_filled,
  (select count(*) from public.crew_vacancies where status = 'open' and start_date < now()) as expired_vacancies;
alter view public.v_vacancy_dashboard set (security_invoker = true);

create or replace view public.v_candidate_status_summary as
select
  count(*) filter (where ja.status is null or ja.status = 'submitted') as available,
  count(*) filter (where ja.status = 'interviewing') as interviewing,
  count(*) filter (where ja.status = 'offered') as offered,
  count(*) filter (where pr.status in ('joined', 'in_followup', 'completed')) as placed,
  count(*) filter (where not cp.is_active) as unavailable
from public.placement_candidates cp
left join public.placement_applications ja on ja.candidate_id = cp.id
left join public.placement_records pr on pr.candidate_id = cp.id;
alter view public.v_candidate_status_summary set (security_invoker = true);

create or replace view public.v_client_activity as
select
  (select count(*) from public.organisations where type = 'client' and active) as active_clients,
  (select count(*) from public.crew_placement_client_profiles cpp
     join public.organisations o on o.org_id = cpp.org_id
     where cpp.is_repeat_client and o.type = 'client') as repeat_clients,
  (select count(*) from public.organisations where type = 'client' and created_at >= now() - interval '30 days') as new_clients,
  (select count(*) from public.crew_vacancies where client_org_id is not null and status in ('open', 'shortlisting')) as vacancies_awaiting_candidates;
alter view public.v_client_activity set (security_invoker = true);

create or replace view public.v_recruitment_kpis as
select
  round(
    100.0 * (select count(*) from public.placement_records where status in ('joined', 'in_followup', 'completed'))
    / greatest((select count(*) from public.placement_applications), 1), 1
  ) as placement_success_rate_pct,
  (
    select round(avg(extract(epoch from (pr.joining_confirmed_at - cv.created_at)) / 86400.0), 1)
    from public.placement_records pr join public.crew_vacancies cv on cv.id = pr.vacancy_id
    where pr.joining_confirmed_at is not null
  ) as avg_time_to_fill_days,
  round(
    100.0 * (select count(*) from public.placement_interviews where recommendation = 'proceed')
    / greatest((select count(*) from public.placement_interviews where status = 'completed'), 1), 1
  ) as interview_conversion_pct;
alter view public.v_recruitment_kpis set (security_invoker = true);

create or replace view public.v_revenue_by_client as
select o.org_id as client_id, o.name as company_name,
  count(pr.id) as placements, sum(coalesce(pr.recruitment_fee, 0)) as total_recruitment_fees
from public.organisations o
left join public.placement_records pr on pr.client_org_id = o.org_id and pr.status in ('joined', 'in_followup', 'completed')
where o.type = 'client'
group by o.org_id, o.name;
alter view public.v_revenue_by_client set (security_invoker = true);

create or replace view public.v_consultant_performance as
select
  pws.completed_by as consultant_id,
  count(*) filter (where wsd.code = 'placement' and pws.status = 'completed') as placements_closed
from public.placement_workflow_steps pws
join public.workflow_step_definitions wsd on wsd.id = pws.step_definition_id
where pws.entity_type = 'application'
group by pws.completed_by;
alter view public.v_consultant_performance set (security_invoker = true);

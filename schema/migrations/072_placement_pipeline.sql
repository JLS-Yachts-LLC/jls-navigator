-- Migration 072: Recruitment pipeline (FRS §5, §10, §11, §12)
-- This is the one genuinely new part of the rebuild — nothing in the real
-- schema currently tracks "candidate X applied to vacancy Y" as a distinct
-- process with its own lifecycle before someone becomes a placed_crew row.
--
-- Reuses workflow_definitions / workflow_step_definitions (built for the
-- Agency Module, migration 060) exactly as the original zip intended — same
-- generic config tables, a new generic instance table scoped by
-- entity_type/entity_id so Crew Placement doesn't need one instance table
-- per workflow.

-- 1. Applications — a candidate applying/being considered for a vacancy.
create table if not exists public.placement_applications (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.placement_candidates(id) on delete cascade,
  vacancy_id uuid not null references public.crew_vacancies(id) on delete cascade,
  status text not null default 'submitted' check (status in (
    'submitted', 'in_review', 'shortlisted', 'interviewing', 'offered',
    'placed', 'rejected', 'withdrawn'
  )),
  applied_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (candidate_id, vacancy_id)
);

create index if not exists idx_placement_applications_candidate on public.placement_applications (candidate_id);
create index if not exists idx_placement_applications_vacancy on public.placement_applications (vacancy_id);

-- 2. Interviews (FRS §11)
create table if not exists public.placement_interviews (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.placement_applications(id) on delete cascade,
  interview_type text not null check (interview_type in (
    'internal', 'captain', 'owner', 'technical_assessment', 'practical_trial'
  )),
  scheduled_at timestamptz,
  location text,
  status text not null default 'scheduled' check (status in (
    'scheduled', 'completed', 'no_show', 'cancelled', 'rescheduled'
  )),
  feedback text,
  rating int check (rating between 1 and 5),
  recommendation text check (recommendation in ('proceed', 'hold', 'reject')),
  interviewer_name text,
  created_by uuid references public.user_profiles(user_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_placement_interviews_updated_at on public.placement_interviews;
create trigger trg_placement_interviews_updated_at
  before update on public.placement_interviews
  for each row execute function public.set_updated_at();

create index if not exists idx_placement_interviews_application on public.placement_interviews (application_id);

-- 3. Placement records (FRS §12) — the 8-stage lifecycle once an offer is
-- accepted. placed_crew_id is populated once the candidate is actually
-- onboarded, bridging the pre-placement pipeline to the real active roster.
create table if not exists public.placement_records (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.placement_applications(id),
  candidate_id uuid not null references public.placement_candidates(id),
  vacancy_id uuid not null references public.crew_vacancies(id),
  client_org_id uuid references public.organisations(org_id),
  placed_crew_id uuid references public.placed_crew(id),

  contract_signed_at timestamptz,
  joining_confirmed_at timestamptz,
  start_date date,
  followup_30_day_completed_at timestamptz,
  followup_30_day_notes text,
  review_90_day_completed_at timestamptz,
  review_90_day_notes text,

  status text not null default 'offer_accepted' check (status in (
    'offer_accepted', 'contract_signed', 'pre_joining', 'joined', 'in_followup', 'completed', 'terminated_early'
  )),

  -- Finance stub (FRS §17) — no QuickBooks call, same caution as the Agency
  -- Module's finance_status stub.
  invoice_status text not null default 'not_invoiced'
    check (invoice_status in ('not_invoiced', 'invoiced', 'paid', 'refund_requested', 'refunded')),
  recruitment_fee numeric(10,2),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (application_id)
);

drop trigger if exists trg_placement_records_updated_at on public.placement_records;
create trigger trg_placement_records_updated_at
  before update on public.placement_records
  for each row execute function public.set_updated_at();

create index if not exists idx_placement_records_candidate on public.placement_records (candidate_id);
create index if not exists idx_placement_records_client on public.placement_records (client_org_id);
create index if not exists idx_placement_records_placed_crew on public.placement_records (placed_crew_id);

-- 4. Generic workflow instance table, reusing workflow_definitions /
-- workflow_step_definitions from migration 060 (Agency Module).
create table if not exists public.placement_workflow_steps (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('application', 'vacancy', 'placement')),
  entity_id uuid not null,
  workflow_definition_id uuid not null references public.workflow_definitions(id),
  step_definition_id uuid not null references public.workflow_step_definitions(id),
  status text not null default 'pending' check (status in (
    'pending', 'in_progress', 'completed', 'rejected', 'skipped'
  )),
  notes text,
  completed_by uuid references public.user_profiles(user_id),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (entity_type, entity_id, step_definition_id)
);

create index if not exists idx_placement_workflow_steps_entity
  on public.placement_workflow_steps (entity_type, entity_id, workflow_definition_id);

-- Seed: Candidate Recruitment workflow (FRS §5), tracked per application.
insert into public.workflow_definitions (code, label)
values ('candidate_recruitment', 'Candidate Recruitment Workflow')
on conflict (code) do nothing;

with wf as (select id from public.workflow_definitions where code = 'candidate_recruitment')
insert into public.workflow_step_definitions (workflow_definition_id, code, label, sort_order)
select wf.id, v.code, v.label, v.sort_order
from wf, (values
  ('application_received', 'Application Received', 10),
  ('profile_created', 'Profile Created', 20),
  ('cv_review', 'CV Review', 30),
  ('screening_interview', 'Screening Interview', 40),
  ('shortlisted', 'Shortlisted', 50),
  ('presented_to_client', 'Presented to Client', 60),
  ('client_interview', 'Client Interview', 70),
  ('offer', 'Offer', 80),
  ('placement', 'Placement', 90),
  ('post_placement_followup', 'Post Placement Follow-up', 100),
  ('completed', 'Completed', 110)
) as v(code, label, sort_order)
on conflict (workflow_definition_id, code) do nothing;

-- Seed: Job Request workflow (FRS §10), tracked per vacancy.
insert into public.workflow_definitions (code, label)
values ('job_request', 'Job Request Workflow')
on conflict (code) do nothing;

with wf as (select id from public.workflow_definitions where code = 'job_request')
insert into public.workflow_step_definitions (workflow_definition_id, code, label, sort_order)
select wf.id, v.code, v.label, v.sort_order
from wf, (values
  ('client_request', 'Client Request', 10),
  ('requirements_review', 'Requirements Review', 20),
  ('vacancy_created', 'Vacancy Created', 30),
  ('candidate_search', 'Candidate Search', 40),
  ('shortlist', 'Shortlist', 50),
  ('client_interview', 'Client Interview', 60),
  ('offer', 'Offer', 70),
  ('placement', 'Placement', 80),
  ('close_vacancy', 'Close Vacancy', 90)
) as v(code, label, sort_order)
on conflict (workflow_definition_id, code) do nothing;

-- Seed: Placement Management workflow (FRS §12), tracked per placement record.
insert into public.workflow_definitions (code, label)
values ('placement_management', 'Placement Management Workflow')
on conflict (code) do nothing;

with wf as (select id from public.workflow_definitions where code = 'placement_management')
insert into public.workflow_step_definitions (workflow_definition_id, code, label, sort_order)
select wf.id, v.code, v.label, v.sort_order
from wf, (values
  ('offer_accepted', 'Offer Accepted', 10),
  ('contract_signed', 'Contract Signed', 20),
  ('pre_joining_checklist', 'Pre-Joining Checklist', 30),
  ('joining_confirmed', 'Joining Confirmed', 40),
  ('start_date', 'Start Date', 50),
  ('followup_30_day', '30-Day Follow-up', 60),
  ('review_90_day', '90-Day Review', 70),
  ('placement_complete', 'Placement Complete', 80)
) as v(code, label, sort_order)
on conflict (workflow_definition_id, code) do nothing;

alter table public.placement_applications enable row level security;
alter table public.placement_interviews enable row level security;
alter table public.placement_records enable row level security;
alter table public.placement_workflow_steps enable row level security;

create policy placement_applications_select on public.placement_applications
  for select using (auth.role() = 'authenticated');
create policy placement_interviews_select on public.placement_interviews
  for select using (auth.role() = 'authenticated');
create policy placement_records_select on public.placement_records
  for select using (auth.role() = 'authenticated');
create policy placement_workflow_steps_select on public.placement_workflow_steps
  for select using (auth.role() = 'authenticated');

-- No direct write policy on any of the four — mutation via SECURITY DEFINER
-- functions in migration 075.

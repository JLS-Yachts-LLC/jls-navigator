-- Migration 069: Candidate profile completion (FRS §4) + document store
-- Extends the real, already-live public.placement_candidates table (used by
-- the legacy /crew-placement ResourcePage) rather than a fictional
-- candidate_profiles table — see POLARIS plan doc for why. New child tables
-- cover employment/sea-service history, certifications, and a
-- version-controlled document store, none of which currently exist for
-- pre-placement candidates (crew_placement_certs/documents are scoped to
-- placed_crew only).

alter table public.placement_candidates
  add column if not exists preferred_name text,
  add column if not exists current_location text,
  add column if not exists languages text[],
  add column if not exists notice_period text,
  add column if not exists desired_position text,
  add column if not exists salary_expectation_min numeric(10,2),
  add column if not exists salary_expectation_max numeric(10,2),
  add column if not exists salary_currency text default 'USD',
  add column if not exists previous_salary numeric(10,2),
  add column if not exists commercial_experience boolean not null default false,
  add column if not exists private_yacht_experience boolean not null default false,
  add column if not exists reference_status text not null default 'not_requested'
    check (reference_status in ('not_requested', 'requested', 'received', 'verified', 'flagged')),
  add column if not exists is_active boolean not null default true;

comment on column public.placement_candidates.languages is
  'Free-form language list. A controlled-vocabulary languages table is a
   future refinement if matching/filtering on it becomes a priority.';
comment on column public.placement_candidates.is_active is
  'Whether this candidate is still an active prospect. Drives dashboard
   counts and get_inactive_placement_candidates() — set false rather than
   deleting a candidate record.';

-- Employment / sea-service history (FRS §4: Captain, Management Company,
-- Reason for Leaving, Reference Status per role, plus vessel size/type used
-- by the matching function in migration 076).
create table if not exists public.placement_candidate_experience (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.placement_candidates(id) on delete cascade,
  vessel_name text,
  rank_held text,
  start_date date,
  end_date date,
  captain_name text,
  management_company text,
  reason_for_leaving text,
  reference_status text not null default 'not_requested'
    check (reference_status in ('not_requested', 'requested', 'received', 'verified', 'flagged')),
  vessel_loa_m numeric(6,2),
  vessel_type text,
  created_at timestamptz not null default now()
);

create index if not exists idx_placement_candidate_experience_candidate
  on public.placement_candidate_experience (candidate_id);

-- Certifications (STCW etc.) for candidates not yet placed — distinct from
-- crew_placement_certs, which only exists once someone is in placed_crew.
create table if not exists public.placement_candidate_certifications (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.placement_candidates(id) on delete cascade,
  certification_type text not null,
  issuing_body text,
  expiry_date date,
  created_at timestamptz not null default now()
);

create index if not exists idx_placement_candidate_certifications_candidate
  on public.placement_candidate_certifications (candidate_id);
create index if not exists idx_placement_candidate_certifications_expiry
  on public.placement_candidate_certifications (expiry_date);

-- Version-controlled document store for everything FRS §4 lists beyond the
-- CV itself: certificates, references, employment contracts, performance
-- reviews, interview notes. Mirrors the same pattern used for Port Calls
-- (port_call_documents) and the CV/passport document stores elsewhere.
create table if not exists public.placement_candidate_documents (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.placement_candidates(id) on delete cascade,
  document_type text not null check (document_type in (
    'cv', 'certificate', 'reference', 'employment_contract',
    'performance_review', 'interview_notes', 'other'
  )),
  title text not null,
  current_version int not null default 1,
  created_at timestamptz not null default now()
);

create table if not exists public.placement_candidate_document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.placement_candidate_documents(id) on delete cascade,
  version int not null,
  file_path text not null,
  uploaded_by uuid references public.user_profiles(user_id),
  uploaded_at timestamptz not null default now(),
  unique (document_id, version)
);

create index if not exists idx_placement_candidate_documents_candidate
  on public.placement_candidate_documents (candidate_id, document_type);
create index if not exists idx_placement_candidate_document_versions_document
  on public.placement_candidate_document_versions (document_id);

alter table public.placement_candidate_experience enable row level security;
alter table public.placement_candidate_certifications enable row level security;
alter table public.placement_candidate_documents enable row level security;
alter table public.placement_candidate_document_versions enable row level security;

-- Permissive placeholder for this slice (same pattern as the Port Calls
-- build) — any authenticated user may read; write only via SECURITY
-- DEFINER functions in migration 075. Finer-grained masking (salary
-- visibility) is handled specifically by v_candidate_profiles_masked in
-- migration 074, not by broadening these policies.
create policy placement_candidate_experience_select on public.placement_candidate_experience
  for select using (auth.role() = 'authenticated');
create policy placement_candidate_certifications_select on public.placement_candidate_certifications
  for select using (auth.role() = 'authenticated');
create policy placement_candidate_documents_select on public.placement_candidate_documents
  for select using (auth.role() = 'authenticated');
create policy placement_candidate_document_versions_select on public.placement_candidate_document_versions
  for select using (auth.role() = 'authenticated');

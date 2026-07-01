-- Migration 073: Reference management (FRS §13) + Recruitment CRM (FRS §8)

create table if not exists public.placement_candidate_references (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.placement_candidates(id) on delete cascade,
  experience_id uuid references public.placement_candidate_experience(id), -- optional link to the specific role this reference covers
  reference_type text not null check (reference_type in (
    'professional', 'character', 'captain', 'agency'
  )),
  referee_name text not null,
  referee_email text,
  referee_phone text,

  request_status text not null default 'not_requested' check (request_status in (
    'not_requested', 'requested', 'received', 'declined', 'unreachable'
  )),
  requested_at timestamptz,
  response_text text,
  responded_at timestamptz,
  rating int check (rating between 1 and 5),

  requested_by uuid references public.user_profiles(user_id),
  created_at timestamptz not null default now()
);

create index if not exists idx_placement_candidate_references_candidate
  on public.placement_candidate_references (candidate_id);

-- One polymorphic table for both candidate and client interactions so a
-- single timeline view can read one source ordered by occurred_at.
create table if not exists public.placement_crm_interactions (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('candidate', 'client')),
  entity_id uuid not null, -- placement_candidates.id when entity_type='candidate', organisations.org_id when 'client'
  channel text not null check (channel in (
    'phone_call', 'email', 'whatsapp', 'teams', 'meeting', 'interview_note', 'internal_note'
  )),
  direction text check (direction in ('inbound', 'outbound', 'internal')),
  summary text not null,
  occurred_at timestamptz not null default now(),
  logged_by uuid references public.user_profiles(user_id),
  created_at timestamptz not null default now()
);

create index if not exists idx_placement_crm_interactions_entity
  on public.placement_crm_interactions (entity_type, entity_id, occurred_at desc);

comment on table public.placement_crm_interactions is
  'FRS §8 timeline view source. Email/Teams/WhatsApp entries would be
   populated by a future Communications integration (n8n flow) — this
   migration only provides the storage shape; phone calls, meetings, and
   internal notes are logged manually by consultants in the meantime.';

alter table public.placement_candidate_references enable row level security;
alter table public.placement_crm_interactions enable row level security;

create policy placement_candidate_references_select on public.placement_candidate_references
  for select using (auth.role() = 'authenticated');
create policy placement_crm_interactions_select on public.placement_crm_interactions
  for select using (auth.role() = 'authenticated');

-- No direct write policy on either — mutation via request_reference /
-- record_reference_response / log_crm_interaction in migration 075.

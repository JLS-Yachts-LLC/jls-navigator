-- Migration 070: Vacancy management completion (FRS §6)
-- Extends the real, already-live public.crew_vacancies table (used by the
-- New View's Crew Placement > Vacancies & Pool tab) rather than a fictional
-- job_listings table. Confirmed before writing: crew_vacancies has 0 rows
-- and no existing check constraint on `status`, so the expanded enum below
-- is a clean add with no backfill risk (unlike the original zip's warning
-- about live data).

alter table public.crew_vacancies
  add column if not exists client_org_id uuid references public.organisations(org_id),
  add column if not exists rotation text,
  add column if not exists leave_pattern text,
  add column if not exists experience_required text,
  add column if not exists qualifications_required text[],
  add column if not exists nationality_preferences text[],
  add column if not exists languages_required text[];

comment on column public.crew_vacancies.nationality_preferences is
  'FRS §6 explicitly scopes this to "where legally permitted" — surface a
   compliance warning in the UI whenever this field is populated, and
   confirm with legal/HR before this field goes live for any country where
   nationality-based filtering could be discriminatory (ticket carried over
   from the original spec, not yet actioned). Storing the field does not
   imply it should be used unfiltered in search/filter UI.';

alter table public.crew_vacancies add constraint crew_vacancies_status_check
  check (status in ('draft', 'open', 'shortlisting', 'interviewing', 'offer_made', 'filled', 'cancelled'));
alter table public.crew_vacancies alter column status set default 'draft';

create index if not exists idx_crew_vacancies_client_org on public.crew_vacancies (client_org_id);

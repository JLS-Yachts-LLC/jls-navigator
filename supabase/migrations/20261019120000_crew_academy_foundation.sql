-- ════════════════════════════════════════════════════════════════════════════
-- Crew Academy — foundation (Phase 1 of POLARIS_CREW_ACADEMY.md).
--
-- Online training for yacht crew. JLS writes a library of courses and offers
-- them to vessels; each vessel can also write its own. Crew ("learners") get a
-- login that reaches their own training and nothing else.
--
-- Named `academy_*` so it never mixes with the `training_*` tables, which belong
-- to JLS's classroom training school and to crew certificates.
--
-- How a learner is kept away from everything else (same model as guests):
--
--   1. is_portal_captain() / assert_not_portal_captain() — despite the name,
--      "an outside (non-staff) login" — now also say yes for an active learner.
--      Every restrictive portal_captain_denied / portal_captain_block policy and
--      every guarded RPC then refuses learners. A learner is not in
--      captain_accounts, so captain_yacht_ids() is empty for them and even the
--      tables the captain portal reads (yachts, crew, permits, visas) give 0 rows.
--      KEEP ALL THREE (captain, guest, learner) whenever these are recreated.
--   2. The auth.users triggers stand down for portal = 'learner', so a learner is
--      never born as staff (storage treats "has a user_profiles row" as staff).
--   3. No academy table has a permissive policy at all. Learners, vessel
--      managers AND JLS staff reach Academy data only through /api/academy*
--      routes (service role), which apply the vessel-privacy and sharing rules
--      in one place: a vessel's courses, crew and results are private to the
--      vessel unless the vessel or the crew member shares them with JLS.
--
-- Decisions (19 Oct 2026): records stay with the vessel (a learner row is one
-- person on one vessel; moving yacht = a fresh row there); private to the vessel
-- unless shared (academy_jls_shares); its own portal module ('academy'); video
-- is MP4 in Supabase storage (bucket added with uploads in Phase 2).
-- ════════════════════════════════════════════════════════════════════════════

-- ── Learners: one person on one vessel ──────────────────────────────────────
create table if not exists public.academy_learners (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references auth.users(id) on delete set null,
  yacht_id        uuid not null references public.yachts(id) on delete cascade,
  crew_member_id  uuid references public.crew_members(id) on delete set null,
  email           text not null,
  display_name    text,
  active          boolean not null default true,
  invited_by      uuid,
  invited_by_name text,
  invite_sent_at  timestamptz,
  invite_error    text,
  last_seen_at    timestamptz,
  left_at         timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
-- One row per person per vessel: coming back to a vessel reactivates the old row
-- (and its history); joining another vessel is a new row there.
create unique index if not exists academy_learners_vessel_email_key
  on public.academy_learners (yacht_id, lower(email));
-- A login is a learner on at most one vessel at a time.
create unique index if not exists academy_learners_active_user_key
  on public.academy_learners (user_id) where active and user_id is not null;
create index if not exists academy_learners_crew_idx on public.academy_learners (crew_member_id);

-- ── Courses ─────────────────────────────────────────────────────────────────
create table if not exists public.academy_courses (
  id                 uuid primary key default gen_random_uuid(),
  owner_type         text not null check (owner_type in ('jls', 'vessel')),
  yacht_id           uuid references public.yachts(id) on delete cascade,
  title              text not null,
  summary            text,
  category           text,
  cover_path         text,
  estimated_minutes  integer check (estimated_minutes is null or estimated_minutes > 0),
  pass_mark          integer not null default 80 check (pass_mark between 0 and 100),
  refresh_months     integer check (refresh_months is null or refresh_months > 0),
  status             text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  -- The course being edited. Publishing snapshots it into academy_course_versions.
  draft_content      jsonb not null default '{}'::jsonb,
  current_version_id uuid,
  -- JLS courses only: offered to every vessel (otherwise academy_course_offers).
  offer_all          boolean not null default false,
  created_by         uuid,
  created_by_name    text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint academy_courses_owner check ((owner_type = 'jls') = (yacht_id is null)),
  constraint academy_courses_offer_all_jls check (not offer_all or owner_type = 'jls')
);
create index if not exists academy_courses_yacht_idx on public.academy_courses (yacht_id);

-- An immutable snapshot of a course as published. Enrolments pin the version
-- they started on, so editing a live course never changes what someone already
-- passed, and every result traces to the exact material (and answer key) used.
create table if not exists public.academy_course_versions (
  id                uuid primary key default gen_random_uuid(),
  course_id         uuid not null references public.academy_courses(id) on delete cascade,
  version           integer not null,
  content           jsonb not null,
  published_by      uuid,
  published_by_name text,
  published_at      timestamptz not null default now(),
  unique (course_id, version)
);
do $$ begin
  alter table public.academy_courses
    add constraint academy_courses_current_version_fkey
    foreign key (current_version_id) references public.academy_course_versions(id) on delete set null;
exception when duplicate_object then null; end $$;

-- Vessels a JLS course is offered to (when offer_all is false).
create table if not exists public.academy_course_offers (
  course_id      uuid not null references public.academy_courses(id) on delete cascade,
  yacht_id       uuid not null references public.yachts(id) on delete cascade,
  offered_by     uuid,
  offered_by_name text,
  offered_at     timestamptz not null default now(),
  primary key (course_id, yacht_id)
);
create index if not exists academy_course_offers_yacht_idx on public.academy_course_offers (yacht_id);

-- Uploaded course files (video, images, PDFs). Private bucket, signed URLs.
create table if not exists public.academy_media (
  id           uuid primary key default gen_random_uuid(),
  owner_type   text not null check (owner_type in ('jls', 'vessel')),
  yacht_id     uuid references public.yachts(id) on delete cascade,
  course_id    uuid references public.academy_courses(id) on delete set null,
  kind         text not null check (kind in ('video', 'image', 'document')),
  storage_path text not null,
  file_name    text not null,
  mime_type    text,
  size_bytes   bigint,
  uploaded_by  uuid,
  uploaded_by_name text,
  created_at   timestamptz not null default now(),
  constraint academy_media_owner check ((owner_type = 'jls') = (yacht_id is null))
);
create index if not exists academy_media_course_idx on public.academy_media (course_id);

-- ── Groups (departments on board) ───────────────────────────────────────────
create table if not exists public.academy_groups (
  id          uuid primary key default gen_random_uuid(),
  yacht_id    uuid not null references public.yachts(id) on delete cascade,
  name        text not null,
  description text,
  sort_order  integer not null default 0,
  created_by  uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index if not exists academy_groups_vessel_name_key on public.academy_groups (yacht_id, lower(name));

create table if not exists public.academy_group_members (
  group_id   uuid not null references public.academy_groups(id) on delete cascade,
  learner_id uuid not null references public.academy_learners(id) on delete cascade,
  added_by   uuid,
  added_at   timestamptz not null default now(),
  primary key (group_id, learner_id)
);
create index if not exists academy_group_members_learner_idx on public.academy_group_members (learner_id);

-- ── Enrolment ───────────────────────────────────────────────────────────────
-- A rule enrols a course to a group or one person on a vessel. A group rule is
-- live: someone who joins the group later is enrolled too. Revoking keeps the
-- row for history.
create table if not exists public.academy_enrolment_rules (
  id              uuid primary key default gen_random_uuid(),
  yacht_id        uuid not null references public.yachts(id) on delete cascade,
  course_id       uuid not null references public.academy_courses(id) on delete cascade,
  group_id        uuid references public.academy_groups(id) on delete cascade,
  learner_id      uuid references public.academy_learners(id) on delete cascade,
  mandatory       boolean not null default true,
  due_date        date,
  due_days        integer check (due_days is null or due_days > 0),
  created_by      uuid,
  created_by_name text,
  created_at      timestamptz not null default now(),
  revoked_at      timestamptz,
  revoked_by_name text,
  constraint academy_enrolment_rules_one_target check (num_nonnulls(group_id, learner_id) = 1)
);
create index if not exists academy_enrolment_rules_yacht_idx on public.academy_enrolment_rules (yacht_id) where revoked_at is null;
create index if not exists academy_enrolment_rules_group_idx on public.academy_enrolment_rules (group_id) where revoked_at is null;

-- One row per learner per course (per round: a refresher after expiry is a new row).
create table if not exists public.academy_enrolments (
  id           uuid primary key default gen_random_uuid(),
  learner_id   uuid not null references public.academy_learners(id) on delete cascade,
  course_id    uuid not null references public.academy_courses(id) on delete cascade,
  yacht_id     uuid not null references public.yachts(id) on delete cascade,
  rule_id      uuid references public.academy_enrolment_rules(id) on delete set null,
  version_id   uuid references public.academy_course_versions(id) on delete set null,
  status       text not null default 'not_started'
               check (status in ('not_started', 'in_progress', 'completed', 'failed', 'expired', 'cancelled')),
  mandatory    boolean not null default true,
  due_date     date,
  started_at   timestamptz,
  completed_at timestamptz,
  score        integer check (score is null or score between 0 and 100),
  attempts     integer not null default 0,
  expires_at   timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create unique index if not exists academy_enrolments_live_key
  on public.academy_enrolments (learner_id, course_id) where status not in ('expired', 'cancelled');
create index if not exists academy_enrolments_yacht_idx on public.academy_enrolments (yacht_id, status);
create index if not exists academy_enrolments_course_idx on public.academy_enrolments (course_id);

-- Per block (lesson part) progress: viewed, video watched, score.
create table if not exists public.academy_progress (
  enrolment_id  uuid not null references public.academy_enrolments(id) on delete cascade,
  block_id      text not null,
  lesson_id     text,
  viewed_at     timestamptz,
  completed_at  timestamptz,
  video_seconds numeric,
  video_percent integer check (video_percent is null or video_percent between 0 and 100),
  score         integer,
  data          jsonb,
  updated_at    timestamptz not null default now(),
  primary key (enrolment_id, block_id)
);

-- Every quiz / interactive submission, with the answers given.
create table if not exists public.academy_attempts (
  id           uuid primary key default gen_random_uuid(),
  enrolment_id uuid not null references public.academy_enrolments(id) on delete cascade,
  block_id     text,
  answers      jsonb not null,
  score        integer,
  max_score    integer,
  passed       boolean,
  submitted_at timestamptz not null default now()
);
create index if not exists academy_attempts_enrolment_idx on public.academy_attempts (enrolment_id, submitted_at desc);

create table if not exists public.academy_certificates (
  id                        uuid primary key default gen_random_uuid(),
  enrolment_id              uuid not null unique references public.academy_enrolments(id) on delete cascade,
  learner_id                uuid not null references public.academy_learners(id) on delete cascade,
  course_id                 uuid not null references public.academy_courses(id) on delete cascade,
  yacht_id                  uuid not null references public.yachts(id) on delete cascade,
  number                    text not null unique,
  issued_at                 timestamptz not null default now(),
  expires_at                timestamptz,
  pdf_path                  text,
  training_certification_id uuid
);

-- ── Sharing with JLS ────────────────────────────────────────────────────────
-- Private to the vessel unless shared: a course (by a vessel manager), a crew
-- member's results (by the vessel or the crew member), or one result.
create table if not exists public.academy_jls_shares (
  id              uuid primary key default gen_random_uuid(),
  yacht_id        uuid not null references public.yachts(id) on delete cascade,
  resource_type   text not null check (resource_type in ('course', 'learner', 'enrolment')),
  resource_id     uuid not null,
  shared_by_kind  text not null check (shared_by_kind in ('vessel', 'crew')),
  shared_by       uuid,
  shared_by_name  text,
  note            text,
  created_at      timestamptz not null default now(),
  revoked_at      timestamptz,
  revoked_by_name text
);
create unique index if not exists academy_jls_shares_live_key
  on public.academy_jls_shares (resource_type, resource_id) where revoked_at is null;
create index if not exists academy_jls_shares_yacht_idx on public.academy_jls_shares (yacht_id);

-- What happened: invites, enrolments, completions, shares.
create table if not exists public.academy_activity (
  id            uuid primary key default gen_random_uuid(),
  yacht_id      uuid references public.yachts(id) on delete cascade,
  learner_id    uuid references public.academy_learners(id) on delete set null,
  course_id     uuid references public.academy_courses(id) on delete set null,
  actor_user_id uuid,
  actor_name    text,
  action        text not null,
  detail        jsonb,
  created_at    timestamptz not null default now()
);
create index if not exists academy_activity_yacht_idx on public.academy_activity (yacht_id, created_at desc);

-- updated_at
do $$
declare t text;
begin
  foreach t in array array['academy_learners', 'academy_courses', 'academy_groups', 'academy_enrolments', 'academy_progress'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_touch', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.portal_touch_updated_at()', t || '_touch', t);
  end loop;
end $$;

-- ── Identity helpers ────────────────────────────────────────────────────────
create or replace function public.is_portal_learner()
returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from academy_learners where user_id = auth.uid() and active) $$;

-- "An outside (non-staff) login": a Client Portal captain, a guest or a learner.
create or replace function public.is_portal_captain()
returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from captain_accounts where user_id = auth.uid() and active)
       or exists (select 1 from guest_accounts   where user_id = auth.uid() and active)
       or exists (select 1 from academy_learners where user_id = auth.uid() and active) $$;

create or replace function public.assert_not_portal_captain()
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if exists (select 1 from captain_accounts where user_id = auth.uid() and active)
     or exists (select 1 from guest_accounts where user_id = auth.uid() and active)
     or exists (select 1 from academy_learners where user_id = auth.uid() and active) then
    raise exception 'This action is not available to portal accounts' using errcode = '42501';
  end if;
end $$;

-- A new auth user is a staff member unless it is tagged as an outside login.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $function$
begin
  if coalesce(new.raw_user_meta_data->>'portal', '') in ('captain', 'guest', 'learner') then
    return new;  -- client-portal, guest or crew-training login: not a staff member
  end if;
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));
  insert into public.user_roles (user_id, role) values (new.id, 'user');
  return new;
end; $function$;

create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = public as $function$
declare
  v_global_admin_role_id uuid;
  v_read_only_role_id uuid;
  v_legacy_role text;
begin
  if coalesce(new.raw_user_meta_data->>'portal', '') in ('captain', 'guest', 'learner') then
    return new;  -- client-portal, guest or crew-training login: not a staff member
  end if;
  select role_id into v_global_admin_role_id from public.roles where name = 'global_admin';
  select role_id into v_read_only_role_id from public.roles where name = 'read_only';
  select role into v_legacy_role from public.user_roles where user_id = new.id;
  insert into public.user_profiles (user_id, display_name, email, role_id, active, timezone)
  values (
    new.id,
    coalesce(nullif(trim(split_part(new.email, '@', 1)), ''), 'Unnamed user'),
    new.email,
    case when v_legacy_role = 'admin' then v_global_admin_role_id else v_read_only_role_id end,
    true,
    'Asia/Dubai'
  )
  on conflict (user_id) do nothing;
  return new;
end; $function$;

-- The apps ask this once after sign-in to send a learner to /academy.
revoke execute on function public.is_portal_learner() from public, anon;
grant execute on function public.is_portal_learner() to authenticated;

-- ── RLS: closed to every client login. All access is via /api/academy*. ─────
do $$
declare t text;
begin
  foreach t in array array[
    'academy_learners', 'academy_courses', 'academy_course_versions', 'academy_course_offers',
    'academy_media', 'academy_groups', 'academy_group_members', 'academy_enrolment_rules',
    'academy_enrolments', 'academy_progress', 'academy_attempts', 'academy_certificates',
    'academy_jls_shares', 'academy_activity'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists portal_captain_denied on public.%I', t);
    execute format($p$create policy portal_captain_denied on public.%I as restrictive for all to authenticated
      using ((select not public.is_portal_captain())) with check ((select not public.is_portal_captain()))$p$, t);
  end loop;
end $$;

-- ── The vessel's portal module, and the staff permission ────────────────────
alter table public.yacht_portal_modules drop constraint if exists yacht_portal_modules_module_check;
alter table public.yacht_portal_modules add constraint yacht_portal_modules_module_check
  check (module in ('core', 'management', 'academy'));

-- "Crew Academy" in each staff member's module permissions:
--   View   — see the JLS course library and anything vessels / crew have shared with JLS
--   Create — write and edit JLS courses
--   Edit   — also publish them and choose which vessels they're offered to
-- Global admins can do all of this without it.
insert into public.modules (name, display_name, active, icon)
select 'academy', 'Crew Academy', true, 'school'
where not exists (select 1 from public.modules where name = 'academy');

-- JLS Training — the training room's tablet (attendance sign-in, calendar, Google review).
--
-- The tablet is paired exactly like a Port Operations wall screen: it opens
-- /training-kiosk, is handed a secret key and shows a code that Training staff
-- enter in Polaris (Training Institute → Tablet). So it reuses wall_displays,
-- told apart by `kind`; /api/wall/* only ever touches 'port_ops' rows and
-- /api/training-kiosk/* only 'training' rows.
--
-- Attendance: a student taps today's session on the tablet and types their own
-- name and mobile. Nobody else's details are ever shown on the tablet; the
-- server quietly links the sign-in to the student's record (training_students)
-- when the mobile or the full name matches one, for staff to check.
--
-- Both tables are closed to anon AND authenticated (portal captains, guests and
-- academy learners are "authenticated" too): every read/write goes through
-- /api/training-kiosk/* with the service role, authorised by the tablet's key or
-- by a staff requireAccess check on the training module.

alter table public.wall_displays
  add column if not exists kind text not null default 'port_ops';
do $$ begin
  alter table public.wall_displays add constraint wall_displays_kind_check check (kind in ('port_ops', 'training'));
exception when duplicate_object then null; end $$;
create index if not exists wall_displays_kind_idx on public.wall_displays (kind, status);

create table if not exists public.training_attendance (
  id                uuid primary key default gen_random_uuid(),
  session_date      date not null,
  -- The Training Calendar entry signed in to. Kept as a snapshot below too, so
  -- deleting or renaming the calendar entry never loses the attendance.
  calendar_event_id uuid references public.training_calendar_events(id) on delete set null,
  session_title     text not null,
  session_time      text,
  session_category  text,
  -- What the student typed.
  full_name         text not null,
  name_key          text not null,
  mobile            text,
  -- The student's record, when the server could match one (set null if the
  -- Monday sync later removes that student).
  student_id        uuid references public.training_students(id) on delete set null,
  match_method      text check (match_method in ('mobile', 'name', 'staff')),
  source            text not null default 'kiosk' check (source in ('kiosk', 'staff')),
  display_id        uuid references public.wall_displays(id) on delete set null,
  recorded_by       uuid references auth.users(id) on delete set null,
  signed_in_at      timestamptz not null default now(),
  voided_at         timestamptz,
  voided_by         uuid references auth.users(id) on delete set null,
  void_reason       text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- One sign-in per person per session (a voided one doesn't block signing in again).
create unique index if not exists training_attendance_once
  on public.training_attendance (calendar_event_id, name_key) where voided_at is null and calendar_event_id is not null;
create index if not exists training_attendance_date_idx on public.training_attendance (session_date);
create index if not exists training_attendance_student_idx on public.training_attendance (student_id);

alter table public.training_attendance enable row level security;
revoke all on public.training_attendance from anon, authenticated;

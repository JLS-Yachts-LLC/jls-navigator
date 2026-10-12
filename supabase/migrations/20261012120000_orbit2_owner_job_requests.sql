-- Orbit 2 — Managed Boats: the owner's "Request Job" button in the Client
-- Portal (client request, 12 Oct 2026).
--
-- An owner's request becomes a Pending job on the boat's Jobs board straight
-- away (POST /api/portal/boats/request-job, service role), with no crew yet —
-- the office assigns the crew and the date when it schedules it. These columns
-- record who asked, so the office can see an owner request apart from its own
-- jobs and knows who to come back to.

alter table public.orbit2_boat_tasks
  add column if not exists requested_by_name      text,
  add column if not exists requested_by_position  text,
  add column if not exists requested_by_user      uuid references auth.users(id) on delete set null,
  add column if not exists requested_at           timestamptz;

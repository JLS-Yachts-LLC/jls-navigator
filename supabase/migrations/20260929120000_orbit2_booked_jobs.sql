-- Managed Boats: a fourth job category, "Booked" (kind = 'booked').
--
-- Client request, 29 Sep 2026. A Booked job records that the boat is scheduled
-- for use — training, rental, or anything else — rather than being worked on.
-- A boat with a Booked job that is Pending or Ongoing counts as "In-Use" on
-- the Managed Boats board.
alter table public.orbit2_boat_tasks drop constraint if exists orbit2_boat_tasks_kind_check;
alter table public.orbit2_boat_tasks add constraint orbit2_boat_tasks_kind_check
  check (kind in ('maintenance', 'defect', 'inventory', 'booked'));

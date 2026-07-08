-- ShipSync drivers: which weekdays each driver works (Mon-first: 0=Mon … 6=Sun).
-- Default to all days so existing drivers stay fully available until edited.
alter table public.shipsync_drivers
  add column if not exists work_days integer[] not null default '{0,1,2,3,4,5,6}';

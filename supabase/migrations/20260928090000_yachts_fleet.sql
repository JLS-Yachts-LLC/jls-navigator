-- Vessels — separate JLS's own boats from the client fleet.
--
-- A new "JLS Boats" tab sits beside Vessel Overview and uses the same screen:
-- the same list, cards, detail page, documents, crew, permits and photo. The
-- simplest way to get every one of those for free is for a JLS boat to BE a
-- yachts row, marked as ours — rather than a second table that the detail page,
-- its foreign keys and every tab behind it would each have to learn about.
--
-- 'client' is the default, so every existing vessel, and every vessel the
-- SharePoint sync inserts, stays exactly where it is today.
alter table public.yachts
  add column if not exists fleet text not null default 'client';

alter table public.yachts
  drop constraint if exists yachts_fleet_check;
alter table public.yachts
  add constraint yachts_fleet_check check (fleet in ('client', 'jls'));

create index if not exists yachts_fleet_idx on public.yachts (fleet);

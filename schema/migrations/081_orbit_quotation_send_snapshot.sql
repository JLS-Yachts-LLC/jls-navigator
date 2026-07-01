-- Migration 081: Generate/Send separation for orbit_quotations
-- Extends the real, already-live public.orbit_quotations table (used by
-- src/components/orbit/orbit-request-detail-page.tsx for all 11 ORBIT
-- categories) rather than the vendor package's fictional new `quotations`
-- table. Today the UI only has submit -> accept/reject, with no explicit
-- "send to client" checkpoint. Adding sent_at/sent_snapshot lets a future
-- Generate/Send flow lock the quote as actually sent, matching the
-- Agency/Crew Placement write-once snapshot pattern — additive only, does
-- not change the existing accept/reject behavior any category relies on
-- today.

alter table public.orbit_quotations
  add column if not exists sent_at timestamptz,
  add column if not exists sent_snapshot jsonb;

create or replace function public.prevent_orbit_quotation_snapshot_overwrite()
returns trigger language plpgsql as $$
begin
  if old.sent_snapshot is not null and new.sent_snapshot is distinct from old.sent_snapshot then
    raise exception 'orbit_quotations.sent_snapshot is write-once and cannot be modified after sending';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_orbit_quotation_snapshot_overwrite on public.orbit_quotations;
create trigger trg_prevent_orbit_quotation_snapshot_overwrite
  before update on public.orbit_quotations
  for each row execute function public.prevent_orbit_quotation_snapshot_overwrite();

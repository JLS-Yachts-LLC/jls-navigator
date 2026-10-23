-- SD-0082: signed-off crew were still listed in the visa reports.
-- Sign On/Off writes crew_members.status = 'off_signed', but this view only
-- excluded the tracker-import spellings ('sign off' / 'signed off'), so crew who
-- had left the country still appeared as expiring / expired in vessel reports.
CREATE OR REPLACE VIEW public.vessel_active_crew WITH (security_invoker = on) AS
  SELECT
    cm.yacht_id                  AS yacht_id,
    cm.id                        AS crew_member_id,
    cm.full_name                 AS full_name,
    cm.nationality               AS nationality,
    'crew_assignments'::text     AS source
  FROM public.crew_members cm
  WHERE cm.yacht_id IS NOT NULL
    AND coalesce(lower(cm.status), 'active') NOT IN ('cancelled','off_signed','sign off','signed off');

-- ============================================================
-- Migration 039 — UAE working-days calendar + helper   Ticket #168
-- UAE weekend = Saturday + Sunday (maritime/commercial standard).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.uae_public_holidays (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  holiday_date date NOT NULL UNIQUE,
  name         text NOT NULL,
  year         int NOT NULL GENERATED ALWAYS AS (EXTRACT(YEAR FROM holiday_date)::int) STORED
);

INSERT INTO public.uae_public_holidays (holiday_date, name) VALUES
  ('2026-01-01', 'New Year''s Day'),
  ('2026-03-30', 'Eid Al Fitr (est.)'),
  ('2026-03-31', 'Eid Al Fitr (est.)'),
  ('2026-04-01', 'Eid Al Fitr (est.)'),
  ('2026-06-06', 'Eid Al Adha (est.)'),
  ('2026-06-07', 'Eid Al Adha (est.)'),
  ('2026-06-08', 'Eid Al Adha (est.)'),
  ('2026-06-09', 'Eid Al Adha (est.)'),
  ('2026-06-26', 'Arafat Day (est.)'),
  ('2026-07-01', 'Islamic New Year (est.)'),
  ('2026-09-12', 'Prophet''s Birthday (est.)'),
  ('2026-11-03', 'Commemoration Day'),
  ('2026-12-02', 'UAE National Day'),
  ('2026-12-03', 'UAE National Day'),
  ('2027-01-01', 'New Year''s Day')
ON CONFLICT (holiday_date) DO NOTHING;

-- Working days between today and target_date (exclusive of target).
-- A working day = Mon–Fri and not a UAE public holiday.
CREATE OR REPLACE FUNCTION public.working_days_until(target_date date)
RETURNS int
LANGUAGE sql
STABLE
AS $$
  SELECT COUNT(*)::int
  FROM generate_series(CURRENT_DATE, target_date - INTERVAL '1 day', INTERVAL '1 day') AS d(day)
  WHERE EXTRACT(DOW FROM d.day) NOT IN (0, 6)   -- 0=Sunday, 6=Saturday
    AND d.day::date NOT IN (SELECT holiday_date FROM public.uae_public_holidays);
$$;

-- Reference data: any authenticated user may read holidays; only admins write.
ALTER TABLE public.uae_public_holidays ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS uae_holidays_read ON public.uae_public_holidays;
CREATE POLICY uae_holidays_read ON public.uae_public_holidays FOR SELECT
  USING ((select auth.role()) = 'authenticated');
DROP POLICY IF EXISTS uae_holidays_admin ON public.uae_public_holidays;
CREATE POLICY uae_holidays_admin ON public.uae_public_holidays FOR ALL
  USING (public.has_role((select auth.uid()), 'admin'::public.app_role))
  WITH CHECK (public.has_role((select auth.uid()), 'admin'::public.app_role));

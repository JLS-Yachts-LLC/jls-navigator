-- ── Security lockdown (critical) ─────────────────────────────────────────────
-- Enable RLS + authenticated-only access on tables that were exposed via the
-- public PostgREST API without RLS (several hold PII: passports, visas, certs).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'crew_members','crew_documents','crew_signon_events','orbit_defects','orbit_maintenance',
    'placement_candidates','placement_vacancies','agency_contacts','compass_vendors','ship_spares',
    'training_records','training_certifications','waypoint_suppliers','waypoint_quotations',
    'provisioning_orders','visa_applications'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS authenticated_all ON public.%I', t);
    EXECUTE format('CREATE POLICY authenticated_all ON public.%I FOR ALL USING (auth.role() = ''authenticated'') WITH CHECK (auth.role() = ''authenticated'')', t);
  END LOOP;
END $$;

-- Pin search_path on flagged trigger functions.
ALTER FUNCTION public.set_updated_at() SET search_path = public;
ALTER FUNCTION public.it_tickets_set_ticket_no() SET search_path = public;
ALTER FUNCTION public.esign_set_reference() SET search_path = public;
ALTER FUNCTION public.polaris_sync_crew_full_name() SET search_path = public;
ALTER FUNCTION public.set_ticket_no() SET search_path = public;

-- Stop anonymous listing of public buckets (public object URLs still resolve).
DROP POLICY IF EXISTS "esign public read" ON storage.objects;
CREATE POLICY "esign authenticated read" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'esign-documents');
DROP POLICY IF EXISTS "Public can view permit documents" ON storage.objects;
CREATE POLICY "permit docs authenticated read" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'permit-documents');
DROP POLICY IF EXISTS "Vessel images authenticated list" ON storage.objects;
CREATE POLICY "vessel images authenticated read" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'vessel-images');

-- Replace literal-true policies with an explicit authenticated check.
DO $$
DECLARE rec record;
BEGIN
  FOR rec IN SELECT * FROM (VALUES
    ('deliveries','auth users can manage deliveries'),
    ('delivery_drivers','auth users can manage delivery_drivers'),
    ('packages','auth users can manage packages'),
    ('procurement_items','auth users can manage procurement_items'),
    ('yacht_it_contracts','auth users can manage yacht_it_contracts')
  ) AS v(tbl, pol)
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', rec.pol, rec.tbl);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL USING (auth.role() = ''authenticated'') WITH CHECK (auth.role() = ''authenticated'')', rec.pol, rec.tbl);
  END LOOP;
END $$;

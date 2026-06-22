-- ============================================================
-- PHASE 6 — UAE VISA GO-LIVE ADMIN SETUP  (Tickets #186–#190)
--
-- MANUAL, sign-off gated. NOT an auto-run migration (lives under supabase/manual/).
-- Run by an admin in the Supabase SQL editor after migrations 037–045 are applied.
--
-- Reconciliation notes (spec assumed user_roles / user_module_permissions):
--   * Global-admin role lives in the live access-control model as
--     user_profiles.role_id -> roles(name='global_admin'). The legacy
--     user_roles/app_role + has_role() also exist; grant BOTH for safety.
--   * Module access = user_module_access(user_id, module_id, permission_level)
--     joined to modules(name='crew_immigration').
--   * Users must already exist in auth.users (invited via the admin panel) and
--     have a user_profiles row before module access can be granted.
-- ============================================================

-- ── Step 1 (#186) — Grant md@jlsyachts.com global_admin ──────────────────────
-- Sets the access-control role_id on their user_profiles row.
UPDATE public.user_profiles up
SET role_id = (SELECT role_id FROM public.roles WHERE name = 'global_admin')
FROM auth.users u
WHERE u.id = up.user_id AND u.email = 'md@jlsyachts.com';

-- Also grant the legacy admin role used by has_role()/RLS, if that table exists.
INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'admin'::public.app_role
FROM auth.users u
WHERE u.email = 'md@jlsyachts.com'
ON CONFLICT DO NOTHING;

-- ── Step 2 (#187) — Grant crew_immigration to the Crew & Agency team ─────────
-- Operations staff are NOT listed here — they must not get this permission.
DO $$
DECLARE
  crew_agency_emails text[] := ARRAY[
    'md@jlsyachts.com'
    -- , 'love@jlsyachts.com'   -- add Crew & Agency team emails here before running
  ];
  email_addr text;
  uid uuid;
  mod_id uuid;
BEGIN
  SELECT module_id INTO mod_id FROM public.modules WHERE name = 'crew_immigration';
  FOREACH email_addr IN ARRAY crew_agency_emails LOOP
    SELECT id INTO uid FROM auth.users WHERE email = email_addr;
    IF uid IS NULL THEN
      RAISE NOTICE 'User not found: %', email_addr; CONTINUE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.user_profiles WHERE user_id = uid) THEN
      RAISE NOTICE 'No user_profiles row for % — invite via admin panel first', email_addr; CONTINUE;
    END IF;
    INSERT INTO public.user_module_access (user_id, module_id, permission_level, granted_by, active)
    VALUES (uid, mod_id, 'edit', uid, true)
    ON CONFLICT (user_id, module_id) DO UPDATE SET permission_level = 'edit', active = true;
  END LOOP;
END $$;

-- ── Step 3 (#188) — Resolve Love's pending MFA (manual, dashboard) ───────────
-- In Supabase Dashboard > Authentication > Users:
--   1. Find Love's account. 2. Confirm a verified TOTP factor exists.
--   3. If not, send a new MFA setup link. 4. Do NOT grant crew_immigration above
--      until MFA is active.

-- ── Step 4 (#189) — Confirm fee values post sign-off ─────────────────────────
UPDATE public.platform_config SET value = '50.00', updated_at = now()
  WHERE key = 'uae_visa_supporting_letter_aed';
UPDATE public.platform_config SET value = '14.00', updated_at = now()
  WHERE key = 'uae_visa_supporting_letter_usd';

-- ── Step 5 (#190) — Upload approved JLS Crew Verification Letter template ─────
-- Replace the placeholder body_html with the approved letterhead. Keep placeholders:
--   {{crew_full_name}} {{crew_role}} {{vessel_name}} {{vessel_flag}} {{letter_date}} {{authorised_signatory}}
-- UPDATE public.document_templates
--   SET body_html = '<!-- PASTE APPROVED JLS TEMPLATE HTML HERE -->', version = version + 1, updated_at = now()
--   WHERE template_key = 'jls_crew_verification_letter';

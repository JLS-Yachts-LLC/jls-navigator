-- Migration 025: Structured phone fields on crew_members
-- Adds phone_country_code + phone_number; phone_full is a computed generated column.

ALTER TABLE crew_members
  ADD COLUMN IF NOT EXISTS phone_country_code   VARCHAR(10),
  ADD COLUMN IF NOT EXISTS phone_number         VARCHAR(30);

-- Generated column: concatenation of country code + local number (digits only).
-- Never write to this column directly — Postgres maintains it automatically.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'crew_members' AND column_name = 'phone_full'
  ) THEN
    ALTER TABLE crew_members
      ADD COLUMN phone_full VARCHAR(40)
        GENERATED ALWAYS AS (
          CASE
            WHEN phone_country_code IS NOT NULL AND phone_number IS NOT NULL
              AND phone_country_code <> '' AND phone_number <> ''
            THEN phone_country_code || phone_number
            ELSE NULL
          END
        ) STORED;
  END IF;
END $$;

-- Verification status — Phase 2 UI deferred; schema added now.
ALTER TABLE crew_members
  ADD COLUMN IF NOT EXISTS phone_verified_status VARCHAR(20) NOT NULL DEFAULT 'unverified'
    CHECK (phone_verified_status IN ('unverified', 'otp_verified', 'whatsapp_verified')),
  ADD COLUMN IF NOT EXISTS phone_verified_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS phone_verified_by     UUID REFERENCES auth.users(id);

CREATE INDEX IF NOT EXISTS idx_crew_phone_full ON crew_members(phone_full)
  WHERE phone_full IS NOT NULL;

-- Migration 026: Same structured columns on emergency_contacts (if table exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'emergency_contacts'
  ) THEN
    EXECUTE 'ALTER TABLE emergency_contacts
      ADD COLUMN IF NOT EXISTS phone_country_code VARCHAR(10),
      ADD COLUMN IF NOT EXISTS phone_number       VARCHAR(30)';

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'emergency_contacts' AND column_name = 'phone_full'
    ) THEN
      EXECUTE $q$ALTER TABLE emergency_contacts
        ADD COLUMN phone_full VARCHAR(40)
          GENERATED ALWAYS AS (
            CASE
              WHEN phone_country_code IS NOT NULL AND phone_number IS NOT NULL
                AND phone_country_code <> '' AND phone_number <> ''
              THEN phone_country_code || phone_number
              ELSE NULL
            END
          ) STORED$q$;
    END IF;
  END IF;
END $$;

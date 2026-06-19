-- Migration 027 PREVIEW — Name normalisation for existing crew_members records
--
-- DO NOT RUN AUTOMATICALLY. Review with Mike before executing on production data.
-- This updates first_name, last_name, and full_name to title-case in place.
--
-- The title-case logic here approximates formatName() in TypeScript using
-- PostgreSQL's initcap() function. initcap() handles the common case correctly
-- (capitalises first letter of each word). Edge cases (O'Brien, van der Berg)
-- may need a follow-up manual pass for affected records.
--
-- Run this inside a transaction so you can ROLLBACK if the result looks wrong:
--
--   BEGIN;
--   -- [paste this script]
--   SELECT id, full_name, first_name, last_name FROM crew_members LIMIT 20;  -- spot-check
--   -- COMMIT or ROLLBACK based on review

UPDATE crew_members
SET
  first_name = initcap(trim(first_name)),
  last_name  = initcap(trim(last_name)),
  full_name  = initcap(trim(
    CASE
      WHEN middle_name IS NOT NULL AND middle_name <> ''
        THEN first_name || ' ' || middle_name || ' ' || last_name
      ELSE first_name || ' ' || last_name
    END
  ))
WHERE
  first_name IS NOT NULL
  OR last_name IS NOT NULL;

-- Verify: any names that still contain all-lowercase words after update
-- (these may need manual attention):
-- SELECT id, full_name FROM crew_members
-- WHERE full_name ~ '[a-z]{2,}' AND full_name !~ '^[A-Z]';

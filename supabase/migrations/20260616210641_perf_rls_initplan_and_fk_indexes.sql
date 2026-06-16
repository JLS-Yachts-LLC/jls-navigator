-- ── Performance: RLS init-plan wrapping + missing foreign-key indexes ──────────
-- Addresses Supabase performance advisor lints:
--   • auth_rls_initplan (×60): auth.role()/auth.uid()/auth.jwt() called per-row in
--     RLS policies. Wrapping each in a scalar subquery `(select …)` makes Postgres
--     evaluate it ONCE per statement (init-plan) instead of once per row.
--   • unindexed_foreign_keys (×41): FK columns without a covering index force a
--     sequential scan on the referenced side for cascades/joins. Add one index per
--     FK whose leading column isn't already the first column of an existing index.
--
-- Both blocks are idempotent: re-running skips policies already wrapped and indexes
-- that already exist.

-- 1) Wrap auth.*() calls in RLS policy expressions in a scalar subquery. ──────────
DO $$
DECLARE
  pol record;
  new_qual text;
  new_check text;
  cmd text;
  roles_clause text;
BEGIN
  FOR pol IN
    SELECT n.nspname  AS schemaname,
           c.relname  AS tablename,
           p.polname  AS policyname,
           p.polcmd   AS cmd,
           pg_get_expr(p.polqual, p.polrelid)       AS qual,
           pg_get_expr(p.polwithcheck, p.polrelid)  AS withcheck,
           ARRAY(SELECT pg_get_userbyid(r) FROM unnest(p.polroles) AS r) AS roles
    FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND (
        (pg_get_expr(p.polqual, p.polrelid)      ~ 'auth\.(role|uid|jwt)\(\)') OR
        (pg_get_expr(p.polwithcheck, p.polrelid) ~ 'auth\.(role|uid|jwt)\(\)')
      )
      -- skip policies already wrapped in every spot (no bare auth.*() left)
      AND (
        (pg_get_expr(p.polqual, p.polrelid)      ~ '(?<!\(\s*select\s)auth\.(role|uid|jwt)\(\)') OR
        (pg_get_expr(p.polwithcheck, p.polrelid) ~ '(?<!\(\s*select\s)auth\.(role|uid|jwt)\(\)')
      )
  LOOP
    new_qual  := regexp_replace(COALESCE(pol.qual, ''),  '(auth\.(role|uid|jwt)\(\))', '(select \1)', 'g');
    new_check := regexp_replace(COALESCE(pol.withcheck, ''), '(auth\.(role|uid|jwt)\(\))', '(select \1)', 'g');

    -- guard against double-wrapping when an earlier run partially applied
    new_qual  := regexp_replace(new_qual,  '\(select \(select (auth\.(role|uid|jwt)\(\))\)\)', '(select \1)', 'g');
    new_check := regexp_replace(new_check, '\(select \(select (auth\.(role|uid|jwt)\(\))\)\)', '(select \1)', 'g');

    cmd := CASE pol.cmd
             WHEN 'r' THEN 'SELECT' WHEN 'a' THEN 'INSERT'
             WHEN 'w' THEN 'UPDATE' WHEN 'd' THEN 'DELETE' ELSE 'ALL' END;

    roles_clause := array_to_string(ARRAY(SELECT quote_ident(x) FROM unnest(pol.roles) AS x), ', ');

    EXECUTE format('ALTER POLICY %I ON public.%I TO %s%s%s',
      pol.policyname, pol.tablename, roles_clause,
      CASE WHEN pol.qual IS NOT NULL THEN format(' USING (%s)', new_qual) ELSE '' END,
      CASE WHEN pol.withcheck IS NOT NULL THEN format(' WITH CHECK (%s)', new_check) ELSE '' END
    );
  END LOOP;
END $$;

-- 2) Create a covering index for every FK whose leading column isn't already the
--    first column of some existing index on that table. ──────────────────────────
DO $$
DECLARE
  fk record;
  idx_name text;
BEGIN
  FOR fk IN
    SELECT con.conname,
           rel.relname        AS tablename,
           att.attname        AS colname
    FROM pg_constraint con
    JOIN pg_class rel        ON rel.oid = con.conrelid
    JOIN pg_namespace nsp    ON nsp.oid = rel.relnamespace
    JOIN pg_attribute att    ON att.attrelid = con.conrelid
                            AND att.attnum = con.conkey[1]   -- leading FK column
    WHERE con.contype = 'f'
      AND nsp.nspname = 'public'
      AND NOT EXISTS (
        SELECT 1
        FROM pg_index i
        WHERE i.indrelid = con.conrelid
          AND i.indkey[0] = con.conkey[1]
      )
  LOOP
    idx_name := left(format('idx_%s_%s', fk.tablename, fk.conname), 63);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (%I)',
      idx_name, fk.tablename, fk.colname);
  END LOOP;
END $$;

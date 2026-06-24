-- ============================================================
-- Migration — enable RLS on doc_number_seq (Security Advisor fix)
-- ============================================================
-- doc_number_seq is only accessed via the SECURITY DEFINER next_doc_number() RPC
-- (owned by postgres, which has BYPASSRLS), so enabling RLS with no policies locks
-- out direct PostgREST access without affecting the allocator or the n8n heal.
ALTER TABLE public.doc_number_seq ENABLE ROW LEVEL SECURITY;

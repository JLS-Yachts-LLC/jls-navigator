-- Security Advisor: "RLS Disabled in Public" on qb_entity_locks and qb_proforma_docs.
--
-- Both tables are internal QuickBooks doc-gen machinery, reached exclusively via
-- the service role (locks.server.ts, estimate-docgen.server.ts, api.qb.profinv.ts)
-- which bypasses RLS — so enabling it changes nothing for the app. RLS on with no
-- policies denies anon/authenticated outright, same as qb_templates/qbo_doc_logs.
alter table public.qb_entity_locks  enable row level security;
alter table public.qb_proforma_docs enable row level security;

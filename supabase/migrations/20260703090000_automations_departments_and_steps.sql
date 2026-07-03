-- Department grouping + step-by-step metadata for the Automations hub.
-- (Applied live 2026-07-03 via MCP; backfill CASE mapping in the applied copy.)
alter table public.automations add column if not exists department text;
alter table public.automations add column if not exists steps jsonb;

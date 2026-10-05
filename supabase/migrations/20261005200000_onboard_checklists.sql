-- Client Portal · On board (Management module) — checklists.
--
--   onboard_checklist_templates  the vessel's own checklists (departure, arrival,
--                                daily rounds, guest turnaround…), each with how
--                                often it's due and its items as a JSON list:
--                                [{ "id": "a1", "label": "…", "section": "…" }]
--   onboard_checklist_runs       one go through a checklist: who started and
--                                finished it, and each item's result as JSON:
--                                { "<item id>": { "done": true, "note": "…", "by": "…", "at": "…" } }
--
-- The items are copied onto the run when it starts, so editing a checklist later
-- never rewrites a record of what was actually checked.
--
-- Same isolation as the other On board tables: staff manage everything; a portal
-- login reads only its own vessel's rows from an MFA-verified session; writes go
-- through /api/portal/checklists with the service role.

create table if not exists public.onboard_checklist_templates (
  id uuid primary key default gen_random_uuid(),
  yacht_id uuid not null references public.yachts(id) on delete cascade,
  title text not null,
  department text not null default 'deck'
    check (department in ('galley', 'interior', 'bar', 'deck', 'engine', 'safety', 'other')),
  frequency text not null default 'as_needed'
    check (frequency in ('daily', 'weekly', 'monthly', 'before_departure', 'on_arrival', 'guest_turnaround', 'as_needed')),
  items jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array'),
  active boolean not null default true,
  created_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists onboard_checklist_templates_yacht_idx on public.onboard_checklist_templates (yacht_id);

create table if not exists public.onboard_checklist_runs (
  id uuid primary key default gen_random_uuid(),
  yacht_id uuid not null references public.yachts(id) on delete cascade,
  template_id uuid references public.onboard_checklist_templates(id) on delete set null,
  title text not null,
  department text not null default 'deck',
  items jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array'),
  results jsonb not null default '{}'::jsonb check (jsonb_typeof(results) = 'object'),
  status text not null default 'in_progress' check (status in ('in_progress', 'completed')),
  notes text,
  started_by_name text,
  started_at timestamptz not null default now(),
  completed_by_name text,
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists onboard_checklist_runs_yacht_idx on public.onboard_checklist_runs (yacht_id, started_at desc);
create index if not exists onboard_checklist_runs_template_idx on public.onboard_checklist_runs (template_id, completed_at desc);

drop trigger if exists onboard_checklist_templates_updated on public.onboard_checklist_templates;
create trigger onboard_checklist_templates_updated before update on public.onboard_checklist_templates
  for each row execute function public.set_updated_at();
drop trigger if exists onboard_checklist_runs_updated on public.onboard_checklist_runs;
create trigger onboard_checklist_runs_updated before update on public.onboard_checklist_runs
  for each row execute function public.set_updated_at();

do $$
declare t text;
begin
  foreach t in array array['onboard_checklist_templates', 'onboard_checklist_runs'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists staff_manage on public.%I', t);
    execute format($p$create policy staff_manage on public.%I for all to authenticated
      using (not public.is_portal_captain()) with check (not public.is_portal_captain())$p$, t);
    execute format('drop policy if exists captain_select on public.%I', t);
    execute format($p$create policy captain_select on public.%I for select to authenticated
      using (public.is_portal_captain() and public.portal_aal2() and yacht_id in (select public.captain_yacht_ids()))$p$, t);
    execute format('drop policy if exists portal_captain_block_insert on public.%I', t);
    execute format($p$create policy portal_captain_block_insert on public.%I as restrictive for insert to authenticated
      with check (not public.is_portal_captain())$p$, t);
    execute format('drop policy if exists portal_captain_block_update on public.%I', t);
    execute format($p$create policy portal_captain_block_update on public.%I as restrictive for update to authenticated
      using (not public.is_portal_captain())$p$, t);
    execute format('drop policy if exists portal_captain_block_delete on public.%I', t);
    execute format($p$create policy portal_captain_block_delete on public.%I as restrictive for delete to authenticated
      using (not public.is_portal_captain())$p$, t);
  end loop;
end $$;

-- One item's result, merged in place, so two crew ticking the same checklist at
-- the same moment never overwrite each other. Server-only (the portal route calls
-- it with the service role); never callable from a browser session.
create or replace function public.onboard_checklist_set_result(p_run_id uuid, p_yacht_id uuid, p_item_id text, p_result jsonb)
returns jsonb
language sql
set search_path = public
as $$
  update public.onboard_checklist_runs
     set results = coalesce(results, '{}'::jsonb) || jsonb_build_object(p_item_id, p_result)
   where id = p_run_id and yacht_id = p_yacht_id and status = 'in_progress'
  returning results;
$$;
revoke all on function public.onboard_checklist_set_result(uuid, uuid, text, jsonb) from public, anon, authenticated;

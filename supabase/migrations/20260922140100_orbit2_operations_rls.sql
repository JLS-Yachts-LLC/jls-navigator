-- Orbit 2 — row-level security for the operations tables.
--
-- Same shape as every other operational table in Polaris: any signed-in staff
-- member can work the module, and a client-portal captain never can. Portal
-- captains reach Polaris with an authenticated session, so without the
-- restrictive policy the permissive one alone would let them read every client's
-- quotes, invoices and supplier documents.

alter table public.orbit2_projects       enable row level security;
alter table public.orbit2_notes          enable row level security;
alter table public.orbit2_files          enable row level security;
alter table public.orbit2_noc_records    enable row level security;
alter table public.orbit2_boats          enable row level security;
alter table public.orbit2_boat_tasks     enable row level security;
alter table public.orbit2_team_schedule  enable row level security;

do $policies$
declare t text;
begin
  foreach t in array array[
    'orbit2_projects','orbit2_notes','orbit2_files','orbit2_noc_records',
    'orbit2_boats','orbit2_boat_tasks','orbit2_team_schedule'
  ] loop
    execute format('drop policy if exists authenticated_all on public.%I', t);
    execute format(
      'create policy authenticated_all on public.%I for all to authenticated '
      || 'using ((select auth.role()) = ''authenticated'') '
      || 'with check ((select auth.role()) = ''authenticated'')', t);

    execute format('drop policy if exists portal_captain_block on public.%I', t);
    execute format(
      'create policy portal_captain_block on public.%I as restrictive for all to authenticated '
      || 'using ((select not public.is_portal_captain())) '
      || 'with check ((select not public.is_portal_captain()))', t);
  end loop;
end $policies$;

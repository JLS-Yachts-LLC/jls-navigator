-- Gated on the yacht_it module rather than "any signed-in user": these maps hold
-- a vessel's IP plan, credential pointers and access notes. Today that resolves
-- to global admins and the admin department (edit), operations and orbit (view).

do $$
declare t text;
begin
  foreach t in array array['yacht_it_maps', 'yacht_it_zones', 'yacht_it_systems', 'yacht_it_links'] loop
    execute format('alter table public.%I enable row level security', t);

    execute format('drop policy if exists "yacht_it view" on public.%I', t);
    execute format('create policy "yacht_it view" on public.%I for select to authenticated
       using ((select public.has_module_permission(auth.uid(), ''yacht_it'', ''view''))
              and not (select public.is_portal_captain()))', t);

    execute format('drop policy if exists "yacht_it insert" on public.%I', t);
    execute format('create policy "yacht_it insert" on public.%I for insert to authenticated
       with check ((select public.has_module_permission(auth.uid(), ''yacht_it'', ''edit''))
                   and not (select public.is_portal_captain()))', t);

    execute format('drop policy if exists "yacht_it update" on public.%I', t);
    execute format('create policy "yacht_it update" on public.%I for update to authenticated
       using ((select public.has_module_permission(auth.uid(), ''yacht_it'', ''edit''))
              and not (select public.is_portal_captain()))
       with check ((select public.has_module_permission(auth.uid(), ''yacht_it'', ''edit''))
                   and not (select public.is_portal_captain()))', t);

    execute format('drop policy if exists "yacht_it delete" on public.%I', t);
    execute format('create policy "yacht_it delete" on public.%I for delete to authenticated
       using ((select public.has_module_permission(auth.uid(), ''yacht_it'', ''edit''))
              and not (select public.is_portal_captain()))', t);
  end loop;
end;
$$;

-- Service-only: RLS on, no policies, no grants to the API roles.
do $$
declare t text;
begin
  foreach t in array array['yacht_it_deletions', 'yacht_it_sync_state', 'yacht_it_sync_config'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end;
$$;

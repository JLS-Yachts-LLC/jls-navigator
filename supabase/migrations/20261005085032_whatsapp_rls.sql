-- view: read everything in the module. edit: create and change. No delete on
-- contacts (it would cascade away their consent proof) or list members
-- (membership history is kept by marking a row removed).
do $$
declare t text;
begin
  foreach t in array array['wa_contacts', 'wa_templates', 'wa_lists', 'wa_list_members', 'wa_campaigns',
                           'wa_consent_events', 'wa_messages', 'wa_inbound', 'wa_optin_invites'] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;

  -- Readable by the module.
  foreach t in array array['wa_contacts', 'wa_templates', 'wa_lists', 'wa_list_members', 'wa_campaigns',
                           'wa_consent_events', 'wa_messages', 'wa_inbound'] loop
    execute format('drop policy if exists "communications view" on public.%I', t);
    execute format('create policy "communications view" on public.%I for select to authenticated
       using ((select public.has_module_permission(auth.uid(), ''communications'', ''view''))
              and not (select public.is_portal_captain()))', t);
  end loop;

  -- Created and changed by editors.
  foreach t in array array['wa_contacts', 'wa_templates', 'wa_lists', 'wa_list_members', 'wa_campaigns'] loop
    execute format('drop policy if exists "communications insert" on public.%I', t);
    execute format('create policy "communications insert" on public.%I for insert to authenticated
       with check ((select public.has_module_permission(auth.uid(), ''communications'', ''edit''))
                   and not (select public.is_portal_captain()))', t);
    execute format('drop policy if exists "communications update" on public.%I', t);
    execute format('create policy "communications update" on public.%I for update to authenticated
       using ((select public.has_module_permission(auth.uid(), ''communications'', ''edit''))
              and not (select public.is_portal_captain()))
       with check ((select public.has_module_permission(auth.uid(), ''communications'', ''edit''))
                   and not (select public.is_portal_captain()))', t);
  end loop;

  -- Deletable: drafts and unused setup only.
  foreach t in array array['wa_templates', 'wa_lists', 'wa_campaigns'] loop
    execute format('drop policy if exists "communications delete" on public.%I', t);
    execute format('create policy "communications delete" on public.%I for delete to authenticated
       using ((select public.has_module_permission(auth.uid(), ''communications'', ''edit''))
              and not (select public.is_portal_captain()))', t);
  end loop;
end;
$$;

-- Server-only: opt-in tokens. Read-only to staff: the audit, send and inbound logs.
revoke all on public.wa_optin_invites from anon, authenticated;
revoke insert, update, delete on public.wa_consent_events from anon, authenticated;
revoke insert, update, delete on public.wa_messages from anon, authenticated;
revoke insert, update, delete on public.wa_inbound from anon, authenticated;
revoke delete on public.wa_contacts from anon, authenticated;
revoke delete on public.wa_list_members from anon, authenticated;

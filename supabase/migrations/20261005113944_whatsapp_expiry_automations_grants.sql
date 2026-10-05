-- Default privileges gave authenticated a table-wide UPDATE; keep it to the settings columns.
revoke update on public.wa_automations from authenticated;
grant update (template_id, variable_map, days_before, enabled, options, updated_by) on public.wa_automations to authenticated;

-- Sixth automated report: the weekly operations report (Agency permits, Crew
-- Care movements, Visas — done last week, this week, needing attention).
alter table public.vessel_report_subscriptions drop constraint if exists vessel_report_subscriptions_report_key_check;
alter table public.vessel_report_subscriptions add constraint vessel_report_subscriptions_report_key_check
  check (report_key in ('visa_status', 'sign_on_off', 'statement_of_account', 'crew_on_board', 'document_expiries', 'weekly_operations'));

-- The fleet edition, emailed internally every Monday 08:00 Dubai. Starts with
-- Matt only, so it can be reviewed before Mike and the team are added
-- (Developer → Automations).
insert into public.automations (key, name, description, category, trigger_type, schedule, source, enabled, config, department)
values (
  'weekly-operations-report', 'Weekly operations report',
  'Every Monday: a fleet summary, then Agency (entry, FMA and DMA permits), Crew Care (sign-ons, sign-offs, transfers) and Visas, grouped by yacht — done last week, planned this week, needing attention.',
  'Crew', 'schedule', 'Mondays 08:00 Dubai (editable on this page)', 'worker-cron', true,
  '{"schedule": {"tz": "Asia/Dubai", "day": "mon", "time": "08:00"}, "recipients": ["mattpeeters@newhorizon-it.co.uk"]}'::jsonb,
  'Operations'
)
on conflict (key) do nothing;

-- Fifth automated report: every dated paper for the vessel and its current
-- crew that has expired or falls due in the next 90 days.
alter table public.vessel_report_subscriptions drop constraint if exists vessel_report_subscriptions_report_key_check;
alter table public.vessel_report_subscriptions add constraint vessel_report_subscriptions_report_key_check
  check (report_key in ('visa_status', 'sign_on_off', 'statement_of_account', 'crew_on_board', 'document_expiries'));

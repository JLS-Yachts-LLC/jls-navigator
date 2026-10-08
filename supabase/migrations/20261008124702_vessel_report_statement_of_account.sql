-- Third automated report: the vessel's statement of account (open invoices
-- across every company that bills it — JLS and Waypoint).
alter table public.vessel_report_subscriptions drop constraint if exists vessel_report_subscriptions_report_key_check;
alter table public.vessel_report_subscriptions add constraint vessel_report_subscriptions_report_key_check
  check (report_key in ('visa_status', 'sign_on_off', 'statement_of_account'));

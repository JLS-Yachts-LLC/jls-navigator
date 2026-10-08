-- Fourth automated report: who is on board (crew record status active, as the
-- Client Portal's Today's brief counts it), with passport and visa standing.
alter table public.vessel_report_subscriptions drop constraint if exists vessel_report_subscriptions_report_key_check;
alter table public.vessel_report_subscriptions add constraint vessel_report_subscriptions_report_key_check
  check (report_key in ('visa_status', 'sign_on_off', 'statement_of_account', 'crew_on_board'));

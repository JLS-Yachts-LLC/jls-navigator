-- The old per-vessel visa report setting, retired 8 Oct 2026: a vessel's visa
-- report — who it goes to and when — is its Visa status report in
-- Reports → Automated Reports (vessel_report_subscriptions). No vessel had it
-- switched on or an address set when these were dropped.
alter table public.yachts drop column if exists send_visa_reports;
alter table public.yachts drop column if exists visa_report_email;

-- Migration 082: Invoice stub on orbit_service_requests
-- Mirrors the exact billing-stub shape already added to orbit_projects
-- (see supabase/migrations/20260627150000_orbit_projects_billing.sql:
-- charge_amount, billing_status, invoice_ref, invoice_amount) rather than
-- the vendor package's new `invoices` table — keeps ORBIT's finance-stub
-- pattern consistent across both project- and request-based work. No live
-- QuickBooks/Finance integration, same caution as every other module's
-- finance stub.

alter table public.orbit_service_requests
  add column if not exists charge_amount numeric,
  add column if not exists billing_status text not null default 'pending_review',
  add column if not exists invoice_ref text,
  add column if not exists invoice_amount numeric;

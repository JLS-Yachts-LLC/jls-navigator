-- Visa applications: billing/finance tracker columns
-- Mirrors the billing workflow used by crew_trips, packages, yacht_it_contracts,
-- procurement_items so visas can be tracked in Finance → Invoice Tracker.
ALTER TABLE visa_applications
  ADD COLUMN IF NOT EXISTS billing_status text NOT NULL DEFAULT 'pending_review',
  ADD COLUMN IF NOT EXISTS invoice_ref text,
  ADD COLUMN IF NOT EXISTS invoice_amount numeric;

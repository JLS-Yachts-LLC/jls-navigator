-- Internal Services & Subscriptions: add the sell price (what we charge the
-- yacht), commitment term, invoicing/PO tracking, and a flag so the 90-day
-- renewal-quotation alert email only fires once per renewal cycle.
ALTER TABLE public.internal_services
  ADD COLUMN IF NOT EXISTS sell_price            numeric,
  ADD COLUMN IF NOT EXISTS commitment_term       text,
  ADD COLUMN IF NOT EXISTS jls_invoice_number    text,
  ADD COLUMN IF NOT EXISTS yacht_paid            boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS yacht_po              text,
  ADD COLUMN IF NOT EXISTS renewal_alert_sent_at timestamptz;

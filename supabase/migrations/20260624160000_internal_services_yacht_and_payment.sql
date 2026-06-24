-- Associate an internal service with a yacht/client, and record the payment method.
ALTER TABLE public.internal_services
  ADD COLUMN IF NOT EXISTS yacht_name     text,
  ADD COLUMN IF NOT EXISTS payment_method text;  -- card | debit | bank_transfer | other

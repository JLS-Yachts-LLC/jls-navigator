-- Internal services can be bought and sold in different currencies. Capture the
-- sell-price currency and the exchange rate at time of purchase (1 cost-currency
-- unit = fx_rate sell-currency units) so margin is computed against the locked rate.
ALTER TABLE public.internal_services
  ADD COLUMN IF NOT EXISTS sell_currency text,
  ADD COLUMN IF NOT EXISTS fx_rate       numeric,
  ADD COLUMN IF NOT EXISTS fx_rate_date  date;

UPDATE public.internal_services
   SET sell_currency = COALESCE(sell_currency, currency),
       fx_rate = COALESCE(fx_rate, 1)
 WHERE sell_currency IS NULL OR fx_rate IS NULL;

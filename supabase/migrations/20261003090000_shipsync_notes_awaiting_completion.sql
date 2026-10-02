-- Logistics mobile app — "Complete Later".
--
-- A driver who has delivered but not yet finished the handover paperwork taps
-- Complete Later; Manage Deliveries then shows that delivery note in yellow as
-- "Awaiting Completion". This marks when they did, and is cleared on completion.
-- Nullable and additive: nothing else reads it, and the app copes if it is absent.

alter table public.shipsync_delivery_notes
  add column if not exists awaiting_completion_at timestamptz;

-- Compass Card events: sign with a key pair instead of a shared secret.
--
-- Compass Card signs each event with an RSA private key that was generated on
-- its own server and never leaves it (~/.polaris/compass-events.key on
-- compasscard.online). Polaris only holds the matching PUBLIC key, which is not
-- a secret, so nothing sensitive has to be copied between the two systems.
-- The shared secret from 20261020100000 is no longer used and is cleared.
alter table public.compass_card_integration add column if not exists public_key text;
update public.compass_card_integration set webhook_secret = null, updated_at = now() where id = 1;

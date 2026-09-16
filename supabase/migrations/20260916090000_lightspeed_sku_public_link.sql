-- Public (token-gated) link for the Lightspeed → QuickBooks SKU sync.
--
-- The n8n original ("Update Item and Invoice Descriptions") was reached through
-- an n8n form link with no login: paste SKUs, items appear in the Waypoint
-- (Superyacht ME retail) QuickBooks company. Its native port lives behind Polaris
-- sign-in and requires an admin role, so the Waypoint team lost the shareable-link
-- workflow. This seeds one long random token that /sku-sync/<token> and
-- /api/lightspeed/sync?token= accept in place of a signed-in admin session.
--
-- Rotate a leaked link by updating the token value in this config row; the old
-- URL dies instantly. Same pattern as qb_excel_links (20260817090000).
-- Applied to production 2026-09-16 via the Supabase connector.

insert into public.integration_settings (integration_name, enabled, config)
values (
  'lightspeed_sku_link',
  true,
  jsonb_build_object('token', encode(extensions.gen_random_bytes(24), 'hex'))
)
on conflict (integration_name) do nothing;  -- never rotate silently on re-apply

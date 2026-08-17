-- Public (token-gated) links for the QB Excel importer.
--
-- The n8n original ("QB (Quotation/Estimate) Excel Input") was reached through an
-- n8n form link with no login. Its native port lives behind Polaris sign-in, so
-- the provisioning team lost the shareable-link workflow. This seeds two long
-- random tokens — one per document kind — that /qb-upload/<token> and the import
-- API accept in place of a signed-in session. The token IS the authorisation and
-- also fixes the document kind (an estimate link can never create invoices).
--
-- Rotate a leaked link by updating the token value in this config row; the old
-- URL dies instantly. Requires pgcrypto (already installed on this project).

insert into public.integration_settings (integration_name, enabled, config)
values (
  'qb_excel_links',
  true,
  jsonb_build_object(
    'estimate_token', encode(extensions.gen_random_bytes(24), 'hex'),
    'invoice_token',  encode(extensions.gen_random_bytes(24), 'hex')
  )
)
on conflict (integration_name) do nothing;  -- never rotate silently on re-apply

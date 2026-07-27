-- Global email kill-switch (integration_settings.email_notifications).
--
-- Every outbound automated email flows through sendTicketEmail / sendGraphEmail /
-- sendGraphEmailWithAttachments in src/lib/graph-mail.server.ts, which now check
-- this row before sending. `enabled = false` suppresses ALL notification email
-- platform-wide. The server also fail-safes to DISABLED if this row is missing or
-- unreadable.
--
-- Seeded DISABLED after an incorrect automated permit-expiry reminder went out
-- (2026-07-25). Re-enable from the Automations page when ready.

insert into public.integration_settings (integration_name, enabled, config)
values (
  'email_notifications',
  false,
  jsonb_build_object(
    'disabled_reason', 'Temporarily disabled after an incorrect automated permit-expiry reminder (2026-07-25). Re-enable when ready.',
    'disabled_at', '2026-07-27'
  )
)
on conflict (integration_name) do nothing;

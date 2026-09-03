-- Record whether a feedback report's notification actually went out.
--
-- Raising the Service Desk ticket and emailing the support mailboxes are
-- deliberately independent, so a mail failure never costs us the ticket. But the
-- failure was only ever returned to the browser and never written down, so a
-- report could exist in Polaris while nothing at all reached New Horizon — which
-- is what happened to SD-0013, SD-0016 and SD-0017 between 14 and 31 August.
--
-- With the outcome stored, an unsent report is visible in Polaris → Feedback and
-- can be sent again.

alter table public.feedback
  add column if not exists notified_at  timestamptz,
  add column if not exists notify_error text;

comment on column public.feedback.notified_at  is 'When the support notification email was accepted for delivery. Null = never sent.';
comment on column public.feedback.notify_error is 'Why the last notification attempt failed. Null when it succeeded.';

-- Record whether a staff invite actually went out.
--
-- The invite flow reported success whenever Microsoft Graph accepted the
-- message, which is not the same as the person receiving it: a mailbox that does
-- not exist, or a quarantine rule, produces an accepted send and a bounce nobody
-- sees. So "invited" was an assumption, and an invite that never arrived looked
-- identical to one that did.
--
-- With the outcome stored, the Manage Users list can say what happened, and the
-- invite endpoints now also return the sign-in link itself so an admin can hand
-- it over directly instead of depending on email at all.

alter table public.user_profiles
  add column if not exists invite_sent_at timestamptz,
  add column if not exists invite_error   text;

comment on column public.user_profiles.invite_sent_at is 'When the invite email was last accepted for delivery. Null = never sent, or the last attempt failed.';
comment on column public.user_profiles.invite_error   is 'Why the last invite attempt failed to send. Null when it succeeded.';

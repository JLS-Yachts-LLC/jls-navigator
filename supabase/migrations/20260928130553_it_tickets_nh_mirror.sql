-- Mirror bookkeeping for the New Horizon-IT service desk.
--
-- Polaris tickets are also raised on New Horizon's desk (support@newhorizon-it.co.uk)
-- so work on either platform is visible from both. These two columns are what make
-- that exactly-once: nh_mirrored_at is the guard against raising the same ticket
-- there twice, and nh_mirror_error keeps a failure visible instead of leaving a
-- ticket quietly absent from the other desk.

alter table public.it_tickets
  add column if not exists nh_mirrored_at timestamptz,
  add column if not exists nh_mirror_error text;

comment on column public.it_tickets.nh_mirrored_at is
  'When this ticket was raised on the New Horizon-IT desk. Non-null is what stops a second mirror.';
comment on column public.it_tickets.nh_mirror_error is
  'Why the last mirror attempt failed, if it did — so a ticket missing from the other desk is visible.';

-- Existing tickets are deliberately left unmirrored: back-filling would raise a
-- ticket on New Horizon for every historical item at once.
create index if not exists it_tickets_nh_unmirrored_idx
  on public.it_tickets (created_at desc)
  where nh_mirrored_at is null;

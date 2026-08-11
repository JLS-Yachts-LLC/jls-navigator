-- Feedback → Service Desk: every in-app bug report / feature request now raises a
-- real it_tickets row (queue 'polaris') so it lands in the Service Desk as an
-- app item to work on, instead of only emailing the support mailbox.
--
-- ticket_id links the two so the ticket reference can be shown against the
-- feedback item and so re-notifying the same feedback can never create a
-- duplicate ticket (the notify route checks this column first).

alter table public.feedback
  add column if not exists ticket_id uuid references public.it_tickets(id) on delete set null;

create index if not exists feedback_ticket_idx on public.feedback (ticket_id);

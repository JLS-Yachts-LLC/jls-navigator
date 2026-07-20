-- Per-entity processing locks for the QuickBooks pipeline: when Intuit resumes
-- webhook delivery after a backoff it dumps every queued batch at once, and
-- several concurrent invocations would process the same invoice simultaneously
-- (429 rate-limit storms, racing duplicate-sweeps). One row = one entity being
-- processed; stale rows (>3 min) are taken over.
create table if not exists public.qb_entity_locks (
  key        text primary key,
  locked_at  timestamptz not null default now()
);

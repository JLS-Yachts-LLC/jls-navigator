-- Client-portal users can hold different positions aboard (Captain today;
-- Owner / Representative / Purser etc. to follow).
alter table public.captain_accounts add column if not exists position text not null default 'captain';

-- Hours of rest — record how the day's rest was split, so the MLC rule that rest
-- may be divided into no more than two periods, one of them at least 6 hours,
-- can be checked as well as the daily total. Entered as e.g. "6+4"; null when
-- the rest was taken in one period.
alter table public.onboard_rest_hours add column if not exists rest_split text
  check (rest_split is null or rest_split ~ '^[0-9]+(\.[0-9]+)?(\+[0-9]+(\.[0-9]+)?)+$');

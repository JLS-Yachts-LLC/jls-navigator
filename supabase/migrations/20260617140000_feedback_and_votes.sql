-- Staff feedback: bug reports (with screenshot + activity log) and feature
-- requests (upvote/downvote). Visible to admins; bugs/requests emailed to support.
create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('bug','feature')),
  title text,
  message text not null,
  screenshot_url text,
  log jsonb,
  status text not null default 'open' check (status in ('open','planned','in_progress','done','closed')),
  created_by uuid,
  created_by_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.feedback enable row level security;
drop policy if exists feedback_read on public.feedback;
create policy feedback_read on public.feedback for select using ((select auth.role()) = 'authenticated');
drop policy if exists feedback_insert on public.feedback;
create policy feedback_insert on public.feedback for insert with check ((select auth.role()) = 'authenticated');
drop policy if exists feedback_update on public.feedback;
create policy feedback_update on public.feedback for update
  using (public.has_role((select auth.uid()), 'admin'::public.app_role))
  with check (public.has_role((select auth.uid()), 'admin'::public.app_role));
drop trigger if exists feedback_set_updated_at on public.feedback;
create trigger feedback_set_updated_at before update on public.feedback for each row execute function public.set_updated_at();

create table if not exists public.feedback_votes (
  feedback_id uuid not null references public.feedback(id) on delete cascade,
  user_id uuid not null,
  vote smallint not null check (vote in (-1, 1)),
  created_at timestamptz not null default now(),
  primary key (feedback_id, user_id)
);
alter table public.feedback_votes enable row level security;
drop policy if exists fv_read on public.feedback_votes;
create policy fv_read on public.feedback_votes for select using ((select auth.role()) = 'authenticated');
drop policy if exists fv_write on public.feedback_votes;
create policy fv_write on public.feedback_votes for all
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

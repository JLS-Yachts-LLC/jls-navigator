-- Covering indexes for the task board's foreign keys (performance advisor).
create index if not exists onboard_task_comments_yacht_idx on public.onboard_task_comments (yacht_id, kind);
create index if not exists onboard_tasks_assignee_crew_idx on public.onboard_tasks (assignee_crew_id) where assignee_crew_id is not null;

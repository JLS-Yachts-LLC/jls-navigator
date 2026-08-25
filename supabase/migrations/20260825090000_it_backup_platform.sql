-- Mini Backup platform (Yacht IT Solutions → Backups tab).
--
-- Protects EC2 instances (Singapore by default): a scheduled AMI image per
-- instance with retention pruning, then an offsite copy of the AMI's EBS
-- snapshot blocks to Impossible Cloud (S3-compatible), streamed through the
-- Worker in bounded chunks per cron tick. Credentials live in
-- integration_settings ('aws_backup' and 'impossible_cloud') — entered in the
-- Backups tab, never in code.
create table if not exists public.it_backup_instances (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  instance_id   text not null,
  region        text not null default 'ap-southeast-1',
  schedule      text not null default 'daily' check (schedule in ('daily','weekly','manual')),
  hour_utc      integer not null default 18 check (hour_utc between 0 and 23),
  retention     integer not null default 7 check (retention between 1 and 60),
  offsite       boolean not null default true,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create trigger trg_it_backup_instances_updated_at
  before update on public.it_backup_instances
  for each row execute function public.set_updated_at();

create table if not exists public.it_backup_runs (
  id             uuid primary key default gen_random_uuid(),
  instance_pk    uuid not null references public.it_backup_instances(id) on delete cascade,
  status         text not null default 'imaging'
                   check (status in ('imaging','offsite','complete','error')),
  ami_id         text,
  -- [{ snapshotId, volumeSizeGiB }] in device order, filled once the AMI is available
  snapshots      jsonb not null default '[]'::jsonb,
  -- offsite progress: bytes uploaded + the resumable cursor the cron advances
  offsite_bytes  bigint not null default 0,
  offsite_cursor jsonb not null default '{}'::jsonb,
  manifest_key   text,
  error          text,
  started_at     timestamptz not null default now(),
  finished_at    timestamptz
);

create index if not exists it_backup_runs_instance_idx on public.it_backup_runs (instance_pk, started_at desc);
create index if not exists it_backup_runs_status_idx   on public.it_backup_runs (status) where status in ('imaging','offsite');

alter table public.it_backup_instances enable row level security;
alter table public.it_backup_runs      enable row level security;

create policy it_backup_instances_staff on public.it_backup_instances
  for all to authenticated using (not is_portal_captain()) with check (not is_portal_captain());
create policy it_backup_runs_staff on public.it_backup_runs
  for all to authenticated using (not is_portal_captain()) with check (not is_portal_captain());

-- Migration 064: Backfill public.user_profiles for existing auth.users,
-- and auto-create a row for every future signup.
--
-- Root cause (found while testing the Port Calls create flow): several
-- real auth.users rows have no matching user_profiles row, so any FK
-- referencing user_profiles(user_id) — e.g. port_calls.created_by,
-- port_calls.assigned_agent_id — fails with a foreign key violation for
-- those users. src/lib/auth/claims.ts already acknowledges this
-- ("user_profiles is empty during rollout") and has client-side fallback
-- logic, but the *database* still needs a real row for FK integrity.
--
-- Role assignment uses the existing legacy public.user_roles signal
-- (admin -> global_admin, everything else -> read_only, which grants no
-- module access on its own — real access still comes from
-- user_module_access rows, unaffected by this migration).

do $$
declare
  v_global_admin_role_id uuid;
  v_read_only_role_id uuid;
begin
  select role_id into v_global_admin_role_id from public.roles where name = 'global_admin';
  select role_id into v_read_only_role_id from public.roles where name = 'read_only';

  insert into public.user_profiles (user_id, display_name, email, role_id, active, timezone)
  select
    u.id,
    coalesce(nullif(trim(split_part(u.email, '@', 1)), ''), 'Unnamed user'),
    u.email,
    case when ur.role = 'admin' then v_global_admin_role_id else v_read_only_role_id end,
    true,
    'Asia/Dubai'
  from auth.users u
  left join public.user_profiles up on up.user_id = u.id
  left join public.user_roles ur on ur.user_id = u.id
  where up.user_id is null;
end $$;

-- Auto-create a minimal user_profiles row for every future signup, so
-- this gap can't reopen. Defaults to read_only (no module access until
-- an admin grants it via user_module_access — ticket #133) unless the
-- legacy user_roles table already marks them admin.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_global_admin_role_id uuid;
  v_read_only_role_id uuid;
  v_legacy_role text;
begin
  select role_id into v_global_admin_role_id from public.roles where name = 'global_admin';
  select role_id into v_read_only_role_id from public.roles where name = 'read_only';
  select role into v_legacy_role from public.user_roles where user_id = new.id;

  insert into public.user_profiles (user_id, display_name, email, role_id, active, timezone)
  values (
    new.id,
    coalesce(nullif(trim(split_part(new.email, '@', 1)), ''), 'Unnamed user'),
    new.email,
    case when v_legacy_role = 'admin' then v_global_admin_role_id else v_read_only_role_id end,
    true,
    'Asia/Dubai'
  )
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists trg_handle_new_auth_user on auth.users;
create trigger trg_handle_new_auth_user
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

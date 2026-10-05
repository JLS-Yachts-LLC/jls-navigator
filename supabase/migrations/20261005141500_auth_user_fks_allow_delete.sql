-- Deleting a staff/portal login failed with "Database error deleting user":
-- 38 foreign keys to auth.users had the default ON DELETE NO ACTION, so any
-- row a user had ever created (a welcome-message log line, a shipment, a
-- seaport request...) blocked auth.admin.deleteUser().
--
--   * leo_welcome_message_log.user_id -> CASCADE (a per-user delivery log,
--     meaningless once the user is gone)
--   * every other column is an actor/author pointer (created_by, granted_by,
--     performed_by, ...) -> SET NULL, so the business record survives and just
--     stops pointing at the deleted login. The four that were NOT NULL have
--     that constraint dropped so SET NULL can apply.
do $$
declare
  r record;
begin
  for r in
    select c.conrelid::regclass as tbl, c.conname, a.attname as col, a.attnotnull as not_null
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
    where c.contype = 'f'
      and c.confrelid = 'auth.users'::regclass
      and c.connamespace = 'public'::regnamespace
      and c.confdeltype in ('a', 'r')
      and array_length(c.conkey, 1) = 1
  loop
    if r.tbl = 'public.leo_welcome_message_log'::regclass then
      execute format('alter table %s drop constraint %I, add constraint %I foreign key (%I) references auth.users(id) on delete cascade',
                     r.tbl, r.conname, r.conname, r.col);
    else
      if r.not_null then
        execute format('alter table %s alter column %I drop not null', r.tbl, r.col);
      end if;
      execute format('alter table %s drop constraint %I, add constraint %I foreign key (%I) references auth.users(id) on delete set null',
                     r.tbl, r.conname, r.conname, r.col);
    end if;
  end loop;
end $$;

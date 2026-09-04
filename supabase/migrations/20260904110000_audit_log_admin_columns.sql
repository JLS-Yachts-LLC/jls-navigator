-- Make the administrative audit trail actually record anything.
--
-- `audit_log` was built for the data-change triggers (permits, crew), whose rows
-- use user_id / module / resource_type / resource_id / metadata. The admin side —
-- invites, role changes, permission grants, exports — writes a different set of
-- columns through logAuditEvent(), and those columns were never added: every
-- insert failed, and the helper swallows its own error, so not one administrative
-- action has ever been logged. The audit export reads and filters the same
-- missing columns, so that screen was inert too.
--
-- Adding them is deliberately additive: the 9,000-odd existing data-change rows
-- stay valid and their producer is untouched. The two producers overlap on
-- user_id (who did it) and event_type; the columns below are the admin-only half.
--
-- There was a second cause behind the first: `audit_log_event_type_check` allows
-- only this table's own lower-case vocabulary ('permission_change', 'export',
-- 'data_edit', …), while the admin code speaks in short codes ('PERM', 'EXPORT',
-- 'DATA'). That is handled in code — logAuditEvent now translates onto the
-- allowed terms — rather than by widening the constraint, because two
-- vocabularies in one column is what made this column untrustworthy to begin
-- with. The constraint is deliberately left as it is.

alter table public.audit_log
  add column if not exists actor_email  text,
  add column if not exists actor_role   text,
  add column if not exists target_type  text,
  add column if not exists target_label text,
  add column if not exists detail       text,
  add column if not exists result       text;

comment on column public.audit_log.actor_email  is 'Email of the person who acted (admin events). Data-change rows identify the actor by user_id only.';
comment on column public.audit_log.target_label is 'Human-readable name of what was acted on, e.g. the invited email address.';
comment on column public.audit_log.detail       is 'One-line description of the action, shown verbatim in the audit export.';
comment on column public.audit_log.result       is 'success | blocked | pending | failed';

-- The export lists newest-first and filters by actor and result.
create index if not exists audit_log_created_idx on public.audit_log (created_at desc);
create index if not exists audit_log_actor_idx   on public.audit_log (actor_email);

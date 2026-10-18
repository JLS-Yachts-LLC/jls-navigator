-- Anchor → Signatory authorisation: a signatory's stored signature can only be
-- put on a document with their permission.
--
--   • jls_signatories.user_id     — the signatory's own Polaris login.
--   • jls_signatories.use_policy  — 'approval'  = every use needs the signatory's approval
--                                   'delegates' = their authorised users may apply it.
--   • jls_signatory_delegates     — the authorised users. Only the signatory themself or a
--                                   global admin can grant / revoke.
--   • jls_signatory_uses          — every request to use a signature and every use of it
--                                   (who asked, which document, who approved, when it was
--                                   stamped, and blocked attempts). Written ONLY by the
--                                   server (service role); staff can read it.
--   • jls_signatory_events        — grants, revokes and changes to a signatory (who, when).
--
-- Writes are locked: only global admins (and the signatory, for their own row) can create
-- or edit signatories or upload / replace / read signature images. Stamping is enforced
-- in the server code: a company signature is drawn only when a matching approved use
-- exists for that signatory, that document and that exact file (fingerprint).

-- ── Signatory columns ────────────────────────────────────────────────────────
alter table public.jls_signatories add column if not exists user_id uuid references auth.users(id) on delete set null;
alter table public.jls_signatories add column if not exists use_policy text not null default 'approval';
do $$ begin
  alter table public.jls_signatories add constraint jls_signatories_use_policy_chk check (use_policy in ('approval', 'delegates'));
exception when duplicate_object then null; end $$;
create index if not exists jls_signatories_user_idx on public.jls_signatories(user_id);

-- Link existing signatories to their login by email.
update public.jls_signatories s set user_id = u.id
from auth.users u
where s.user_id is null and s.email is not null and lower(u.email) = lower(s.email);

-- ── Helpers ──────────────────────────────────────────────────────────────────
create or replace function public.signatory_is_confidential(p_signatory_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select confidential from public.jls_signatories where id = p_signatory_id), false);
$$;

-- The signatory themself or a global admin.
create or replace function public.can_manage_signatory(p_signatory_id uuid, p_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(p_user_id is not null and (
    public.is_polaris_global_admin(p_user_id)
    or exists (select 1 from public.jls_signatories s where s.id = p_signatory_id and s.user_id = p_user_id)
  ), false);
$$;

-- Signature files are named "<signatory id>-<n>.png" (or under "confidential/").
create or replace function public.can_manage_signature_file(p_name text, p_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(p_user_id is not null and (
    public.is_polaris_global_admin(p_user_id)
    or exists (
      select 1 from public.jls_signatories s
      where s.user_id = p_user_id
        and (p_name like s.id::text || '-%' or p_name like 'confidential/' || s.id::text || '-%')
    )
  ), false);
$$;

-- ── Authorised users ─────────────────────────────────────────────────────────
create table if not exists public.jls_signatory_delegates (
  signatory_id uuid not null references public.jls_signatories(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  granted_by   uuid references auth.users(id) on delete set null,
  granted_at   timestamptz not null default now(),
  primary key (signatory_id, user_id)
);

-- How p_user may use the signature:
--   'own'        it is their own signature
--   'authorised' an authorised user of a signatory set to 'delegates'
--   'approval'   the signatory approves every use (anyone on staff may ask)
--   'none'       not allowed (they can ask to be made an authorised user)
create or replace function public.signatory_access(p_signatory_id uuid, p_user_id uuid)
returns text language sql stable security definer set search_path = public as $$
  select case
    when s.id is null or p_user_id is null or not s.active then 'none'
    when s.user_id = p_user_id then 'own'
    when s.use_policy = 'delegates' and exists (
      select 1 from public.jls_signatory_delegates d where d.signatory_id = s.id and d.user_id = p_user_id
    ) then 'authorised'
    when s.use_policy = 'approval' then 'approval'
    else 'none'
  end
  from (select 1) one
  left join public.jls_signatories s on s.id = p_signatory_id;
$$;

-- What the signed-in user may do with each signatory (the signature picker).
create or replace function public.my_signatory_access()
returns table (signatory_id uuid, access text)
language sql stable security definer set search_path = public as $$
  select s.id, public.signatory_access(s.id, auth.uid())
  from public.jls_signatories s
  where not s.confidential or public.can_see_anchor_confidential(auth.uid());
$$;

revoke all on function public.signatory_is_confidential(uuid) from public, anon;
revoke all on function public.can_manage_signatory(uuid, uuid) from public, anon;
revoke all on function public.signatory_access(uuid, uuid) from public, anon;
revoke all on function public.can_manage_signature_file(text, uuid) from public, anon;
revoke all on function public.my_signatory_access() from public, anon;
grant execute on function public.signatory_is_confidential(uuid) to authenticated, service_role;
grant execute on function public.can_manage_signatory(uuid, uuid) to authenticated, service_role;
grant execute on function public.signatory_access(uuid, uuid) to authenticated, service_role;
grant execute on function public.can_manage_signature_file(text, uuid) to authenticated, service_role;
grant execute on function public.my_signatory_access() to authenticated, service_role;

alter table public.jls_signatory_delegates enable row level security;
drop policy if exists jls_signatory_delegates_read on public.jls_signatory_delegates;
create policy jls_signatory_delegates_read on public.jls_signatory_delegates for select to authenticated
  using (not public.signatory_is_confidential(signatory_id) or public.can_see_anchor_confidential((select auth.uid())));
drop policy if exists jls_signatory_delegates_grant on public.jls_signatory_delegates;
create policy jls_signatory_delegates_grant on public.jls_signatory_delegates for insert to authenticated
  with check (public.can_manage_signatory(signatory_id, (select auth.uid())) and granted_by = (select auth.uid()));
drop policy if exists jls_signatory_delegates_revoke on public.jls_signatory_delegates;
create policy jls_signatory_delegates_revoke on public.jls_signatory_delegates for delete to authenticated
  using (public.can_manage_signatory(signatory_id, (select auth.uid())));
drop policy if exists portal_captain_block on public.jls_signatory_delegates;
create policy portal_captain_block on public.jls_signatory_delegates as restrictive for all to authenticated
  using (not public.is_portal_captain()) with check (not public.is_portal_captain());

-- ── Use requests + usage log (server-written) ────────────────────────────────
create table if not exists public.jls_signatory_uses (
  id                 uuid primary key default gen_random_uuid(),
  signatory_id       uuid not null references public.jls_signatories(id) on delete cascade,
  esign_document_id  uuid references public.esign_documents(id) on delete set null,
  form_submission_id uuid references public.anchor_form_submissions(id) on delete set null,
  campaign_id        uuid references public.esign_campaigns(id) on delete set null,
  document_title     text,
  fingerprint        text,          -- sha-256 of the exact file(s) approved; a changed file voids it
  status             text not null check (status in ('pending', 'approved', 'denied', 'applied', 'refused', 'cancelled')),
  basis              text,          -- own | authorised | approved | campaign
  requested_by       uuid references auth.users(id) on delete set null,
  requested_by_email text,
  decided_by         uuid references auth.users(id) on delete set null,
  decided_by_email   text,
  decided_at         timestamptz,
  note               text,
  applied_at         timestamptz,
  confidential       boolean not null default false,
  created_at         timestamptz not null default now()
);
create index if not exists jls_signatory_uses_sig_idx on public.jls_signatory_uses(signatory_id, created_at desc);
create index if not exists jls_signatory_uses_doc_idx on public.jls_signatory_uses(esign_document_id);
create index if not exists jls_signatory_uses_form_idx on public.jls_signatory_uses(form_submission_id);
create index if not exists jls_signatory_uses_campaign_idx on public.jls_signatory_uses(campaign_id);

alter table public.jls_signatory_uses enable row level security;
drop policy if exists jls_signatory_uses_read on public.jls_signatory_uses;
create policy jls_signatory_uses_read on public.jls_signatory_uses for select to authenticated
  using (not confidential or public.can_see_anchor_confidential((select auth.uid())));
drop policy if exists portal_captain_block on public.jls_signatory_uses;
create policy portal_captain_block on public.jls_signatory_uses as restrictive for all to authenticated
  using (not public.is_portal_captain()) with check (not public.is_portal_captain());
-- No insert / update / delete policy: only the server records or decides uses.

-- ── Change log (grants, revokes, signature / policy / owner changes) ─────────
create table if not exists public.jls_signatory_events (
  id           uuid primary key default gen_random_uuid(),
  signatory_id uuid not null references public.jls_signatories(id) on delete cascade,
  event        text not null,   -- granted | revoked | signature_changed | policy_changed | owner_changed | created
  actor        uuid,
  actor_email  text,
  target_user  uuid,
  detail       text,
  created_at   timestamptz not null default now()
);
create index if not exists jls_signatory_events_sig_idx on public.jls_signatory_events(signatory_id, created_at desc);
alter table public.jls_signatory_events enable row level security;
drop policy if exists jls_signatory_events_read on public.jls_signatory_events;
create policy jls_signatory_events_read on public.jls_signatory_events for select to authenticated
  using (not public.signatory_is_confidential(signatory_id) or public.can_see_anchor_confidential((select auth.uid())));
drop policy if exists portal_captain_block on public.jls_signatory_events;
create policy portal_captain_block on public.jls_signatory_events as restrictive for all to authenticated
  using (not public.is_portal_captain()) with check (not public.is_portal_captain());

create or replace function public.jls_signatory_log(p_signatory uuid, p_event text, p_target uuid, p_detail text)
returns void language plpgsql security definer set search_path = public as $$
declare v_actor uuid := auth.uid();
begin
  insert into public.jls_signatory_events (signatory_id, event, actor, actor_email, target_user, detail)
  values (p_signatory, p_event, v_actor, (select email from auth.users where id = v_actor), p_target, p_detail);
end $$;
revoke all on function public.jls_signatory_log(uuid, text, uuid, text) from public, anon, authenticated;

create or replace function public.jls_signatory_delegates_audit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.jls_signatory_log(new.signatory_id, 'granted', new.user_id, null);
    return new;
  end if;
  -- a cascade from a deleted signatory has nothing left to log against
  if exists (select 1 from public.jls_signatories where id = old.signatory_id) then
    perform public.jls_signatory_log(old.signatory_id, 'revoked', old.user_id, null);
  end if;
  return old;
end $$;
drop trigger if exists jls_signatory_delegates_audit on public.jls_signatory_delegates;
create trigger jls_signatory_delegates_audit after insert or delete on public.jls_signatory_delegates
  for each row execute function public.jls_signatory_delegates_audit();

-- Guard + audit on the signatory row itself.
create or replace function public.jls_signatories_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  -- A signature file must belong to this signatory ("<id>-…png"), so nobody can point a
  -- row at someone else's signature image.
  if new.signature_path is not null
     and new.signature_path not like new.id::text || '-%'
     and new.signature_path not like 'confidential/' || new.id::text || '-%' then
    raise exception 'Signature file must be uploaded for this signatory';
  end if;
  if tg_op = 'UPDATE' and v_uid is not null and not public.is_polaris_global_admin(v_uid) then
    -- The signatory editing their own row can't hand it to someone else.
    if new.user_id is distinct from old.user_id then
      raise exception 'Only a global admin can change who a signatory is';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists jls_signatories_guard on public.jls_signatories;
create trigger jls_signatories_guard before insert or update on public.jls_signatories
  for each row execute function public.jls_signatories_guard();

create or replace function public.jls_signatories_audit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.jls_signatory_log(new.id, 'created', new.user_id, new.full_name);
    return new;
  end if;
  if new.signature_path is distinct from old.signature_path then
    perform public.jls_signatory_log(new.id, 'signature_changed', null, case when new.signature_path is null then 'removed' else 'replaced' end);
  end if;
  if new.use_policy is distinct from old.use_policy then
    perform public.jls_signatory_log(new.id, 'policy_changed', null, new.use_policy);
  end if;
  if new.user_id is distinct from old.user_id then
    perform public.jls_signatory_log(new.id, 'owner_changed', new.user_id, null);
  end if;
  return new;
end $$;
drop trigger if exists jls_signatories_audit on public.jls_signatories;
create trigger jls_signatories_audit after insert or update on public.jls_signatories
  for each row execute function public.jls_signatories_audit();

-- ── Lock signatory writes ────────────────────────────────────────────────────
drop policy if exists jls_signatories_auth on public.jls_signatories;
drop policy if exists jls_signatories_read on public.jls_signatories;
create policy jls_signatories_read on public.jls_signatories for select to authenticated using (true);
drop policy if exists jls_signatories_insert on public.jls_signatories;
create policy jls_signatories_insert on public.jls_signatories for insert to authenticated
  with check (public.is_polaris_global_admin((select auth.uid())));
drop policy if exists jls_signatories_update on public.jls_signatories;
create policy jls_signatories_update on public.jls_signatories for update to authenticated
  using (public.is_polaris_global_admin((select auth.uid())) or user_id = (select auth.uid()))
  with check (public.is_polaris_global_admin((select auth.uid())) or user_id = (select auth.uid()));
drop policy if exists jls_signatories_delete on public.jls_signatories;
create policy jls_signatories_delete on public.jls_signatories for delete to authenticated
  using (public.is_polaris_global_admin((select auth.uid())));

-- ── Lock the signatures bucket (read too: a downloadable image could be pasted anywhere) ──
drop policy if exists "signatures auth read" on storage.objects;
drop policy if exists "signatures auth insert" on storage.objects;
drop policy if exists "signatures auth update" on storage.objects;
drop policy if exists "signatures auth delete" on storage.objects;
drop policy if exists "signatures staff read" on storage.objects;
drop policy if exists "signatures staff insert" on storage.objects;
drop policy if exists "signatures staff update" on storage.objects;
drop policy if exists "signatures staff delete" on storage.objects;
drop policy if exists "signatures owner read" on storage.objects;
create policy "signatures owner read" on storage.objects for select to authenticated
  using (bucket_id = 'signatures' and public.can_manage_signature_file(name, (select auth.uid())));
drop policy if exists "signatures owner insert" on storage.objects;
create policy "signatures owner insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'signatures' and public.can_manage_signature_file(name, (select auth.uid())));
drop policy if exists "signatures owner update" on storage.objects;
create policy "signatures owner update" on storage.objects for update to authenticated
  using (bucket_id = 'signatures' and public.can_manage_signature_file(name, (select auth.uid())))
  with check (bucket_id = 'signatures' and public.can_manage_signature_file(name, (select auth.uid())));
drop policy if exists "signatures owner delete" on storage.objects;
create policy "signatures owner delete" on storage.objects for delete to authenticated
  using (bucket_id = 'signatures' and public.can_manage_signature_file(name, (select auth.uid())));

-- ── DMA forms: waiting on the signatory after the last approver ──────────────
comment on column public.anchor_form_submissions.approval_status is
  'none | pending | awaiting_signatory | approved | rejected';

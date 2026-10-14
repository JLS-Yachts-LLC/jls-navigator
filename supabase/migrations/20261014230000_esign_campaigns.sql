-- Anchor — Signature Campaigns.
--
-- A campaign sends ONE document (an e-Sign template such as the Standard Tariff
-- Sheet, or a per-vessel form such as the Agency Appointment Letter) to many
-- recipients. Every recipient gets their OWN email, their OWN esign_documents
-- row and their OWN signing link — never a shared/CC'd blast. The Worker
-- (src/routes/api.esign-campaigns.ts) does the sending, one recipient per call.
--
-- Contact groups are saved lists of yachts and/or people to send campaigns to.

-- ── Contact groups ──────────────────────────────────────────────────────────
create table if not exists public.esign_contact_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- A member is a yacht (email resolved from the yacht record when added to a
-- campaign, unless an email is given here) or a person with an email.
create table if not exists public.esign_contact_group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.esign_contact_groups(id) on delete cascade,
  yacht_id uuid references public.yachts(id) on delete cascade,
  name text,
  email text,
  role text,
  created_at timestamptz not null default now(),
  constraint esign_group_member_target check (yacht_id is not null or email is not null)
);
create index if not exists esign_contact_group_members_group_idx on public.esign_contact_group_members (group_id);

-- ── Campaigns ───────────────────────────────────────────────────────────────
create sequence if not exists public.esign_campaign_seq;

create table if not exists public.esign_campaigns (
  id uuid primary key default gen_random_uuid(),
  reference text unique,
  name text not null,
  -- 'template' = an esign_templates PDF (same document for everyone)
  -- 'form'     = a per-vessel Anchor form generated for each recipient
  source_kind text not null default 'template' check (source_kind in ('template', 'form')),
  template_id uuid references public.esign_templates(id) on delete set null,
  form_key text,
  doc_title text not null,
  subject text not null,
  heading text,
  note text,
  sign_off text,
  include_pdf boolean not null default true,
  allow_esign boolean not null default true,
  expires_days integer not null default 30 check (expires_days between 1 and 365),
  status text not null default 'draft' check (status in ('draft', 'sending', 'sent', 'cancelled')),
  sent_at timestamptz,
  created_by uuid,
  created_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint esign_campaign_delivery check (include_pdf or allow_esign),
  constraint esign_campaign_source check (
    (source_kind = 'template' and template_id is not null) or
    (source_kind = 'form' and form_key is not null)
  )
);

create or replace function public.esign_campaign_set_ref()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.reference is null then
    new.reference := 'CMP-' || lpad(nextval('public.esign_campaign_seq')::text, 4, '0');
  end if;
  return new;
end $$;

drop trigger if exists esign_campaign_ref on public.esign_campaigns;
create trigger esign_campaign_ref before insert on public.esign_campaigns
  for each row execute function public.esign_campaign_set_ref();

create table if not exists public.esign_campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.esign_campaigns(id) on delete cascade,
  yacht_id uuid references public.yachts(id) on delete set null,
  name text not null,
  email text not null,
  role text,
  -- pending → sent | failed | held (client email switched off) | cancelled
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'held', 'cancelled')),
  esign_document_id uuid references public.esign_documents(id) on delete set null,
  error text,
  sent_at timestamptz,
  last_reminded_at timestamptz,
  remind_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists esign_campaign_recipients_campaign_idx on public.esign_campaign_recipients (campaign_id);
-- The same person may sign for several yachts, but never twice for the same one.
create unique index if not exists esign_campaign_recipients_uq
  on public.esign_campaign_recipients (campaign_id, lower(email), coalesce(yacht_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- ── esign_documents: link back + paper-signed copies ───────────────────────
alter table public.esign_documents add column if not exists campaign_id uuid references public.esign_campaigns(id) on delete set null;
alter table public.esign_documents add column if not exists yacht_id uuid references public.yachts(id) on delete set null;
-- 'esign' (drawn on the signing page) | 'upload' (signer uploaded a paper-signed
-- copy) | 'staff_upload' (staff attached a copy the client returned by email)
alter table public.esign_documents add column if not exists signed_method text;
alter table public.esign_documents add column if not exists allow_esign boolean not null default true;
create index if not exists esign_documents_campaign_idx on public.esign_documents (campaign_id) where campaign_id is not null;

-- ── updated_at triggers ─────────────────────────────────────────────────────
drop trigger if exists esign_contact_groups_updated on public.esign_contact_groups;
create trigger esign_contact_groups_updated before update on public.esign_contact_groups
  for each row execute function public.set_updated_at();
drop trigger if exists esign_campaigns_updated on public.esign_campaigns;
create trigger esign_campaigns_updated before update on public.esign_campaigns
  for each row execute function public.set_updated_at();
drop trigger if exists esign_campaign_recipients_updated on public.esign_campaign_recipients;
create trigger esign_campaign_recipients_updated before update on public.esign_campaign_recipients
  for each row execute function public.set_updated_at();

-- ── RLS: staff only (portal captains + guests are fenced out) ──────────────
do $$
declare t text;
begin
  foreach t in array array['esign_contact_groups', 'esign_contact_group_members', 'esign_campaigns', 'esign_campaign_recipients']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists staff_manage on public.%I', t);
    execute format('create policy staff_manage on public.%I for all to authenticated using (not public.is_portal_captain()) with check (not public.is_portal_captain())', t);
    execute format('drop policy if exists portal_captain_denied on public.%I', t);
    execute format('create policy portal_captain_denied on public.%I as restrictive for all to authenticated using (not public.is_portal_captain()) with check (not public.is_portal_captain())', t);
  end loop;
end $$;

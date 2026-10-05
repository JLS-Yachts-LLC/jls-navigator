-- Communications → WhatsApp ─────────────────────────────────────────────────
--
-- Messaging JLS's own clients on WhatsApp through the WhatsApp Business
-- Platform (Cloud API), within Meta's WhatsApp Business Messaging Policy:
--   • nobody is messaged without recorded opt-in that names JLS Yachts;
--   • every opt-out — a STOP reply, the "Stop promotions" button, Meta's
--     preference webhook, or someone telling staff — is honoured;
--   • business-initiated messages only ever use Meta-approved templates.
-- Consent is enforced here in the database, not trusted to the UI: the consent
-- columns can only change through wa_record_consent(), which writes an
-- append-only audit row every time.

insert into public.modules (name, display_name, active, icon)
values ('communications', 'Communications', true, 'brand-whatsapp')
on conflict (name) do nothing;

-- ── Contacts ─────────────────────────────────────────────────────────────────

create table if not exists public.wa_contacts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text,
  -- E.164, e.g. +971501234567. Imported numbers are best-effort; the client
  -- confirms their own on the opt-in page (phone_confirmed).
  phone_e164 text check (phone_e164 is null or phone_e164 ~ '^\+[1-9][0-9]{6,14}$'),
  phone_confirmed boolean not null default false,
  yacht_id uuid references public.yachts(id) on delete set null,
  source text not null default 'manual' check (source in ('manual', 'vessel', 'agency_contact')),
  source_id uuid,
  consent_status text not null default 'none'
    check (consent_status in ('none', 'invited', 'opted_in', 'opted_out')),
  -- Per-category consent, as Meta recommends: operational updates (Utility
  -- templates) and news & offers (Marketing templates) are agreed separately.
  consent_updates boolean not null default false,
  consent_marketing boolean not null default false,
  consent_at timestamptz,
  opted_out_at timestamptz,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists wa_contacts_source_uq on public.wa_contacts (source, source_id) where source_id is not null;
create index if not exists wa_contacts_phone_idx on public.wa_contacts (phone_e164) where phone_e164 is not null;
create index if not exists wa_contacts_yacht_idx on public.wa_contacts (yacht_id);

-- Append-only proof of every consent change. Never updated, never deleted.
create table if not exists public.wa_consent_events (
  id bigserial primary key,
  contact_id uuid not null references public.wa_contacts(id) on delete cascade,
  action text not null check (action in ('invited', 'opted_in', 'opted_out', 'updated')),
  consent_updates boolean,
  consent_marketing boolean,
  channel text not null check (channel in (
    'email_link', 'staff', 'whatsapp_reply', 'whatsapp_button', 'meta_preferences', 'system')),
  -- Exactly what the person was shown when they agreed.
  wording_version text,
  wording text,
  phone_e164 text,
  ip text,
  user_agent text,
  actor_user_id uuid,
  actor_email text,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists wa_consent_events_contact_idx on public.wa_consent_events (contact_id, created_at desc);

-- Opt-in emails. The token is stored only as a hash.
create table if not exists public.wa_optin_invites (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.wa_contacts(id) on delete cascade,
  token_hash text not null unique,
  email text not null,
  sent_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  sent_by uuid
);
create index if not exists wa_optin_invites_contact_idx on public.wa_optin_invites (contact_id);

-- ── Templates ────────────────────────────────────────────────────────────────

create table if not exists public.wa_templates (
  id uuid primary key default gen_random_uuid(),
  -- Meta's rules: lowercase letters, numbers and underscores.
  name text not null check (name ~ '^[a-z0-9_]{1,512}$'),
  language text not null default 'en',
  category text not null check (category in ('MARKETING', 'UTILITY')),
  header_text text,
  body_text text not null,
  footer_text text,
  -- Example values for {{1}}, {{2}}… — Meta requires them for approval.
  sample_values jsonb not null default '[]'::jsonb,
  status text not null default 'draft'
    check (status in ('draft', 'pending', 'approved', 'rejected', 'paused', 'disabled')),
  meta_template_id text,
  rejection_reason text,
  submitted_at timestamptz,
  status_updated_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (name, language)
);

-- ── Lists ────────────────────────────────────────────────────────────────────
-- 'broadcast' is a private audience Polaris messages one-to-one. 'group' is
-- reserved for real WhatsApp groups (Meta's Groups API) in a later phase.

create table if not exists public.wa_lists (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  kind text not null default 'broadcast' check (kind in ('broadcast', 'group')),
  archived boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Membership with history: removing someone sets removed_at rather than
-- deleting the row, so who was in a list, and when, is never lost.
create table if not exists public.wa_list_members (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.wa_lists(id) on delete cascade,
  contact_id uuid not null references public.wa_contacts(id) on delete cascade,
  added_at timestamptz not null default now(),
  added_by uuid,
  removed_at timestamptz,
  removed_by uuid,
  remove_reason text
);
create unique index if not exists wa_list_members_active_uq
  on public.wa_list_members (list_id, contact_id) where removed_at is null;
create index if not exists wa_list_members_contact_idx on public.wa_list_members (contact_id);

-- ── Sends ────────────────────────────────────────────────────────────────────

create table if not exists public.wa_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  list_id uuid references public.wa_lists(id) on delete set null,
  template_id uuid references public.wa_templates(id) on delete set null,
  -- Values for {{1}}, {{2}}…; "{{name}}" inside a value becomes the contact's name.
  variables jsonb not null default '[]'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'sending', 'sent', 'failed', 'cancelled')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);

-- One row per intended recipient, including the ones skipped and why — so a
-- send can always answer "did X get it, and if not, why not".
create table if not exists public.wa_messages (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references public.wa_campaigns(id) on delete cascade,
  contact_id uuid references public.wa_contacts(id) on delete set null,
  phone_e164 text,
  wa_message_id text unique,
  status text not null default 'queued'
    check (status in ('queued', 'skipped', 'sent', 'delivered', 'read', 'failed')),
  skip_reason text,
  error_code text,
  error_message text,
  queued_at timestamptz not null default now(),
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  failed_at timestamptz
);
create index if not exists wa_messages_campaign_idx on public.wa_messages (campaign_id, status);
create index if not exists wa_messages_contact_idx on public.wa_messages (contact_id);

create table if not exists public.wa_inbound (
  id uuid primary key default gen_random_uuid(),
  wa_message_id text unique,
  from_phone text not null,
  contact_id uuid references public.wa_contacts(id) on delete set null,
  type text,
  body text,
  button_payload text,
  -- What Polaris did with it: 'opt_out', 'marketing_opt_out', or null.
  action text,
  received_at timestamptz not null default now(),
  raw jsonb
);
create index if not exists wa_inbound_received_idx on public.wa_inbound (received_at desc);

-- ── updated_at ───────────────────────────────────────────────────────────────

do $$
declare t text;
begin
  foreach t in array array['wa_contacts', 'wa_templates', 'wa_lists'] loop
    execute format('drop trigger if exists %1$s_updated_at on public.%1$s', t);
    execute format('create trigger %1$s_updated_at before update on public.%1$s
       for each row execute function public.set_updated_at()', t);
  end loop;
end;
$$;

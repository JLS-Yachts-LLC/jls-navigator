-- Migration 079: Generic ORBIT documents + approvals
-- POLARIS_ORBIT_MODULE.md specs an orbit_documents table but it was never
-- actually built — a genuine, real gap across the whole ORBIT module, not
-- just Bunkering. Built here as generic/service-agnostic tables keyed to
-- orbit_service_requests so every one of the 11 categories benefits, not
-- just Bunkering — matching the same "generic, doesn't change when the
-- Service Builder arrives" framing the vendor package used for its
-- (fictional-table) rfq_documents/rfq_approvals.

create table if not exists public.orbit_documents (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.orbit_service_requests(id) on delete cascade,
  document_type text not null,   -- e.g. 'masters_declaration', 'fuel_analysis_request', 'safety_checklist', 'delivery_receipt'
  is_required boolean not null default true,
  file_path text,
  uploaded_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.orbit_approvals (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.orbit_service_requests(id) on delete cascade,
  approver_role text not null check (approver_role in (
    'captain', 'chief_engineer', 'owner_representative', 'marina', 'port_authority', 'operations_manager'
  )),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  approved_by_name text,
  approved_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_orbit_documents_request on public.orbit_documents (request_id);
create index if not exists idx_orbit_approvals_request on public.orbit_approvals (request_id);

alter table public.orbit_documents enable row level security;
alter table public.orbit_approvals enable row level security;

-- Read gated to orbit module access (mirrors has_module_permission from
-- Crew Placement, migration 074) rather than the vendor package's
-- fictional auth.jwt()->>'role' claim.
create policy orbit_documents_select on public.orbit_documents
  for select using (public.has_module_permission(auth.uid(), 'orbit', 'view'));
create policy orbit_approvals_select on public.orbit_approvals
  for select using (public.has_module_permission(auth.uid(), 'orbit', 'view'));

-- No direct write policy — mutation via add_orbit_document /
-- record_orbit_approval in migration 084.

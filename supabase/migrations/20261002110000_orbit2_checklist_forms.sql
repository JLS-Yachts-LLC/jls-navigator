-- Managed Boats: a library of checklist forms, added by dropping in the PDF.
--
-- 2 Oct 2026. Chris has more checklists to add beyond the three RYA forms,
-- and each should fill itself from the Polaris ticks the way the RYA forms
-- do. Instead of a hand-mapped one-off per form, a checklist is now a row in
-- orbit2_checklist_forms: the PDF (shipped or uploaded), its header fields
-- (where boat name, date, inspector… are written) and its items, each with
-- the page and PDF-point position of its Check cell. Polaris reads a dropped
-- PDF, proposes the items and positions, and an admin corrects them before
-- saving.
--
-- The three RYA forms become the first rows; their items are linked to them.
-- A form can also stand in for the DMA or FMA checklist (regime), or be an
-- "additional" checklist assigned to individual boats.

create table if not exists public.orbit2_checklist_forms (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  code          text,
  -- Set when the form is a boat's RYA / DMA / FMA checklist; null for additional checklists.
  regime        text check (regime is null or regime in ('dma', 'fma', 'rya')),
  category      text check (category is null or category in ('pwc', 'powerboat', 'cruising')),
  -- '/forms/…' for a form shipped with the app, a storage reference for an uploaded one.
  pdf_ref       text,
  page_count    integer,
  -- [{ key, label, page, x, y, maxWidth, prefix? }] — where each header value is written.
  header_fields jsonb not null default '[]'::jsonb,
  active        boolean not null default true,
  created_by    uuid references auth.users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.orbit2_checklist_templates
  add column if not exists form_id uuid references public.orbit2_checklist_forms(id) on delete cascade;
alter table public.orbit2_checklist_templates alter column regime drop not null;
create index if not exists orbit2_checklist_templates_form_idx on public.orbit2_checklist_templates (form_id, sort_order);

-- Which additional checklists a boat carries.
create table if not exists public.orbit2_boat_checklist_forms (
  boat_id    uuid not null references public.orbit2_boats(id) on delete cascade,
  form_id    uuid not null references public.orbit2_checklist_forms(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (boat_id, form_id)
);

-- A job can carry any library checklist, not only the RYA / DMA / FMA ones.
alter table public.orbit2_boat_tasks
  add column if not exists checklist_form_id uuid references public.orbit2_checklist_forms(id) on delete set null;
alter table public.orbit2_boat_tasks drop constraint if exists orbit2_boat_tasks_kind_check;
alter table public.orbit2_boat_tasks add constraint orbit2_boat_tasks_kind_check
  check (kind in ('maintenance', 'defect', 'inventory', 'booked', 'rya_checklist', 'dma_checklist', 'fma_checklist', 'checklist'));

alter table public.orbit2_checklist_forms enable row level security;
alter table public.orbit2_boat_checklist_forms enable row level security;
do $policies$
declare t text;
begin
  foreach t in array array['orbit2_checklist_forms', 'orbit2_boat_checklist_forms'] loop
    execute format('drop policy if exists authenticated_all on public.%I', t);
    execute format(
      'create policy authenticated_all on public.%I for all to authenticated '
      || 'using ((select auth.role()) = ''authenticated'') '
      || 'with check ((select auth.role()) = ''authenticated'')', t);
    execute format('drop policy if exists portal_captain_block on public.%I', t);
    execute format(
      'create policy portal_captain_block on public.%I for all to authenticated '
      || 'using ((select not public.is_portal_captain())) '
      || 'with check ((select not public.is_portal_captain()))', t);
  end loop;
end $policies$;

-- The three RYA forms, with the header positions that were hand-mapped for them.
insert into public.orbit2_checklist_forms (name, code, regime, category, pdf_ref, page_count, header_fields)
select v.name, v.code, 'rya', v.category, v.pdf_ref, v.pages, v.fields::jsonb
from (values
  ('RYA Training Checklist — Personal Water Craft', 'TCPW', 'pwc', '/forms/rya/pwc.pdf', 1,
   '[{"key":"rtcName","label":"RTC name","page":1,"x":100,"y":670,"maxWidth":220},
     {"key":"boatName","label":"Name of boat","page":1,"x":330,"y":670,"maxWidth":240,"prefix":"Boat: "},
     {"key":"inspectionDate","label":"Inspection date","page":1,"x":122,"y":654,"maxWidth":120},
     {"key":"inspectorName","label":"Inspector''s name","page":1,"x":130,"y":642,"maxWidth":120}]'),
  ('RYA Training Checklist — Powerboat', 'TCP', 'powerboat', '/forms/rya/powerboat.pdf', 6,
   '[{"key":"rtcName","label":"RTC name","page":1,"x":118,"y":651,"maxWidth":230},
     {"key":"boatName","label":"Name of boat","page":1,"x":118,"y":635,"maxWidth":230},
     {"key":"inspectionDate","label":"Inspection date","page":1,"x":458,"y":635,"maxWidth":120},
     {"key":"boatType","label":"Boat type","page":1,"x":118,"y":619,"maxWidth":230},
     {"key":"persons","label":"No. of persons","page":1,"x":458,"y":619,"maxWidth":120},
     {"key":"inspectionPlace","label":"Inspection place","page":1,"x":126,"y":606,"maxWidth":230},
     {"key":"inspectorName","label":"Inspector''s name","page":1,"x":462,"y":606,"maxWidth":120}]'),
  ('RYA Training Checklist — Cruising', 'TCC', 'cruising', '/forms/rya/cruising.pdf', 7,
   '[{"key":"rtcName","label":"RTC name","page":1,"x":112,"y":674,"maxWidth":230},
     {"key":"boatName","label":"Boat name","page":1,"x":112,"y":661,"maxWidth":230},
     {"key":"inspectionDate","label":"Inspection date","page":1,"x":392,"y":661,"maxWidth":120},
     {"key":"boatType","label":"Boat type","page":1,"x":112,"y":648,"maxWidth":230},
     {"key":"persons","label":"No. of persons","page":1,"x":392,"y":648,"maxWidth":120},
     {"key":"inspectionPlace","label":"Inspection place","page":1,"x":118,"y":636,"maxWidth":230},
     {"key":"inspectorName","label":"Inspector''s name","page":1,"x":398,"y":636,"maxWidth":120}]')
) as v(name, code, category, pdf_ref, pages, fields)
where not exists (select 1 from public.orbit2_checklist_forms f where f.regime = 'rya' and f.category = v.category);

update public.orbit2_checklist_templates t set form_id = f.id
from public.orbit2_checklist_forms f
where t.regime = 'rya' and f.regime = 'rya' and t.category = f.category and t.form_id is null;

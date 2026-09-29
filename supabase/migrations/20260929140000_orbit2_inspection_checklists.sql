-- Managed Boats: which inspections a boat needs, and the checklist for each.
--
-- Client requirement, 29 Sep 2026. Not every boat needs every regime — a jet
-- ski needs RYA and DMA but not FMA — and the RYA checklist differs by the
-- craft's classification (Personal Water Craft / Powerboat / Cruising). The
-- boat's profile therefore shows the actual checklist items required for each
-- inspection, ticked off per boat, rather than just a slot to attach a file.

alter table public.orbit2_boats
  add column if not exists inspections_required text[] not null default '{dma,fma,rya}',
  add column if not exists rya_checklist text
    check (rya_checklist is null or rya_checklist in ('pwc', 'powerboat', 'cruising'));

-- The checklist items themselves — one template per regime (and per RYA category).
-- The office edits these in the app; the starter rows below are placeholders to
-- be replaced with the official lists.
create table if not exists public.orbit2_checklist_templates (
  id          uuid primary key default gen_random_uuid(),
  regime      text not null check (regime in ('dma', 'fma', 'rya')),
  category    text check (category is null or category in ('pwc', 'powerboat', 'cruising')),
  item        text not null,
  sort_order  integer not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
create index if not exists orbit2_checklist_templates_regime_idx on public.orbit2_checklist_templates (regime, category, sort_order);

-- Each boat's tick against each item, for the current inspection.
create table if not exists public.orbit2_boat_checklist (
  id           uuid primary key default gen_random_uuid(),
  boat_id      uuid not null references public.orbit2_boats(id) on delete cascade,
  template_id  uuid not null references public.orbit2_checklist_templates(id) on delete cascade,
  checked      boolean not null default false,
  checked_at   timestamptz,
  checked_by   text,
  remarks      text,
  unique (boat_id, template_id)
);

alter table public.orbit2_checklist_templates enable row level security;
alter table public.orbit2_boat_checklist enable row level security;
do $policies$
declare t text;
begin
  foreach t in array array['orbit2_checklist_templates', 'orbit2_boat_checklist'] loop
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

-- The three boats under management today, as the client described them.
update public.orbit2_boats set inspections_required = '{dma,rya}',     rya_checklist = 'pwc'       where upper(name) = 'IMPERIUM';
update public.orbit2_boats set inspections_required = '{dma,fma,rya}', rya_checklist = 'powerboat' where upper(name) = 'MV TORNADO';
update public.orbit2_boats set inspections_required = '{dma,fma,rya}', rya_checklist = 'cruising'  where upper(name) = 'SOUTHERN BIGHT';

-- Starter checklist items. Generic vessel-safety points so the section is not
-- empty on day one; the office replaces them with the official lists in the app.
insert into public.orbit2_checklist_templates (regime, category, item, sort_order)
select 'dma', null, item, ord from unnest(array[
  'Registration number and markings displayed', 'Hull condition — no damage or leaks',
  'Navigation lights working', 'Sound signal (horn / whistle)', 'Fire extinguishers in date and accessible',
  'Lifejackets for maximum persons on board', 'Bilge pump operational', 'Anchor and rode secured',
  'Steering and engine controls', 'Fuel system and shut-off valve', 'Battery secured and isolator fitted',
  'VHF radio operational', 'First aid kit complete'
]) with ordinality as t(item, ord)
where not exists (select 1 from public.orbit2_checklist_templates where regime = 'dma');

insert into public.orbit2_checklist_templates (regime, category, item, sort_order)
select 'fma', null, item, ord from unnest(array[
  'Certificate of registry on board', 'Crew documentation and licences', 'Life-saving appliances complete and in date',
  'Fire-fighting equipment serviced', 'Navigation equipment and lights', 'Machinery and engine room condition',
  'Pollution prevention — oily waste and garbage', 'Emergency procedures posted'
]) with ordinality as t(item, ord)
where not exists (select 1 from public.orbit2_checklist_templates where regime = 'fma');

insert into public.orbit2_checklist_templates (regime, category, item, sort_order)
select 'rya', 'pwc', item, ord from unnest(array[
  'Kill cord and lanyard in good condition', 'Hull, seat and grab handles secure', 'Steering nozzle free and responsive',
  'Throttle returns to idle', 'Buoyancy aid for each rider', 'Whistle attached to buoyancy aid', 'Fire extinguisher (if fitted)',
  'Engine cover secure and drain plugs fitted', 'Fuel level and battery charge', 'Towline on board'
]) with ordinality as t(item, ord)
where not exists (select 1 from public.orbit2_checklist_templates where regime = 'rya' and category = 'pwc');

insert into public.orbit2_checklist_templates (regime, category, item, sort_order)
select 'rya', 'powerboat', item, ord from unnest(array[
  'Kill cord fitted and working', 'Lifejackets for all on board', 'Flares in date', 'Fire extinguishers in date',
  'Anchor and warp', 'Paddles / oars', 'Bailer or bilge pump', 'VHF radio', 'Navigation lights', 'First aid kit',
  'Throwline', 'Towline', 'Fuel level and spare', 'Engine checks — oil, coolant, belts', 'Tool kit and spares'
]) with ordinality as t(item, ord)
where not exists (select 1 from public.orbit2_checklist_templates where regime = 'rya' and category = 'powerboat');

insert into public.orbit2_checklist_templates (regime, category, item, sort_order)
select 'rya', 'cruising', item, ord from unnest(array[
  'Lifejackets and harnesses for all on board', 'Liferaft in service date', 'Flares in date', 'Fire extinguishers and fire blanket',
  'VHF DSC radio and EPIRB', 'Navigation lights and shapes', 'Anchors and cables', 'Bilge pumps — manual and electric',
  'Charts / GPS and passage plan', 'Radar reflector', 'First aid kit', 'Gas system checked for leaks',
  'Engine and fuel system', 'Steering and emergency tiller', 'Seacocks and hull fittings', 'Man-overboard recovery equipment'
]) with ordinality as t(item, ord)
where not exists (select 1 from public.orbit2_checklist_templates where regime = 'rya' and category = 'cruising');

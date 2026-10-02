-- Managed Boats: RYA Cruising checklist — add "Boom preventer attachment & line".
--
-- 30 Sep 2026. The RYA's own Cruising form has this line under Mast & Boom
-- (TCC13); the team's transcription did not. Slotted in after "Standing
-- rigging…" so the Polaris list reads in the form's order, with its tick
-- position on page 1 of the PDF.
update public.orbit2_checklist_templates
   set sort_order = sort_order + 1
 where regime = 'rya' and category = 'cruising' and sort_order >= 23;

insert into public.orbit2_checklist_templates (regime, category, section, item, ref, sort_order, pdf_page, pdf_x, pdf_y)
select 'rya', 'cruising', 'Sailing Vessels only — Mast & Boom', 'Boom preventer attachment & line', 'TCC13', 23, 1, 258, 300
 where not exists (
   select 1 from public.orbit2_checklist_templates
    where regime = 'rya' and category = 'cruising' and item = 'Boom preventer attachment & line');

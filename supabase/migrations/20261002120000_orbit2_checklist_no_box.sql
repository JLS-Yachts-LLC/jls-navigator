-- Managed Boats checklists: forms with a Yes box and a No box on every row.
--
-- 2 Oct 2026. The DMA "Touring Boats >8 to <12m" inspection checklist has no
-- Check column; each row carries printed Yes ☐ and No ☐ boxes. A tick goes in
-- the Yes box (pdf_x / pdf_y, as before); this records where the No box is on
-- the same line, so "mark items not ticked with ✗" puts the cross in it.
alter table public.orbit2_checklist_templates add column if not exists pdf_no_x numeric;

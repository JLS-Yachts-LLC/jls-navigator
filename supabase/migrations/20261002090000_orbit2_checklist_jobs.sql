-- Managed Boats: inspection checklists as assignable jobs, with notes and photos per line.
--
-- Client request, 1 Oct 2026. "Assign Team" on a checklist raises a job of a
-- new kind — RYA / DMA / FMA Checklist — that sits on the Jobs board and on the
-- assigned crew's phone, where the checklist itself is worked: tick, remark
-- and photograph each line. The photo lives on the boat's checklist row so the
-- office sees it in View checklist and it prints on the generated RYA form.
alter table public.orbit2_boat_tasks drop constraint if exists orbit2_boat_tasks_kind_check;
alter table public.orbit2_boat_tasks add constraint orbit2_boat_tasks_kind_check
  check (kind in ('maintenance', 'defect', 'inventory', 'booked', 'rya_checklist', 'dma_checklist', 'fma_checklist'));

alter table public.orbit2_boat_checklist add column if not exists image_ref text;

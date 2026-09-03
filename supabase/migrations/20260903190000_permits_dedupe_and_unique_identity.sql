-- Remove the duplicate permits the old cross-list matching created, then make the
-- duplication impossible.
--
-- The previous sync matched SharePoint items on a bare item id shared across seven
-- lists, so the same item was inserted repeatedly: 5,172 permits held only 3,790
-- distinct (list, item) identities. The oldest row per identity wins, matching the
-- new matching code, which claims the oldest candidate so repeated syncs converge
-- on one row instead of taking turns rewriting several.
--
-- Applied 2026-09-03. Recorded here for the migration history; the live database
-- was changed directly (this deploy pipeline does not run migrations).
--
-- Reversible: every removed row was copied to permits_dedupe_backup_20260903
-- first, and a handful of fields present ONLY on a newer duplicate were merged
-- into the surviving row before deletion, so the cleanup lost no data:
--   dma_phase 61, jls_quotation_number 20, expiry_date 4,
--   preferred_inspection_date 4, applied_by 3, document_url 2,
--   yacht_id 1, email_sent_at 1.

-- 1. Snapshot the losers.
create table if not exists public.permits_dedupe_backup_20260903 as
with ranked as (
  select *, row_number() over (partition by sharepoint_list_name, sharepoint_item_id
                               order by created_at) as rn
  from public.permits
  where sharepoint_list_name is not null and sharepoint_item_id is not null
)
select * from ranked where rn > 1;

comment on table public.permits_dedupe_backup_20260903 is
  'Full copy of the 1,382 duplicate permit rows removed on 2026-09-03, kept so the dedupe is reversible. The oldest row per (sharepoint_list_name, sharepoint_item_id) was kept.';

-- 2. Carry forward anything held only by a newer duplicate.
with ranked as (
  select *, row_number() over (partition by sharepoint_list_name, sharepoint_item_id
                               order by created_at) as rn
  from public.permits
  where sharepoint_list_name is not null and sharepoint_item_id is not null
),
w as (select id, sharepoint_list_name, sharepoint_item_id from ranked where rn = 1),
rescued as (
  select sharepoint_list_name, sharepoint_item_id,
    (array_agg(expiry_date               order by created_at) filter (where expiry_date is not null))[1]               as expiry_date,
    (array_agg(yacht_id                  order by created_at) filter (where yacht_id is not null))[1]                  as yacht_id,
    (array_agg(jls_quotation_number      order by created_at) filter (where jls_quotation_number is not null))[1]      as jls_quotation_number,
    (array_agg(applied_by                order by created_at) filter (where applied_by is not null))[1]                as applied_by,
    (array_agg(document_url              order by created_at) filter (where document_url is not null))[1]              as document_url,
    (array_agg(email_sent_at             order by created_at) filter (where email_sent_at is not null))[1]             as email_sent_at,
    (array_agg(preferred_inspection_date order by created_at) filter (where preferred_inspection_date is not null))[1] as preferred_inspection_date,
    (array_agg(dma_phase                 order by created_at) filter (where dma_phase is not null))[1]                 as dma_phase
  from ranked where rn > 1
  group by 1, 2
)
update public.permits p
   set expiry_date               = coalesce(p.expiry_date, r.expiry_date),
       yacht_id                  = coalesce(p.yacht_id, r.yacht_id),
       jls_quotation_number      = coalesce(p.jls_quotation_number, r.jls_quotation_number),
       applied_by                = coalesce(p.applied_by, r.applied_by),
       document_url              = coalesce(p.document_url, r.document_url),
       email_sent_at             = coalesce(p.email_sent_at, r.email_sent_at),
       preferred_inspection_date = coalesce(p.preferred_inspection_date, r.preferred_inspection_date),
       dma_phase                 = coalesce(p.dma_phase, r.dma_phase)
  from w join rescued r using (sharepoint_list_name, sharepoint_item_id)
 where p.id = w.id;

-- 3. Remove the duplicates.
with ranked as (
  select id, row_number() over (partition by sharepoint_list_name, sharepoint_item_id
                                order by created_at) as rn
  from public.permits
  where sharepoint_list_name is not null and sharepoint_item_id is not null
)
delete from public.permits p using ranked r where p.id = r.id and r.rn > 1;

-- 4. Now that the data is sound, stop it ever happening again.
create unique index if not exists permits_sp_identity_uniq
  on public.permits (sharepoint_list_name, sharepoint_item_id)
  where sharepoint_list_name is not null and sharepoint_item_id is not null;

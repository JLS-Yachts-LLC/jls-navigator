-- Give a synced permit an identity that is unique to the list it came from.
--
-- Seven SharePoint lists sync into `permits`, and SharePoint item ids are
-- sequential PER LIST — so Gate Pass item 5 and TDRA item 5 are both "5". The
-- sync matched on the bare id across every permit, so each list overwrote the
-- other lists' rows: 3,524 permits carried a sharepoint_item_id but only 1,676
-- of those ids were distinct. Within an hour of the audit trail going live it
-- recorded 3,993 field-level edits over 485 permits, every one changing
-- permit_type. See the matching rewrite in _syncPermits.
--
-- Identity is therefore (sharepoint_list_name, sharepoint_item_id).

alter table public.permits
  add column if not exists sharepoint_list_name text;

comment on column public.permits.sharepoint_list_name is
  'The SharePoint list this permit came from. Item ids are only unique within a list, so identity is (sharepoint_list_name, sharepoint_item_id).';

-- Backfill from permit_type, which maps 1:1 to a list. permit_type is itself
-- unreliable on rows the old matching mangled, so this is a starting point, not a
-- guarantee — but every match path in the new code is scoped to one list or type,
-- so a wrong guess can now only cause a duplicate, never a cross-list overwrite.
update public.permits set sharepoint_list_name = case permit_type
    when 'gate_pass'           then 'Gate Pass'
    when 'tdra'                then 'TDRA'
    when 'sanitation'          then 'Sanitation'
    when 'navigation_license'  then 'Navigation License'
    when 'dma'                 then 'DMA Permits'
    when 'cruising_tenders'    then 'Cruising Permit Tenders and Appurtenances'
    when 'cruising_mothership' then 'Cruising Permit Mothership'
  end
 where sharepoint_item_id is not null
   and sharepoint_list_name is null
   and permit_type in ('gate_pass','tdra','sanitation','navigation_license','dma',
                       'cruising_tenders','cruising_mothership');

create index if not exists permits_sp_identity_idx
  on public.permits (sharepoint_list_name, sharepoint_item_id);

-- NOTE: the matching UNIQUE index is deliberately NOT created yet — the existing
-- data already violates it (e.g. gate_pass holds 2,570 rows with only 1,467
-- distinct ids), because the old matching inserted the same SharePoint item many
-- times over. Add it once those duplicates are reconciled:
--
--   create unique index concurrently permits_sp_identity_uniq
--     on public.permits (sharepoint_list_name, sharepoint_item_id)
--     where sharepoint_list_name is not null and sharepoint_item_id is not null;

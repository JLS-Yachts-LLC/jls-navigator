-- PRMT (DMA Foreign Visitor Permit) copies — step 1 of the clean-up. NOT RUN; needs Matt's go-ahead.
--
-- The pre-3-Sep push POSTed every DMA permit as a new item into every permit list, and the
-- pull brought them back as gate passes, navigation licences, cruising and sanitation permits.
-- This step only backs up and fills; it removes nothing. Removal is step 2 (Sync Centre →
-- "DMA permits copied into other lists" → apply), which deletes each copy's SharePoint item
-- and Polaris row together, after re-checking SharePoint live.

-- 1. Back up every PRMT row, plus the four cruising-permit copies at Gate Pass 1662/1663/1664/1670.
create table if not exists public.permits_prmt_copies_backup_20261020 as
select * from public.permits
 where permit_number ilike '%prmt%'
    or (sharepoint_list_name = 'Gate Pass' and sharepoint_item_id in ('1662','1663','1664','1670'));

-- 2. Four DMA permits have no document in Polaris, but a gate-pass copy staff made in August
--    carries the Foreign Visitor Permit PDF and the quotation/applied-by details. Fill the
--    DMA permit's blanks from that copy (never overwrites a value it already has).
--    PRMT202601519 has two copies (1658: Q26-00955, exp 10 Nov; 1665: Q26-01557, exp 7 Jan 2027);
--    1665 matches the PDF name ("07Jan2027"), so it wins.
update public.permits k set
  document_url         = coalesce(k.document_url, c.document_url),
  expiry_date          = coalesce(k.expiry_date, c.expiry_date),
  jls_quotation_number = coalesce(k.jls_quotation_number, c.jls_quotation_number),
  applied_by           = coalesce(k.applied_by, c.applied_by),
  created_by           = coalesce(k.created_by, c.created_by)
from (values ('13','1669'), ('12','1672'), ('21','1660'), ('19','1665')) v(dma_item, gp_item)
join public.permits c on c.sharepoint_list_name = 'Gate Pass' and c.sharepoint_item_id = v.gp_item
where k.sharepoint_list_name = 'DMA Permits' and k.sharepoint_item_id = v.dma_item
  and k.permit_type = 'dma'
  and upper(regexp_replace(k.permit_number, '\s', '', 'g')) = upper(regexp_replace(c.permit_number, '\s', '', 'g'));
-- expect: UPDATE 4

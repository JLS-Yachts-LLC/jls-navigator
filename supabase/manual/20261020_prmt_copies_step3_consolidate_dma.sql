-- PRMT clean-up step 3 — make each DMA Foreign Visitor Permit ONE Polaris row linked to ONE
-- DMA Permits list item. NOT RUN: written 20 Oct 2026, needs Matt's go-ahead.
-- Every row touched is already in permits_prmt_copies_backup_20261020 (step 1).
--
-- Why (from the PRMT census, /api/sharepoint/permits-repair?job=prmt-census, 20 Oct 2026):
--  • 18 DMA permits (the staff-made ones with the PDF) are linked to DMA item ids 133/249–287
--    that no longer hold them; their DMA list entry is item 16/20/22/32–69.
--  • 5 doc-less duplicate DMA rows were pulled in today from DMA items 6, 7, 8, 20, 22.
--  • 4 DMA permits (1565, 1582, 1584, 1590) have no DMA list item at all, and sit dirty since 19 Oct
--    because their push PATCHes an item that doesn't exist.
--  • 13 permits exist in Polaris only as a Gate Pass copy; 12 of them have a DMA list item, 1423 none.
-- After this, the Sync Centre "DMA permits copied into other lists" preview offers the remaining
-- copies (their Gate Pass/Nav/Tenders/Mothership items and the second DMA list items) for removal.

begin;
-- a) fold the 5 doc-less duplicate DMA rows into the DMA permit holding the PDF, then drop them
with pairs(dup_item, keep_item) as (values ('6','11'),('7','18'),('8','14'),('20','249'),('22','133'))
update permits k set
  expiry_date = coalesce(k.expiry_date, d.expiry_date), issue_date = coalesce(k.issue_date, d.issue_date),
  jls_quotation_number = coalesce(k.jls_quotation_number, d.jls_quotation_number), applied_by = coalesce(k.applied_by, d.applied_by),
  yacht_id = coalesce(k.yacht_id, d.yacht_id), holder_name = coalesce(k.holder_name, d.holder_name), contact_email = coalesce(k.contact_email, d.contact_email)
from pairs p join permits d on d.permit_type='dma' and d.sharepoint_list_name='DMA Permits' and d.sharepoint_item_id=p.dup_item
where k.permit_type='dma' and k.sharepoint_list_name='DMA Permits' and k.sharepoint_item_id=p.keep_item
  and upper(trim(k.permit_number))=upper(trim(d.permit_number));
delete from permits where permit_type='dma' and sharepoint_list_name='DMA Permits' and sharepoint_item_id in ('6','7','8','20','22') and document_url is null;
-- expect: UPDATE 5, DELETE 5

-- b) re-link the 18 DMA permits to the DMA list item that holds their number
with m(num, item) as (values ('PRMT202501292','43'),('PRMT202601392','46'),('PRMT202601400','48'),('PRMT202601443','47'),('PRMT202601453','68'),('PRMT202601480','67'),
 ('PRMT202601539','69'),('PRMT202601546','50'),('PRMT202601547','39'),('PRMT202601552','32'),('PRMT202601471','16'),('PRMT202601517','59'),('PRMT202601523','63'),
 ('PRMT202601540','65'),('PRMT202601548','61'),('PRMT202601555','53'),('PRMT202601452','22'),('PRMT202601550','20'))
update permits p set sharepoint_item_id = m.item, sharepoint_synced_at = now()
from m where p.permit_type='dma' and p.sharepoint_list_name='DMA Permits' and upper(trim(p.permit_number))=m.num and p.document_url is not null;
-- expect: UPDATE 18

-- c) the 4 with no DMA list item: unlink, so the (already pending) push looks the number up and creates it
update permits set sharepoint_item_id = null
where permit_type='dma' and sharepoint_list_name='DMA Permits' and upper(trim(permit_number)) in ('PRMT202601565','PRMT202601582','PRMT202601584','PRMT202601590');
-- expect: UPDATE 4

-- d) the 13 Gate Pass copies that are the only Polaris record become the DMA permit
with m(gp_item, dma_item) as (values ('1681','45'),('1688','52'),('1685','49'),('1692','55'),('1673','37'),('1694','57'),('1687','51'),('1676','40'),('1680','44'),('1666','30'),('1677','41'),('1674','38'))
update permits p set permit_type='dma', sharepoint_list_name='DMA Permits', sharepoint_item_id=m.dma_item, sharepoint_synced_at=now()
from m where p.permit_type='gate_pass' and p.sharepoint_list_name='Gate Pass' and p.sharepoint_item_id=m.gp_item and p.permit_number ilike 'prmt%';
-- expect: UPDATE 12
update permits set permit_type='dma', sharepoint_list_name='DMA Permits', sharepoint_item_id=null
where permit_type='gate_pass' and sharepoint_list_name='Gate Pass' and sharepoint_item_id='1649' and upper(trim(permit_number))='PRMT202601423';
-- expect: UPDATE 1 (no DMA list item anywhere — the push creates it)
commit;

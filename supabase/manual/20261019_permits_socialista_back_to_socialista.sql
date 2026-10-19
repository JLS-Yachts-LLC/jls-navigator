-- Put SOCIALISTA's 9 cruising (mothership) permits back on SOCIALISTA.
--
-- NOT a merge to undo — a mis-merge. SOCIALISTA and ALTAVITA are two different vessels:
--   SOCIALISTA c48c115a… UK Registry, official no 731336, MMSI 232064959, call sign MTCR2, 26.78 m,
--                       owner TAL EDGAR, SharePoint Yachts item 598
--   ALTAVITA   a84c5778… Marshall Islands, official no 71673, call sign V7A5122, 38.75 m,
--                       owner VIRA MARITIME LTD, SharePoint Yachts item 602
-- What happened on 7 Oct (audit_log):
--   08:48  the 9 permits were moved from the archived "Socialista" record (c48c115a) to a84c5778,
--          which at that moment WAS the live SOCIALISTA (SharePoint item 598).
--   09:25  the yachts sync matched SharePoint's ALTAVITA to a84c5778 on IMO "N/A" and rewrote it into
--          ALTAVITA (item 602) — the permits went with it.
--   19 Oct 12:05  the yachts sync re-linked c48c115a to item 598 and un-archived it as SOCIALISTA.
-- So the permits now sit on the wrong vessel. Every one is Tal Edgar's ("Mr. Tal", "Keith" = his
-- skipper) and the SharePoint Mothership list still says SOCIALISTA for all 9 — SharePoint is right.
-- a84c5778 has nothing else of SOCIALISTA's left (only these 9 permits and ALTAVITA's own 3 invoices).
--
-- After this, the permits dry run stops reporting 9 "vessel replaced" items on Cruising Permit Mothership.
-- sharepoint_synced_at is stamped in the same UPDATE so mark_sharepoint_dirty() does not queue the rows
-- to be pushed back over SharePoint.

-- 1) Preview: expect 9 rows, all on ALTAVITA now.
select p.id, p.holder_name, p.permit_number, p.issue_date, p.sharepoint_item_id, y.vessel_name as now_on
from public.permits p join public.yachts y on y.id = p.yacht_id
where p.id in (
  '95d9ac5f-72aa-4c12-9552-c967ee315f95','99b9a2dd-72ce-4947-bfe7-bc34ee2b0372','fbf64de2-0ec9-405d-bb4c-dd12e56cab55',
  '563885d5-9c61-4a9b-9d6c-38469b4a82d2','7c112fa1-d4ef-4f77-8cd2-8ee12aa72a08','fc10a1f5-6d75-487e-bf53-dda3a59220f4',
  'd35778f9-def0-4677-9843-f2152cb8a019','4102846f-2e7c-4606-b867-8a412f163517','ce8de62f-020d-4508-9ccb-1844b953cba3')
order by p.issue_date;

-- 2) Move them back.
begin;

update public.permits
set yacht_id = 'c48c115a-0b99-487b-9164-af362c58f0da',   -- SOCIALISTA
    sharepoint_synced_at = now()
where yacht_id = 'a84c5778-bb1c-4780-8724-c629c69d1a49'   -- ALTAVITA
  and permit_type = 'cruising_mothership'
  and sharepoint_list_name = 'Cruising Permit Mothership'
  and id in (
  '95d9ac5f-72aa-4c12-9552-c967ee315f95','99b9a2dd-72ce-4947-bfe7-bc34ee2b0372','fbf64de2-0ec9-405d-bb4c-dd12e56cab55',
  '563885d5-9c61-4a9b-9d6c-38469b4a82d2','7c112fa1-d4ef-4f77-8cd2-8ee12aa72a08','fc10a1f5-6d75-487e-bf53-dda3a59220f4',
  'd35778f9-def0-4677-9843-f2152cb8a019','4102846f-2e7c-4606-b867-8a412f163517','ce8de62f-020d-4508-9ccb-1844b953cba3');
-- expect: UPDATE 9

insert into public.audit_log (event_type, module, resource_type, resource_id, result, detail, metadata)
values ('data_edit', 'vessels', 'yacht', 'c48c115a-0b99-487b-9164-af362c58f0da', 'success',
  'Mis-merge corrected: 9 cruising permits moved back to SOCIALISTA from ALTAVITA (a84c5778…). The 7 Oct clean-up moved them onto a84c5778 while it was SOCIALISTA; the yachts sync then turned that record into ALTAVITA. SharePoint says SOCIALISTA for all 9.',
  jsonb_build_object('method', 'manual-sql', 'source', 'claude-code', 'from_yacht', 'a84c5778-bb1c-4780-8724-c629c69d1a49', 'count', 9));

-- Should show 0 permits left on ALTAVITA and no dirty stamps on the 9.
select y.vessel_name, count(*), count(p.sharepoint_dirty_at) as dirty
from public.permits p join public.yachts y on y.id = p.yacht_id
where p.yacht_id in ('c48c115a-0b99-487b-9164-af362c58f0da', 'a84c5778-bb1c-4780-8724-c629c69d1a49')
group by 1;

commit;

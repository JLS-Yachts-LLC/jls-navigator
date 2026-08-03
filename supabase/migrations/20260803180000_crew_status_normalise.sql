-- Normalise tracker-imported crew statuses onto the canonical crew employment
-- vocabulary (active / on_leave / off_signed / inactive).
--
-- "On Board" and "On Signer" both describe working crew, so they become 'active'.
--
-- Deliberately NOT touched:
--   'Cancelled' — cancellation belongs to the visa APPLICATION, not the crew
--     member, but these records must stay visible with all their documents: the
--     crew member may rejoin the same yacht later or move to another one. The
--     crew Status dropdown only offers the canonical values, so 'Cancelled' can
--     never be newly assigned to a crew member; the imported value is preserved
--     and shown as "Cancelled (imported)" when editing.
--   'Sign Off' — left as-is pending confirmation that it means off_signed.
update public.crew_members set status = 'active', updated_at = now()
where status in ('On Board', 'On Signer');

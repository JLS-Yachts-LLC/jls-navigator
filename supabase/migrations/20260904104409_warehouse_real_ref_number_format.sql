-- Match the real company reference-number conventions surfaced by the
-- spreadsheet import: client refs are "JLSWH{YY}-{5-digit}", internal refs
-- are "JLS-INT-{YY}-{4-digit}", and package content item IDs are a
-- per-parent-ref suffix ("-01", "-02"...) rather than a global counter.
-- Sequences are advanced past the 109/60 rows just imported so the next
-- generated ref continues on from the real historical data.

SELECT setval('warehouse_client_ref_seq', 109);
SELECT setval('warehouse_internal_ref_seq', 60);

CREATE OR REPLACE FUNCTION next_warehouse_client_ref() RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT 'JLSWH' || to_char(current_date, 'YY') || '-' || lpad(nextval('warehouse_client_ref_seq')::text, 5, '0');
$$;
CREATE OR REPLACE FUNCTION next_warehouse_internal_ref() RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT 'JLS-INT-' || to_char(current_date, 'YY') || '-' || lpad(nextval('warehouse_internal_ref_seq')::text, 4, '0');
$$;

DROP FUNCTION IF EXISTS next_warehouse_item_id();
DROP SEQUENCE IF EXISTS warehouse_item_id_seq;

CREATE OR REPLACE FUNCTION next_warehouse_package_item_id(p_ref_no text) RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT p_ref_no || '-' || lpad((count(*) + 1)::text, 2, '0') FROM warehouse_package_contents WHERE ref_no = p_ref_no;
$$;
REVOKE EXECUTE ON FUNCTION next_warehouse_package_item_id(text) FROM anon;

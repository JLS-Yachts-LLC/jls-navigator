-- 3rd Party Storage — space JLS rents from outside storage companies (The Box, E House…) on behalf of a client.
-- One row per storage arrangement. Ref numbers start TPS26-0001 (TPS + 2-digit year + running number), same atomic-sequence
-- pattern as the warehouse refs. Status is a fixed pick-list from the team's sheet; Due Soon / Overdue are worked out on screen
-- from due_date, never stored. Same access as the Warehouse tables: any signed-in user.

CREATE TABLE IF NOT EXISTS third_party_storage (
  id uuid primary key default gen_random_uuid(),
  ref_no text not null unique,
  client text not null,
  status text not null default 'New Inquiry'
    check (status in ('New Inquiry','Quote Submitted','Quote Approved - Schedule for Collection','Stored','Closed')),
  requested_by text,
  space_req_sqft numeric,
  storage_date date,
  due_date date,
  closed_date date,
  unit_number text,
  client_email text,
  client_contact text,
  location text,                       -- a Google Maps link, or just an area name
  jls_quotation text,
  jls_invoice text,
  quoted_amount numeric,
  quoted_currency text check (quoted_currency in ('AED','USD','EUR')),
  storage_company text,
  contact_person text,
  contact_number text,
  company_website text,
  company_email text,
  storage_company_quotation jsonb not null default '[]'::jsonb,   -- [{name,url}]
  unit_images jsonb not null default '[]'::jsonb,                 -- [{name,url}]
  documents jsonb not null default '[]'::jsonb,                   -- [{name,url}]
  updates jsonb not null default '[]'::jsonb,                     -- [{date,owner,text}] dated notes, newest first
  remarks text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

CREATE SEQUENCE IF NOT EXISTS third_party_storage_ref_seq START 1;

CREATE OR REPLACE FUNCTION next_third_party_storage_ref() RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT 'TPS' || to_char(now(), 'YY') || '-' || lpad(nextval('third_party_storage_ref_seq')::text, 4, '0');
$$;
REVOKE EXECUTE ON FUNCTION next_third_party_storage_ref() FROM anon;

DROP TRIGGER IF EXISTS set_third_party_storage_updated_at ON third_party_storage;
CREATE TRIGGER set_third_party_storage_updated_at BEFORE UPDATE ON third_party_storage
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE third_party_storage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "third_party_storage_all" ON third_party_storage FOR ALL
  USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

CREATE INDEX IF NOT EXISTS idx_third_party_storage_status ON third_party_storage (status);
CREATE INDEX IF NOT EXISTS idx_third_party_storage_client ON third_party_storage (client);

-- The four records from the team's sheet (3rd_Party_Storage.xlsx, Oct 2026). Only runs while the table is empty.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM third_party_storage) THEN
    INSERT INTO third_party_storage
      (ref_no, client, status, space_req_sqft, storage_date, due_date, closed_date, unit_number, location,
       jls_quotation, storage_company, contact_number, remarks, updates)
    VALUES
      (next_third_party_storage_ref(), 'BEOL', 'Stored', 400, '2026-02-20', '2027-03-19', null, 'F-003/F-004', 'Al Quoz',
       'Q26-00406', 'The Box', null, '400 SQFT - Al Quoz', '[]'::jsonb),
      (next_third_party_storage_ref(), 'GALVAS', 'New Inquiry', 100, '2026-10-26', null, null, null, 'JLT',
       'Q26-02176', 'The Box', null, '100 SQFT - JLT', '[]'::jsonb),
      (next_third_party_storage_ref(), 'GALVAS', 'Closed', null, '2025-11-20', '2026-03-30', '2026-03-31', 'D07', 'Al Quoz',
       '25-7411', 'E HOUSE - Self Storage', '+971 58 629 5123', 'Warehouse number 26, Gate number 15, Street 5b',
       '[{"date":"2026-03-31","owner":"","text":"+44 7880 768945 - WHATSAPP - Chief Officer Olie - Confirmed that warehouse storage has been emptied."}]'::jsonb);
  END IF;
END $$;

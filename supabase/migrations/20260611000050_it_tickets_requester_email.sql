-- Service Desk: capture the requester's email so ticket updates can be emailed
-- (via Microsoft Graph from itsupport@jlsyachts.com).
ALTER TABLE it_tickets ADD COLUMN IF NOT EXISTS requester_email text;

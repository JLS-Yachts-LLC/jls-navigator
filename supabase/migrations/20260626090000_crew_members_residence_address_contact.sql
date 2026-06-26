-- Country of Residence Address / Contact for visa applications (optional fields).
alter table crew_members add column if not exists residence_address_line1 text;
alter table crew_members add column if not exists residence_address_line2 text;
alter table crew_members add column if not exists residence_city text;
alter table crew_members add column if not exists residence_country text;
alter table crew_members add column if not exists residence_phone text;

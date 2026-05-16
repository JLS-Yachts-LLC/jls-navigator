-- Extra fields for Navigation License and other permit types
-- license_no: stores the navigation license number (text, not a date)
-- requested_by: stores who requested the permit (avoids repurposing dma_phase)
alter table public.permits
  add column if not exists license_no text,
  add column if not exists requested_by text;

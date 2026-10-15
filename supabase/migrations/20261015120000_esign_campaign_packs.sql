-- Signature Campaigns: several documents in one send.
--
-- esign_campaigns.items lists the documents in order:
--   [{ "kind": "template" | "form", "key": <template id | form key>, "title": "...",
--      "values": { <form field>: <value staff pre-filled for everyone> } }]
-- source_kind / template_id / form_key stay filled from the FIRST item so older
-- code and the source check constraint keep working.
--
-- esign_documents.pack is the recipient's own snapshot of those documents (their
-- vessel's pre-filled form values, the template file + signature spots at send
-- time). The signing page lets the captain complete the forms, then the pack is
-- rebuilt with their answers and signed once — signature and stamp land on every
-- document that the vessel signs.

alter table public.esign_campaigns
  add column if not exists items jsonb not null default '[]'::jsonb;

alter table public.esign_documents
  add column if not exists pack jsonb;

-- Existing campaigns become one-item lists.
update public.esign_campaigns c
set items = jsonb_build_array(jsonb_build_object(
  'kind', c.source_kind,
  'key', case when c.source_kind = 'form' then c.form_key else c.template_id::text end,
  'title', c.doc_title,
  'values', '{}'::jsonb))
where c.items = '[]'::jsonb;

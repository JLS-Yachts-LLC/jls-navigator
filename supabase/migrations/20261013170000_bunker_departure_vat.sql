-- Bunkering enquiries: whether the vessel sails out of the UAE after bunkering, and its planned departure date.
-- These drive the UAE VAT guidance (zero-rated if the vessel sails out within 21 days, 5% if the fuel is consumed in the UAE or
-- the stay is longer) and the rule that 500 / 1000 ppm fuel can only be supplied if the vessel departs within 48 hours.
-- Additive: two nullable columns, and create_bunker_enquiry replaced to store them. Safe to run once.

alter table public.bunker_enquiries add column if not exists sails_out_of_uae text
  check (sails_out_of_uae is null or sails_out_of_uae in ('yes', 'no', 'unsure'));
alter table public.bunker_enquiries add column if not exists departure_date date;

create or replace function public.create_bunker_enquiry(p jsonb, p_files jsonb)
returns public.bunker_enquiries
language plpgsql security invoker set search_path = public as $$
declare r public.bunker_enquiries; who text;
begin
  if not public.is_polaris_staff() then raise exception 'Only Polaris staff can log a bunkering enquiry'; end if;
  if btrim(coalesce(p->>'yacht_name', '')) = '' then raise exception 'The yacht name is needed'; end if;
  select display_name into who from public.user_profiles where user_id = auth.uid();

  insert into public.bunker_enquiries (
    number, created_by, created_by_name, yacht_id, yacht_name, flag, loa_m, imo_no, captain_name, chief_engineer_name, contact_number, contact_email,
    port, berth, preferred_date, preferred_time, fuel_type, fuel_other, quantity, quantity_unit, spec_notes,
    delivery_method, fuel_remaining, tank_capacity, special_requirements, sails_out_of_uae, departure_date,
    declared_by_role, declared_by_name, declared_at, declaration_method, declaration_signature_url, date_enquiry_sent, notes)
  values (
    public.next_bunker_enquiry_number(), auth.uid(), who, nullif(p->>'yacht_id', '')::uuid, btrim(p->>'yacht_name'), nullif(p->>'flag', ''), nullif(p->>'loa_m', '')::numeric,
    nullif(p->>'imo_no', ''), nullif(p->>'captain_name', ''), nullif(p->>'chief_engineer_name', ''), nullif(p->>'contact_number', ''), nullif(p->>'contact_email', ''),
    nullif(p->>'port', ''), nullif(p->>'berth', ''), nullif(p->>'preferred_date', '')::date, nullif(p->>'preferred_time', ''),
    nullif(p->>'fuel_type', ''), nullif(p->>'fuel_other', ''), nullif(p->>'quantity', '')::numeric, nullif(p->>'quantity_unit', ''), nullif(p->>'spec_notes', ''),
    nullif(p->>'delivery_method', ''), nullif(p->>'fuel_remaining', ''), nullif(p->>'tank_capacity', ''), nullif(p->>'special_requirements', ''),
    nullif(p->>'sails_out_of_uae', ''), nullif(p->>'departure_date', '')::date,
    nullif(p->>'declared_by_role', ''), nullif(p->>'declared_by_name', ''), nullif(p->>'declared_at', '')::timestamptz,
    nullif(p->>'declaration_method', ''), nullif(p->>'declaration_signature_url', ''), nullif(p->>'date_enquiry_sent', '')::date, nullif(p->>'notes', ''))
  returning * into r;

  if p_files is not null and jsonb_typeof(p_files) = 'array' and jsonb_array_length(p_files) > 0 then
    insert into public.bunker_enquiry_files (enquiry_id, kind, doc_type, name, url)
    select r.id, f->>'kind', nullif(f->>'doc_type', ''), f->>'name', f->>'url' from jsonb_array_elements(p_files) as f;
  end if;

  insert into public.bunker_enquiry_events (enquiry_id, kind, actor_name, body) values (r.id, 'created', who, null);
  return r;
end $$;
revoke execute on function public.create_bunker_enquiry(jsonb, jsonb) from public, anon;

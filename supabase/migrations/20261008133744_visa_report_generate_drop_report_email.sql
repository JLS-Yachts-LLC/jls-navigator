-- generate_vessel_visa_report__unguarded stamped yachts.visa_report_email onto
-- the new report as sent_to_email. That setting is retired (recipients live in
-- vessel_report_subscriptions), and the send step now stamps who it really
-- went to — so the report is generated with no address, ahead of dropping the column.
do $$
declare v_def text;
begin
  select pg_get_functiondef('public.generate_vessel_visa_report__unguarded(uuid,uuid)'::regprocedure) into v_def;
  if position('y.visa_report_email' in v_def) = 0 then return; end if;
  execute replace(v_def, 'p_yacht_id, CURRENT_DATE, y.visa_report_email,', 'p_yacht_id, CURRENT_DATE, NULL::text,');
end $$;

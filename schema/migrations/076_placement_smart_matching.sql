-- Migration 076: Smart candidate matching (FRS §7), 9-factor model
-- Retargeted from the original zip's fictional job_listings/candidate_profiles
-- onto the real crew_vacancies/placement_candidates tables and their new
-- child tables from migrations 069-072.
--
-- Note on the "availability" factor: placement_candidates.availability and
-- notice_period are free text (e.g. "immediate", "30 days notice"), not a
-- structured date like the original draft assumed — there is no reliable
-- way to compare them numerically, so this factor checks is_active plus
-- whether availability data is present at all, same "partial credit until
-- the field is structured" approach the original draft used for salary.

create or replace function public.get_candidate_match_score(
  p_vacancy_id uuid,
  p_candidate_id uuid
)
returns jsonb
language plpgsql
security invoker
stable
as $$
declare
  v_vacancy record;
  v_candidate record;
  v_score numeric := 0;
  v_breakdown jsonb := '{}'::jsonb;
  v_has_valid_cert boolean;
  v_prior_placements int;
  v_required_lang text;
  v_matched_count int := 0;
  v_required_count int;
  v_client_vessel_loa numeric;
begin
  select * into v_vacancy from public.crew_vacancies where id = p_vacancy_id;
  select * into v_candidate from public.placement_candidates where id = p_candidate_id;

  if v_vacancy.id is null or v_candidate.id is null then
    return jsonb_build_object('score', 0, 'reason', 'vacancy_or_candidate_not_found');
  end if;

  -- 1. Position match — up to 15
  if (v_vacancy.title is not null and (
        v_candidate.rank ilike '%' || v_vacancy.title || '%'
        or v_candidate.desired_position ilike '%' || v_vacancy.title || '%'
      ))
     or (v_vacancy.rank is not null and v_candidate.rank ilike '%' || v_vacancy.rank || '%')
     or (v_vacancy.department is not null and v_candidate.department = v_vacancy.department)
  then
    v_score := v_score + 15;
    v_breakdown := v_breakdown || jsonb_build_object('position_match', 15);
  end if;

  -- 2. Experience — up to 15
  if coalesce(v_candidate.experience_years, 0) > 0 then
    v_score := v_score + 15;
    v_breakdown := v_breakdown || jsonb_build_object('experience', 15);
  end if;

  -- 3. Certificates — up to 15 (any non-expired certification on file)
  select exists (
    select 1 from public.placement_candidate_certifications
    where candidate_id = p_candidate_id and (expiry_date is null or expiry_date > current_date)
  ) into v_has_valid_cert;
  if v_has_valid_cert then
    v_score := v_score + 15;
    v_breakdown := v_breakdown || jsonb_build_object('certificates', 15);
  end if;

  -- 4. Availability — up to 10
  if coalesce(v_candidate.is_active, false)
     and (v_candidate.availability is not null or v_candidate.notice_period is not null)
  then
    v_score := v_score + 10;
    v_breakdown := v_breakdown || jsonb_build_object('availability_data_present', 10);
  end if;

  -- 5. Salary expectations — up to 10 (partial credit only; salary_range on
  -- crew_vacancies is free text, so this can't be an exact numeric match
  -- until that field is structured — same limitation flagged in the
  -- original draft).
  if v_candidate.salary_expectation_max is not null and v_vacancy.salary_range is not null then
    v_score := v_score + 5;
    v_breakdown := v_breakdown || jsonb_build_object('salary_data_present', 5);
  end if;

  -- 6. Previous vessel size suitability — up to 10 (candidate has sailed on
  -- a vessel of comparable LOA to any vessel this client operates)
  select y.length_overall_m into v_client_vessel_loa
  from public.yachts y
  where y.org_id = v_vacancy.client_org_id and y.length_overall_m is not null
  limit 1;

  if v_client_vessel_loa is not null and exists (
    select 1 from public.placement_candidate_experience pce
    where pce.candidate_id = p_candidate_id
      and pce.vessel_loa_m is not null
      and abs(pce.vessel_loa_m - v_client_vessel_loa) <= 15
  ) then
    v_score := v_score + 10;
    v_breakdown := v_breakdown || jsonb_build_object('vessel_size_match', 10);
  end if;

  -- 7. Vessel type data present — up to 5
  if exists (
    select 1 from public.placement_candidate_experience pce
    where pce.candidate_id = p_candidate_id and pce.vessel_type is not null
  ) then
    v_score := v_score + 5;
    v_breakdown := v_breakdown || jsonb_build_object('vessel_type_data_present', 5);
  end if;

  -- 8. Languages — up to 10 (proportion of required languages the
  -- candidate lists)
  if v_vacancy.languages_required is not null and array_length(v_vacancy.languages_required, 1) > 0 then
    v_required_count := array_length(v_vacancy.languages_required, 1);
    foreach v_required_lang in array v_vacancy.languages_required loop
      if v_candidate.languages is not null and v_required_lang = any(v_candidate.languages) then
        v_matched_count := v_matched_count + 1;
      end if;
    end loop;
    v_score := v_score + round(10.0 * v_matched_count / v_required_count);
    v_breakdown := v_breakdown || jsonb_build_object('languages_matched', v_matched_count, 'languages_required', v_required_count);
  end if;

  -- 9. Previous completed placement with this client — up to 10
  select count(*) into v_prior_placements
  from public.placement_records
  where candidate_id = p_candidate_id and client_org_id = v_vacancy.client_org_id and status = 'completed';
  if v_prior_placements > 0 then
    v_score := v_score + 10;
    v_breakdown := v_breakdown || jsonb_build_object('repeat_placement_with_client', 10);
  end if;

  return jsonb_build_object(
    'score', v_score,
    'label', case
      when v_score >= 90 then 'Excellent Match'
      when v_score >= 70 then 'Strong Match'
      when v_score >= 50 then 'Possible Match'
      else 'Weak Match'
    end,
    'breakdown', v_breakdown
  );
end;
$$;

revoke all on function public.get_candidate_match_score(uuid, uuid) from public, anon;
grant execute on function public.get_candidate_match_score(uuid, uuid) to authenticated;

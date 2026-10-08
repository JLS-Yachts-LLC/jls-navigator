-- Ranks ("Chief Officer Emily") are titles, two-letter initials ("JP") keep
-- their capitals, and port/terminal companies ("Julian DP World") aren't surnames.
create or replace function public.wa_name_case(p text)
returns text language sql immutable set search_path = public as $$
  select case when p is null or btrim(p) = '' then null else (
    select string_agg(case when w ~ '\.' then upper(w)
                           when length(w) = 2 and w = upper(w) and lower(w) not in ('al', 'el', 'de', 'da', 'di', 'du', 'la', 'le', 'lo', 'mc', 'st') then w
                           when w = upper(w) or w = lower(w) then initcap(w) else w end, ' ' order by i)
    from unnest(regexp_split_to_array(btrim(p), '\s+')) with ordinality as t(w, i)
  ) end;
$$;

create or replace function public.wa_split_name(p_name text, p_vessel text default null, out first_name text, out last_name text)
language plpgsql immutable set search_path = public as $$
declare
  s text := coalesce(p_name, '');
  vessel text := lower(regexp_replace(coalesce(p_vessel, ''), '^(m/?y|s/?y|m/?v)\s+', '', 'i'));
  parts text[];
  part text;
  w text;
  words text[];
  clean text[];
  chosen text;
  after_title boolean := false;
  org_re constant text := '\m(llc|l\.l\.c|ltd|limited|inc|management|mgmt|yachts?|marine|marinas?|group|services|agency|shipping|fze|fzco|fzc|dmcc|company|owners?|representative|office|accounts|team|vessel|boat|world|ports?|authority|terminals?|customs)\M';
  role_re constant text := '^(accountant|owner|manager|purser|engineer|representative|crew|chef|stewardess|captain|master|admin|office|accounts|agent|officer|bosun|deckhand|mate)$';
  title_re constant text := '^(captain|capt|cpt|mr|mrs|ms|miss|mx|dr|sir)$';
  -- Ranks written before a name; removed as a phrase so "Chief" alone stays a name.
  rank_re constant text := '^((chief|first|second|third|1st|2nd|3rd)\s+(officer|engineer|stewardess|steward|mate)|chief\s+stew|bosun|purser|deckhand)\s+';
begin
  if s ~* '\(\s*vessel contact\s*\)' then return; end if;
  s := btrim(regexp_replace(regexp_replace(s, '\([^)]*\)', ' ', 'g'), '\s+', ' ', 'g'));
  if s = '' then return; end if;

  parts := regexp_split_to_array(s, '\s+[-–—/|]\s+');
  foreach part in array parts loop
    if cardinality(parts) > 1 and part ~* org_re then continue; end if;
    if vessel <> '' and lower(btrim(part)) = vessel then continue; end if;
    -- "Chief Officer Emily" → "Emily"; "Chief Officer" on its own → nothing left.
    part := regexp_replace(btrim(part) || ' ', rank_re, '', 'i');
    words := '{}';
    foreach w in array regexp_split_to_array(btrim(part), '\s+') loop
      w := btrim(w, ',;:');
      if btrim(w, '.') ~* title_re then continue; end if;
      if w !~ '^[[:alpha:]][[:alpha:]''’.-]*$' then continue; end if;
      words := words || w;
    end loop;
    if cardinality(words) = 0 or (cardinality(words) = 1 and words[1] ~* role_re) then
      after_title := true;
      continue;
    end if;
    if after_title and cardinality(words) = 1 and cardinality(parts) > 1 then return; end if;
    chosen := part;
    clean := words;
    exit;
  end loop;
  if chosen is null then return; end if;

  if chosen ~* org_re then
    if clean[1] ~* org_re or clean[1] ~* '^(al|el|the)$' then return; end if;
    first_name := public.wa_name_case(btrim(clean[1], '.'));
  else
    first_name := public.wa_name_case(btrim(clean[1], '.'));
    if cardinality(clean) > 1 then last_name := public.wa_name_case(array_to_string(clean[2:], ' ')); end if;
  end if;
end;
$$;

-- Re-split the contacts the earlier rules got wrong (full names untouched).
alter table public.wa_contacts disable trigger wa_contacts_names;
update public.wa_contacts c set first_name = s.first_name, last_name = s.last_name
from (select c2.id, (public.wa_split_name(c2.name, y.vessel_name)).*
      from public.wa_contacts c2 left join public.yachts y on y.id = c2.yacht_id) s
where s.id = c.id and (c.first_name, c.last_name) is distinct from (s.first_name, s.last_name)
  and (c.name ~* '^chief officer' or c.name in ('JP Granstaff', 'Julian DP World'));
alter table public.wa_contacts enable trigger wa_contacts_names;

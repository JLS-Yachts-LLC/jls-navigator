-- Spreadsheet trackers compute expiries as formulas (issue date + 28 / + 179 days).
-- With the issue date blank, Excel returns the bare offset — 28 → 1900-01-28,
-- 179 → 1900-06-27 — and both the Excel sync and the SharePoint list sync stored
-- those as real dates, so the visas looked expired by a century (46 cleaned up
-- 8 Oct 2026; old values in visa_junk_date_backup_20261008). No date on a visa
-- record (expiry, entry deadline, issue, passport expiry, sign on/off, travel) can
-- be before 1950, so whichever path writes one, it is stored as blank.
create or replace function public.visa_blank_placeholder_dates()
returns trigger language plpgsql as $$
begin
  if new.visa_expiry        < date '1950-01-01' then new.visa_expiry := null; end if;
  if new.first_entry_expiry < date '1950-01-01' then new.first_entry_expiry := null; end if;
  if new.visa_issuance_date < date '1950-01-01' then new.visa_issuance_date := null; end if;
  if new.passport_expiry    < date '1950-01-01' then new.passport_expiry := null; end if;
  if new.sign_on_date       < date '1950-01-01' then new.sign_on_date := null; end if;
  if new.sign_off_date      < date '1950-01-01' then new.sign_off_date := null; end if;
  return new;
end $$;

drop trigger if exists trg_visa_blank_placeholder_dates on public.visa_applications;
create trigger trg_visa_blank_placeholder_dates
  before insert or update on public.visa_applications
  for each row execute function public.visa_blank_placeholder_dates();

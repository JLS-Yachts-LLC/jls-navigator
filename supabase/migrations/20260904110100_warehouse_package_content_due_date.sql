-- Package Content rows never had a date field, so the spec's "Due Soon" /
-- "Overdue" statuses (tied to a destruction/retention date) could never be
-- derived for them — status was purely manual. Add an optional due date so
-- the same deriveStatus() logic used for Client/Internal items applies here
-- too.
ALTER TABLE warehouse_package_contents ADD COLUMN due_date date;

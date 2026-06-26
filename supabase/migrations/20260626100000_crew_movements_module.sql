-- Sign-On/Off as its own permission module, split from crew_immigration, so a user
-- can have full Sign-On/Off access while Visa (crew_immigration) stays read-only.
insert into modules (name, display_name, icon)
select 'crew_movements', 'Crew Sign-On / Off', 'ti-login'
where not exists (select 1 from modules where name = 'crew_movements');

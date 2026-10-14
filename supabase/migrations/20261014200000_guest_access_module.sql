-- "Guest Access" — a per-person permission for managing guest logins.
--
-- Added to the modules catalogue, so it appears in each staff member's module
-- permissions (Settings → Manage Users → a person → Modules) like any other
-- module, on top of whatever role they hold:
--   Create (or higher) — invite guests, re-send invites, edit guest details,
--                        and create / edit / delete guest groups.
--   Edit   (or higher) — also deactivate and reactivate guest logins.
-- Global admins (and org admins) can do all of this without it.
-- Sharing documents with guests is not gated by this — any staff member can share.
insert into public.modules (name, display_name, active, icon)
select 'guest_access', 'Guest Access', true, 'user-share'
where not exists (select 1 from public.modules where name = 'guest_access');

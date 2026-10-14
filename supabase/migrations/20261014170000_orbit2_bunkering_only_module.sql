-- Orbit 2 — "Bunkering only" access (Port Agency team request, 14 Oct 2026).
--
-- Orbit 1 and Orbit 2 share the `orbit` module. Someone who should only work on
-- Orbit 2 → Project → Bunkering gets `orbit2_bunkering` and NO `orbit` (a
-- per-user `orbit` row with active = false is the explicit deny that overrides
-- their department's default). The Orbit 2 hub then shows only the Bunkering
-- tab; Orbit 1 and the rest of Orbit 2 drop out of their sidebar.
--
-- Anyone who has `orbit` keeps the full hub — `orbit2_bunkering` never narrows
-- an existing Orbit user. Granted per person in Settings → Manage Users →
-- Module access (which lists every active module), or per department.

insert into public.modules (name, display_name, active, icon)
values ('orbit2_bunkering', 'Orbit 2 — Bunkering only', true, 'gas-station')
on conflict (name) do nothing;

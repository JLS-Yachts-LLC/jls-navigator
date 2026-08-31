-- Feature flags for the 3 new Orbit sidebar entries (Approvals, Small Boats,
-- Projects) — all built and working already, just never had a live-app route
-- or nav entry (only reachable inside the /polaris-redesign preview).
-- Seeded at 'dev' stage to match every sibling item in the "My Vessel" nav
-- section (operations/maintenance/compliance/training/my-fleet are all still
-- 'dev' in production too) — not rolling these out any wider than the rest
-- of that section currently is.
insert into public.feature_flags (key, name, description, icon, stage, released_at) values
  ('orbit-approvals', 'Orbit Approvals', 'Tiered spend approval desk for Orbit quotations', '✅', 'dev', null),
  ('orbit-boats',     'Small Boats',     'Small boat status, daily checklists & defect reporting', '🚤', 'dev', null),
  ('orbit-projects',  'Orbit Projects',  'Vessel project & task tracking', '📋', 'dev', null)
on conflict (key) do nothing;

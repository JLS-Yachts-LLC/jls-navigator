-- The portal reads crew certificates by crew member (RLS + Alerts + calendar).
create index if not exists training_certifications_crew_idx on public.training_certifications (crew_member_id) where crew_member_id is not null;

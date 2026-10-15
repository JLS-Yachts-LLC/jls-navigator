-- Anchor → Confidential, part 2: Forms (filled-in form submissions) and Campaigns.
-- Same rule as 20261015140000_anchor_confidential.sql — only admins and people
-- with the "Anchor — Confidential" permission see confidential rows. A campaign's
-- recipients follow their campaign (checked through a SECURITY DEFINER helper, so
-- the caller's own RLS can't hide the parent and leak the children).
-- Their files go under "confidential/" in esign-documents, already fenced.

alter table public.anchor_form_submissions add column if not exists confidential boolean not null default false;
alter table public.esign_campaigns add column if not exists confidential boolean not null default false;

create or replace function public.esign_campaign_is_confidential(p_campaign_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select confidential from public.esign_campaigns where id = p_campaign_id), false);
$$;
revoke all on function public.esign_campaign_is_confidential(uuid) from public, anon;
grant execute on function public.esign_campaign_is_confidential(uuid) to authenticated, service_role;

drop policy if exists anchor_confidential_fence on public.anchor_form_submissions;
create policy anchor_confidential_fence on public.anchor_form_submissions as restrictive for all to authenticated
  using (not confidential or public.can_see_anchor_confidential((select auth.uid())))
  with check (not confidential or public.can_see_anchor_confidential((select auth.uid())));

drop policy if exists anchor_confidential_fence on public.esign_campaigns;
create policy anchor_confidential_fence on public.esign_campaigns as restrictive for all to authenticated
  using (not confidential or public.can_see_anchor_confidential((select auth.uid())))
  with check (not confidential or public.can_see_anchor_confidential((select auth.uid())));

drop policy if exists anchor_confidential_fence on public.esign_campaign_recipients;
create policy anchor_confidential_fence on public.esign_campaign_recipients as restrictive for all to authenticated
  using (not public.esign_campaign_is_confidential(campaign_id) or public.can_see_anchor_confidential((select auth.uid())))
  with check (not public.esign_campaign_is_confidential(campaign_id) or public.can_see_anchor_confidential((select auth.uid())));

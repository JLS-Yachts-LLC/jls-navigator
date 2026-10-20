import { createFileRoute } from "@tanstack/react-router";
import { CompassCardPage } from "@/components/compass-card/compass-card-page";

export const Route = createFileRoute("/_app/compass-card")({
  // ?event=<id> highlights that event — the bell and email alerts link here.
  validateSearch: (s: Record<string, unknown>): { event?: string } => (typeof s.event === "string" ? { event: s.event } : {}),
  component: CompassCardRoute,
  head: () => ({ meta: [{ title: "Compass Card — Polaris" }] }),
});

function CompassCardRoute() {
  const { event } = Route.useSearch();
  return <CompassCardPage initialEventId={event} />;
}

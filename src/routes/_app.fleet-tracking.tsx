import { createFileRoute } from "@tanstack/react-router";
import { FleetTrackingPage } from "@/components/fleet-tracking-page";

export const Route = createFileRoute("/_app/fleet-tracking")({
  component: FleetTrackingPage,
  head: () => ({ meta: [{ title: "Live Fleet Tracking — Aquila One" }] }),
});

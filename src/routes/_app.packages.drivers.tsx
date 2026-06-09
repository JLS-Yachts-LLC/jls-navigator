import { createFileRoute } from "@tanstack/react-router";
import { DriversPage } from "@/components/crew-cab/drivers-page";

// ShipSync drivers share the same pool as Crew Cab — both use crew_drivers table.
export const Route = createFileRoute("/_app/packages/drivers")({
  component: DriversPage,
  head: () => ({ meta: [{ title: "Drivers — Polaris" }] }),
});

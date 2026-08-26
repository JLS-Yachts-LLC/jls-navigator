import { createFileRoute } from "@tanstack/react-router";
import { VehicleMaintenancePage } from "@/components/crew-cab/vehicle-maintenance-page";

export const Route = createFileRoute("/_app/crew-cab/maintenance")({
  component: VehicleMaintenancePage,
  head: () => ({ meta: [{ title: "Vehicle Maintenance — Crew Care" }] }),
});

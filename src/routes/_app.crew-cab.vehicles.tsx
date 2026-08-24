import { createFileRoute } from "@tanstack/react-router";
import { VehiclesPage } from "@/components/crew-cab/vehicles-page";

export const Route = createFileRoute("/_app/crew-cab/vehicles")({
  component: VehiclesPage,
  head: () => ({ meta: [{ title: "Vehicles — Crew Care" }] }),
});

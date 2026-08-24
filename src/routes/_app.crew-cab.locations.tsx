import { createFileRoute } from "@tanstack/react-router";
import { LocationsPage } from "@/components/crew-cab/locations-page";

export const Route = createFileRoute("/_app/crew-cab/locations")({
  component: LocationsPage,
  head: () => ({ meta: [{ title: "Locations — Crew Care" }] }),
});

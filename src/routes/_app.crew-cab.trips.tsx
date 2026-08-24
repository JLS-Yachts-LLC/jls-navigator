import { createFileRoute } from "@tanstack/react-router";
import { TripsPage } from "@/components/crew-cab/trips-page";

export const Route = createFileRoute("/_app/crew-cab/trips")({
  component: TripsPage,
  head: () => ({ meta: [{ title: "Trips — Crew Care" }] }),
});

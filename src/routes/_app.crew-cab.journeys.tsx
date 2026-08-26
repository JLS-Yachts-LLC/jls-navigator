import { createFileRoute } from "@tanstack/react-router";
import { JourneysPage } from "@/components/crew-cab/journeys-page";

export const Route = createFileRoute("/_app/crew-cab/journeys")({
  component: JourneysPage,
  head: () => ({ meta: [{ title: "Journeys — Crew Care" }] }),
});

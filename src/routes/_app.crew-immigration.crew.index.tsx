import { createFileRoute } from "@tanstack/react-router";
import { CrewListPage } from "@/components/crew-immigration/crew-list-page";

export const Route = createFileRoute("/_app/crew-immigration/crew/")({
  component: CrewListPage,
  head: () => ({ meta: [{ title: "Crew List — Polaris" }] }),
});

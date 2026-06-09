import { createFileRoute } from "@tanstack/react-router";
import { CrewDocumentsPage } from "@/components/crew-immigration/crew-documents-page";

export const Route = createFileRoute("/_app/crew-immigration/documents")({
  component: CrewDocumentsPage,
  head: () => ({ meta: [{ title: "Crew Documents — Polaris" }] }),
});

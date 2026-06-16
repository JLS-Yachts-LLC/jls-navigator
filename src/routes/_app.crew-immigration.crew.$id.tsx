import { createFileRoute } from "@tanstack/react-router";
import { CrewProfilePage } from "@/components/crew-immigration/crew-profile-page";

export const Route = createFileRoute("/_app/crew-immigration/crew/$id")({
  component: CrewProfilePage,
  head: () => ({ meta: [{ title: "Crew Profile — Polaris" }] }),
});

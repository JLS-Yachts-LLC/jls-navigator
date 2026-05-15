import { createFileRoute } from "@tanstack/react-router";
import { StubPage } from "@/components/stub-page";

export const Route = createFileRoute("/_app/crew-cab")({
  component: () => <StubPage title="Crew Cab" breadcrumb="Crew Cab" />,
  head: () => ({ meta: [{ title: "Crew Cab — JLS Yachts CRM" }] }),
});

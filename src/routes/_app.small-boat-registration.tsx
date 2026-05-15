import { createFileRoute } from "@tanstack/react-router";
import { StubPage } from "@/components/stub-page";

export const Route = createFileRoute("/_app/small-boat-registration")({
  component: () => <StubPage title="Small Boat Registration" breadcrumb="Port & Operations" />,
  head: () => ({ meta: [{ title: "Small Boat Registration — JLS Yachts CRM" }] }),
});

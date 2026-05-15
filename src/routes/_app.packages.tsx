import { createFileRoute } from "@tanstack/react-router";
import { StubPage } from "@/components/stub-page";

export const Route = createFileRoute("/_app/packages")({
  component: () => <StubPage title="Packages & Deliveries" breadcrumb="Packages" />,
  head: () => ({ meta: [{ title: "Packages & Deliveries — JLS Yachts CRM" }] }),
});

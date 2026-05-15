import { createFileRoute } from "@tanstack/react-router";
import { StubPage } from "@/components/stub-page";

export const Route = createFileRoute("/_app/permits/tdra")({
  component: () => <StubPage title="TDRA" breadcrumb="Port & Operations / Permits" />,
  head: () => ({ meta: [{ title: "TDRA — JLS Yachts CRM" }] }),
});

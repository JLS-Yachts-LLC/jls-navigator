import { createFileRoute } from "@tanstack/react-router";
import { StubPage } from "@/components/stub-page";

export const Route = createFileRoute("/_app/permits/navigation-license")({
  component: () => <StubPage title="Navigation License" breadcrumb="Port & Operations / Permits" />,
  head: () => ({ meta: [{ title: "Navigation License — JLS Yachts CRM" }] }),
});

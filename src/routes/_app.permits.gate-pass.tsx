import { createFileRoute } from "@tanstack/react-router";
import { StubPage } from "@/components/stub-page";

export const Route = createFileRoute("/_app/permits/gate-pass")({
  component: () => <StubPage title="Gate Pass" breadcrumb="Port & Operations / Permits" />,
  head: () => ({ meta: [{ title: "Gate Pass — JLS Yachts CRM" }] }),
});

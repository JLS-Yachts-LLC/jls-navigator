import { createFileRoute } from "@tanstack/react-router";
import { StubPage } from "@/components/stub-page";

export const Route = createFileRoute("/_app/orbit")({
  component: () => <StubPage title="Orbit" breadcrumb="Orbit" />,
  head: () => ({ meta: [{ title: "Orbit — JLS Yachts CRM" }] }),
});

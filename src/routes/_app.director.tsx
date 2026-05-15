import { createFileRoute } from "@tanstack/react-router";
import { StubPage } from "@/components/stub-page";

export const Route = createFileRoute("/_app/director")({
  component: () => <StubPage title="Director" breadcrumb="Director" />,
  head: () => ({ meta: [{ title: "Director — JLS Yachts CRM" }] }),
});

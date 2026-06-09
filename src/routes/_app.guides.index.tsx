import { createFileRoute } from "@tanstack/react-router";
import { GuidesOverview } from "@/components/guides/guides-overview";

export const Route = createFileRoute("/_app/guides/")({
  component: GuidesOverview,
  head: () => ({ meta: [{ title: "Guides — Polaris" }] }),
});

import { createFileRoute } from "@tanstack/react-router";
import { ShipSyncPage } from "@/components/shipsync-page";

export const Route = createFileRoute("/_app/shipsync")({
  component: () => {
    const { tab } = Route.useSearch();
    return <ShipSyncPage initialTab={tab} />;
  },
  validateSearch: (search: Record<string, unknown>): { tab?: string } =>
    typeof search.tab === "string" ? { tab: search.tab } : {},
  head: () => ({ meta: [{ title: "ShipSync — Polaris" }] }),
});

import { createFileRoute } from "@tanstack/react-router";
import { ShipSyncPage } from "@/components/shipsync-page";

export const Route = createFileRoute("/_app/shipsync")({
  component: ShipSyncPage,
  head: () => ({ meta: [{ title: "ShipSync — Polaris" }] }),
});

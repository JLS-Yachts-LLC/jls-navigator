import { createFileRoute } from "@tanstack/react-router";
import { DeliveriesPage } from "@/components/packages/deliveries-page";

export const Route = createFileRoute("/_app/packages/deliveries")({
  component: DeliveriesPage,
  head: () => ({ meta: [{ title: "Deliveries / Route — Polaris" }] }),
});

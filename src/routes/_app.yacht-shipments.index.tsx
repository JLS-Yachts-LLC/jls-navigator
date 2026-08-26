import { createFileRoute } from "@tanstack/react-router";
import { YachtShipmentsBoard } from "@/components/yacht-shipments/YachtShipmentsBoard";

export const Route = createFileRoute("/_app/yacht-shipments/")({
  component: YachtShipmentsBoard,
  head: () => ({ meta: [{ title: "Yacht Shipments — Polaris" }] }),
});

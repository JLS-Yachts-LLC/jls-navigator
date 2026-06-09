import { createFileRoute } from "@tanstack/react-router";
import { ServiceDeskPage } from "@/components/service-desk/service-desk-page";

export const Route = createFileRoute("/_app/it-tickets/")({
  component: ServiceDeskPage,
  head: () => ({ meta: [{ title: "Service Desk — Yacht IT Solutions" }] }),
});

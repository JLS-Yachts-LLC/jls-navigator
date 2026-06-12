import { createFileRoute } from "@tanstack/react-router";
import { AutomationsPage } from "@/components/automations/automations-page";

export const Route = createFileRoute("/_app/automations")({
  component: AutomationsPage,
  head: () => ({ meta: [{ title: "Automations — Polaris" }] }),
});

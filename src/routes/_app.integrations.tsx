import { createFileRoute } from "@tanstack/react-router";
import { IntegrationsPage } from "@/components/dev/integrations-page";

export const Route = createFileRoute("/_app/integrations")({
  component: IntegrationsPage,
  head: () => ({ meta: [{ title: "Integrations — Polaris" }] }),
});

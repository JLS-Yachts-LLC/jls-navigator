import { createFileRoute, Navigate } from "@tanstack/react-router";

/**
 * Legacy route. The standalone Developer → Integrations page duplicated
 * Settings → Integrations (credentials, SharePoint sync configs) and Sync Centre
 * (schedules, status, run-now), so it was removed. Old links land on the tab.
 */
export const Route = createFileRoute("/_app/integrations")({
  component: () => (
    <Navigate to="/polaris-redesign" search={{ screen: "settings" } as any} replace />
  ),
  head: () => ({ meta: [{ title: "Integrations — Polaris" }] }),
});

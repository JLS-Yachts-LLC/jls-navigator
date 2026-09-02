import { createFileRoute, Navigate } from "@tanstack/react-router";

/**
 * Legacy route — kept so existing links keep working. The page itself lives in the
 * Polaris shell now (Settings group in the sidebar); rendering it bare here left it
 * without any navigation.
 */
export const Route = createFileRoute("/_app/error-log")({
  component: () => (
    <Navigate to="/polaris-redesign" search={{ screen: "admin-errors" } as any} replace />
  ),
  head: () => ({ meta: [{ title: "Error & Warning Log — Polaris" }] }),
});

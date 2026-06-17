import { createFileRoute } from "@tanstack/react-router";
import { DevSettingsPage } from "@/components/dev/dev-settings-page";

export const Route = createFileRoute("/_app/dev-settings")({
  component: DevSettingsPage,
  head: () => ({ meta: [{ title: "Dev Settings — Polaris" }] }),
});

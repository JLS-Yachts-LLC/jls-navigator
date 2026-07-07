import { createFileRoute } from "@tanstack/react-router";
import { YachtsPage } from "@/components/vessels/yachts-registry-page";

// Thin route wrapper — the page lives in components/ so this file has no extra
// exports and the router can code-split it cleanly.
export const Route = createFileRoute("/_app/yachts/")({
  component: YachtsPage,
  head: () => ({ meta: [{ title: "Yachts — Polaris" }] }),
});

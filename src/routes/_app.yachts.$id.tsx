import { createFileRoute } from "@tanstack/react-router";
import { YachtDetail } from "@/components/vessels/yacht-detail-page";

// Thin route wrapper — the page lives in components/ so this file has no extra
// exports and the router can code-split it cleanly.
export const Route = createFileRoute("/_app/yachts/$id")({
  component: YachtDetail,
});

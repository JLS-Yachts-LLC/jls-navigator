import { createFileRoute } from "@tanstack/react-router";
import { PermitsPage } from "@/components/permits-page";
import { PERMIT_META } from "@/lib/permit-types";

export const Route = createFileRoute("/_app/permits/cruising-tenders")({
  component: () => <PermitsPage permitType="cruising_tenders" />,
  head: () => ({ meta: [{ title: `${PERMIT_META.cruising_tenders.label} — Polaris` }] }),
});

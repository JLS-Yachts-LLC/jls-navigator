import { createFileRoute } from "@tanstack/react-router";
import { PermitsPage } from "@/components/permits-page";
import { PERMIT_META } from "@/lib/permit-types";

export const Route = createFileRoute("/_app/permits/dma")({
  component: () => <PermitsPage permitType="dma" />,
  head: () => ({ meta: [{ title: `${PERMIT_META.dma.label} — JLS Yachts CRM` }] }),
});

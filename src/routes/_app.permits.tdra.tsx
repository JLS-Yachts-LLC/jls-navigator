import { createFileRoute } from "@tanstack/react-router";
import { PermitsPage } from "@/components/permits-page";
import { PERMIT_META } from "@/lib/permit-types";

export const Route = createFileRoute("/_app/permits/tdra")({
  component: () => <PermitsPage permitType="tdra" />,
  head: () => ({ meta: [{ title: `${PERMIT_META.tdra.label} — Polaris` }] }),
});

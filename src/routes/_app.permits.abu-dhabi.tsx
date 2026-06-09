import { createFileRoute } from "@tanstack/react-router";
import { PermitsPage } from "@/components/permits-page";
import { PERMIT_META } from "@/lib/permit-types";

export const Route = createFileRoute("/_app/permits/abu-dhabi")({
  component: () => <PermitsPage permitType="abu_dhabi" />,
  head: () => ({ meta: [{ title: `${PERMIT_META.abu_dhabi.label} — Polaris` }] }),
});

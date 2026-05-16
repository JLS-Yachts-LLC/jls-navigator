import { createFileRoute } from "@tanstack/react-router";
import { PermitsPage } from "@/components/permits-page";
import { PERMIT_META } from "@/lib/permit-types";

export const Route = createFileRoute("/_app/permits/gate-pass")({
  component: () => <PermitsPage permitType="gate_pass" />,
  head: () => ({ meta: [{ title: `${PERMIT_META.gate_pass.label} — JLS Yachts CRM` }] }),
});

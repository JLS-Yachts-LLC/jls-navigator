import { createFileRoute } from "@tanstack/react-router";
import { PermitsPage } from "@/components/permits-page";
import { PERMIT_META } from "@/lib/permit-types";

export const Route = createFileRoute("/_app/permits/sanitation")({
  component: () => <PermitsPage permitType="sanitation" />,
  head: () => ({ meta: [{ title: `${PERMIT_META.sanitation.label} — JLS Yachts CRM` }] }),
});

import { createFileRoute } from "@tanstack/react-router";
import { PermitsPage } from "@/components/permits-page";
import { PERMIT_META } from "@/lib/permit-types";

export const Route = createFileRoute("/_app/permits/exit-entry")({
  component: () => <PermitsPage permitType="exit_entry" />,
  head: () => ({ meta: [{ title: `${PERMIT_META.exit_entry.label} — JLS Yachts CRM` }] }),
});

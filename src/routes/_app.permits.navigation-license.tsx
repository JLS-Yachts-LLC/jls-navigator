import { createFileRoute } from "@tanstack/react-router";
import { PermitsPage } from "@/components/permits-page";
import { PERMIT_META } from "@/lib/permit-types";

export const Route = createFileRoute("/_app/permits/navigation-license")({
  component: () => <PermitsPage permitType="navigation_license" />,
  head: () => ({ meta: [{ title: `${PERMIT_META.navigation_license.label} — Polaris` }] }),
});

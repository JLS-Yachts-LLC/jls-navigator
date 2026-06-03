import { createFileRoute } from "@tanstack/react-router";
import { PermitsPage } from "@/components/permits-page";
import { PERMIT_META } from "@/lib/permit-types";

// @ts-expect-error — route path added to FileRoutesByPath after next dev-server run
export const Route = createFileRoute("/_app/permits/abu-dhabi" as any)({
  component: () => <PermitsPage permitType="abu_dhabi" />,
  head: () => ({ meta: [{ title: `${PERMIT_META.abu_dhabi.label} — JLS Yachts CRM` }] }),
});

import { createFileRoute } from "@tanstack/react-router";
import { CrmLookupPage } from "@/components/crm/crm-lookup-page";

// 3CX screen-pop target: 3CX opens this URL on an incoming call with the caller
// number/name, and Polaris shows who's calling (see Settings → Integration →
// Custom CRM → Open contact URL).
export const Route = createFileRoute("/_app/crm-lookup")({
  validateSearch: (s: Record<string, unknown>) => ({
    phoneNumber: typeof s.phoneNumber === "string" ? s.phoneNumber : "",
    displayName: typeof s.displayName === "string" ? s.displayName : "",
  }),
  component: CrmLookupPage,
  head: () => ({ meta: [{ title: "Caller lookup — Polaris" }] }),
});

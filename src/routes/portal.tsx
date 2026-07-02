import { createFileRoute } from "@tanstack/react-router";
import { CaptainPortal } from "@/components/portal/captain-portal";

// Captain's View — the client portal. NOT under `_app` (own auth + MFA flow,
// no staff shell). All data access is scoped server-side by RLS to the
// captain's own yacht and requires an MFA-verified (aal2) session.
export const Route = createFileRoute("/portal")({
  component: CaptainPortal,
  head: () => ({ meta: [{ title: "Captain's Portal — JLS Yachts" }] }),
});

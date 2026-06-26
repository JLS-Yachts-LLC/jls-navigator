import { createFileRoute, redirect } from "@tanstack/react-router";

// Certifications are now part of the unified Training page (tab = certifications).
// Redirect anyone hitting /training/certifications directly.
export const Route = createFileRoute("/_app/training/certifications")({
  beforeLoad: () => { throw redirect({ to: "/training" }); },
});

import { createFileRoute } from "@tanstack/react-router";
import { PermitCommandCentre } from "@/components/permit-command-centre";

export const Route = createFileRoute("/_app/permits/command-centre")({
  component: PermitCommandCentre,
  head: () => ({ meta: [{ title: "Permit Command Centre — Polaris" }] }),
});

import { createFileRoute } from "@tanstack/react-router";
import { ModuleStub } from "@/components/module-stub";
import { UserPlus } from "lucide-react";

export const Route = createFileRoute("/_app/crew-placement" as any)({
  component: () => (
    <ModuleStub
      icon={<UserPlus />}
      name="Crew Placement"
      tagline="Matching Talent to Vessels"
      description="End-to-end crew recruitment and placement for superyachts — connecting qualified seafarers with the right vessel opportunities."
      phase="Phase 8"
      accentColor="text-violet-400"
      features={[
        "Crew candidate database",
        "Position vacancy management",
        "CV & certification review",
        "Interview scheduling",
        "Contract management",
        "Placement tracking",
        "Integration with Crew & Immigration",
      ]}
    />
  ),
  head: () => ({ meta: [{ title: "Crew Placement — Aquila One" }] }),
});

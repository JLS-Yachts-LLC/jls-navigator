import { createFileRoute } from "@tanstack/react-router";
import { ModuleStub } from "@/components/module-stub";
import { Compass } from "lucide-react";

export const Route = createFileRoute("/_app/compass" as any)({
  component: () => (
    <ModuleStub
      icon={<Compass />}
      name="Compass"
      tagline="Regional Marketplace & Vendor Network"
      description="The regional marketplace connecting superyacht owners, operators, and crew with vetted service providers, marinas, and agents across the Middle East, Indian Ocean, and beyond."
      phase="Phase 10"
      accentColor="text-orange-400"
      features={[
        "Vetted supplier & vendor network",
        "Regional service provider directory",
        "Marina & berth bookings",
        "Port agent network",
        "Multi-country agency coverage",
        "Service ratings & reviews",
        "Real-time availability",
      ]}
    />
  ),
  head: () => ({ meta: [{ title: "Compass — Aquila One" }] }),
});

import { createFileRoute } from "@tanstack/react-router";
import { ModuleStub } from "@/components/module-stub";
import { UtensilsCrossed } from "lucide-react";

export const Route = createFileRoute("/_app/provisioning")({
  component: () => (
    <ModuleStub
      icon={<UtensilsCrossed />}
      name="Superyacht Provisioning"
      tagline="Food, Beverage & Guest Experiences"
      description="Premium provisioning management for superyachts — from daily provisions to special events and VIP guest experiences."
      phase="Phase 5"
      accentColor="text-emerald-400"
      features={[
        "Food & beverage provisioning",
        "Interior supplies management",
        "Floral arrangements & décor",
        "Guest requests & preferences",
        "Special orders & dietary requirements",
        "Event support & planning",
        "Vendor & supplier coordination",
      ]}
    />
  ),
  head: () => ({ meta: [{ title: "Superyacht Provisioning — Aquila One" }] }),
});

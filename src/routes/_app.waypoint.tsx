import { createFileRoute } from "@tanstack/react-router";
import { ModuleStub } from "@/components/module-stub";
import { ShoppingCart } from "lucide-react";

export const Route = createFileRoute("/_app/waypoint" as any)({
  component: () => (
    <ModuleStub
      icon={<ShoppingCart />}
      name="Waypoint"
      tagline="Chandlery & Procurement"
      description="End-to-end procurement management for superyacht chandlery, spare parts, and vendor relationships — all in one place."
      phase="Phase 3"
      accentColor="text-amber-400"
      features={[
        "Procurement requests & purchase orders",
        "Quotations from approved vendors",
        "Supplier management & approved vendor network",
        "Inventory support",
        "Multi-currency purchasing",
        "QuickBooks integration",
        "Customer portals for vessel owners",
      ]}
    />
  ),
  head: () => ({ meta: [{ title: "Waypoint — Aquila One" }] }),
});

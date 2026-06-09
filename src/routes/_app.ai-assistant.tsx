import { createFileRoute } from "@tanstack/react-router";
import { ModuleStub } from "@/components/module-stub";
import { Bot } from "lucide-react";

export const Route = createFileRoute("/_app/ai-assistant")({
  component: () => (
    <ModuleStub
      icon={<Bot />}
      name="AI Assistant"
      tagline="Powered by Claude · Aquila AI"
      description="Your intelligent operations co-pilot. Ask anything about permits, regulations, SOPs, crew management, or operational procedures — and get expert-grade answers instantly."
      phase="Phase 3"
      accentColor="text-cyan-400"
      features={[
        "Permit guidance & regulatory assistance",
        "Operational knowledge base search",
        "Document generation & drafting",
        "Internal staff support",
        "Customer support assistance",
        "SOP guidance & procedure lookup",
        "Training support",
        "Predictive compliance (coming later)",
        "Smart routing suggestions (coming later)",
        "Intelligent procurement (coming later)",
      ]}
    />
  ),
  head: () => ({ meta: [{ title: "AI Assistant — Polaris" }] }),
});

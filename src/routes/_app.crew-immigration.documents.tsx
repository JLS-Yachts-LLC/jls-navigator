import { createFileRoute } from "@tanstack/react-router";
import { ModuleStub } from "@/components/module-stub";
import { FileText } from "lucide-react";

export const Route = createFileRoute("/_app/crew-immigration/documents" as any)({
  component: () => (
    <ModuleStub
      icon={<FileText />}
      name="Crew Documents"
      tagline="Document Vault for Every Crew Member"
      description="Centralised document management for all crew — passports, certificates, medical records, and employment documents in one secure location."
      phase="Phase 1"
      accentColor="text-blue-400"
      features={[
        "Passport & ID document storage",
        "STCW & safety certificate tracking",
        "Medical certificate management",
        "Seaman's book records",
        "Expiry alerts & renewal reminders",
        "Secure document sharing",
        "Audit trail for compliance",
      ]}
    />
  ),
  head: () => ({ meta: [{ title: "Crew Documents — Aquila One" }] }),
});

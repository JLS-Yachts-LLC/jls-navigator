import { createFileRoute } from "@tanstack/react-router";
import { ModuleStub } from "@/components/module-stub";
import { GraduationCap } from "lucide-react";

export const Route = createFileRoute("/_app/training")({
  component: () => (
    <ModuleStub
      icon={<GraduationCap />}
      name="JLS Yacht Training Institute"
      tagline="Crew Development & Certification"
      description="Track, manage and develop crew training records, certifications, and professional development — with automated expiry notifications."
      phase="Phase 7"
      accentColor="text-blue-400"
      features={[
        "Training records & history",
        "Certification tracking (STCW, medical, safety)",
        "Course booking & scheduling",
        "Expiry notifications & renewal reminders",
        "Crew development planning",
        "Daywork booking",
        "Compliance reporting",
      ]}
    />
  ),
  head: () => ({ meta: [{ title: "JLS Training Institute — Aquila One" }] }),
});

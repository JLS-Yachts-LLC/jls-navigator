import { createFileRoute } from "@tanstack/react-router";
import { ModuleStub } from "@/components/module-stub";
import { LogIn } from "lucide-react";

export const Route = createFileRoute("/_app/crew-immigration/sign-on-off")({
  component: () => (
    <ModuleStub
      icon={<LogIn />}
      name="Sign On / Sign Off"
      tagline="Crew Movements & Immigration Status"
      description="Track crew sign-on and sign-off events, immigration status, and vessel movements in real time."
      phase="Phase 1"
      accentColor="text-emerald-400"
      features={[
        "Digital sign-on & sign-off reporting",
        "Crew movement tracking",
        "Immigration status per crew member",
        "Port authority notifications",
        "Historical movement log",
        "Integration with Crew & Immigration profiles",
      ]}
    />
  ),
  head: () => ({ meta: [{ title: "Sign On / Sign Off — Aquila One" }] }),
});

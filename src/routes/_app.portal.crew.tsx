import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { PolarisShell, PanelGrid, MetricCard, ListPanel, Panel } from "@/components/platform/PolarisShell";
import { IdCard, Plane, GraduationCap, Bell } from "lucide-react";

export const Route = createFileRoute("/_app/portal/crew")({
  component: CrewPortal,
  head: () => ({ meta: [{ title: "Crew Portal — Polaris" }] }),
});

function CrewPortal() {
  const { user } = useAuth();
  const name = (user as any)?.user_metadata?.full_name ?? user?.email ?? "Crew Member";

  return (
    <PolarisShell label="Polaris / Crew" title="Crew Portal — Personal & Development Hub">
      <Panel title="Personal Profile">
        <div className="text-sm">
          <div className="font-medium">{name}</div>
          <div className="text-muted-foreground">{user?.email}</div>
        </div>
      </Panel>

      <PanelGrid>
        <MetricCard label="Visa Status" value="—" icon={<Plane className="h-4 w-4" />} />
        <MetricCard label="Passport Expiry" value="—" icon={<IdCard className="h-4 w-4" />} />
        <MetricCard label="Certificates" value="—" icon={<GraduationCap className="h-4 w-4" />} />
        <MetricCard label="Notifications" value="—" icon={<Bell className="h-4 w-4" />} />
      </PanelGrid>

      <div className="grid gap-4 lg:grid-cols-2">
        <ListPanel title="Course Bookings" items={[]} empty="No course bookings" render={() => null} />
        <ListPanel title="Crew Placement Opportunities" items={[]} empty="No opportunities listed" render={() => null} />
        <ListPanel title="Daywork Bookings" items={[]} empty="No daywork bookings" render={() => null} />
        <ListPanel title="Gate Pass Status" items={[]} empty="No gate passes" render={() => null} />
      </div>
    </PolarisShell>
  );
}

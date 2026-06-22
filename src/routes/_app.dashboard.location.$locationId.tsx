import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PolarisShell, PanelGrid, MetricCard, ListPanel } from "@/components/platform/PolarisShell";
import { Ship, Anchor, ClipboardCheck, Users } from "lucide-react";

export const Route = createFileRoute("/_app/dashboard/location/$locationId")({
  component: LocationDashboard,
  head: () => ({ meta: [{ title: "Location Dashboard — Polaris" }] }),
});

function LocationDashboard() {
  const { locationId } = Route.useParams();
  const { data: loc, isLoading } = useQuery({
    queryKey: ["location", locationId],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("locations").select("location_id, name, country_code").eq("location_id", locationId).maybeSingle();
      return data;
    },
  });

  return (
    <PolarisShell
      label="Polaris / Regional Operations"
      title={loc?.name ?? "Location Dashboard"}
      workspace={loc ? { type: "organisation", label: loc.name } : null}
    >
      <PanelGrid>
        <MetricCard label="Active Yachts" value="—" loading={isLoading} icon={<Ship className="h-4 w-4" />} />
        <MetricCard label="Port Calls" value="—" icon={<Anchor className="h-4 w-4" />} />
        <MetricCard label="Clearance Requests" value="—" icon={<ClipboardCheck className="h-4 w-4" />} />
        <MetricCard label="Crew Movements" value="—" icon={<Users className="h-4 w-4" />} />
      </PanelGrid>

      <div className="grid gap-4 lg:grid-cols-2">
        <ListPanel title="Logistics Jobs" items={[]} empty="No active jobs" render={() => null} />
        <ListPanel title="Pending Tasks" items={[]} empty="No pending tasks" render={() => null} />
        <ListPanel title="Local Suppliers" items={[]} empty="No suppliers listed" render={() => null} />
        <ListPanel title="Local Operational Updates" items={[]} empty="No updates" render={() => null} />
      </div>
    </PolarisShell>
  );
}

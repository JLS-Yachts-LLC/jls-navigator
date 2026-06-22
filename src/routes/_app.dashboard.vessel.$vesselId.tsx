import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAccess } from "@/lib/auth/useAccess";
import {
  PolarisShell, PanelGrid, MetricCard, ListPanel, VesselBanner,
} from "@/components/platform/PolarisShell";
import { Users, CheckSquare, ShieldCheck, Package } from "lucide-react";

export const Route = createFileRoute("/_app/dashboard/vessel/$vesselId")({
  component: VesselDashboard,
  head: () => ({ meta: [{ title: "Vessel Dashboard — Polaris" }] }),
});

function VesselDashboard() {
  const { vesselId } = Route.useParams();
  const { hasVesselAccess, isGlobalAdmin } = useAccess();
  const allowed = isGlobalAdmin || hasVesselAccess(vesselId);

  const { data: vessel, isLoading: vLoading } = useQuery({
    queryKey: ["vessel", vesselId],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("yachts").select("id, vessel_name, vessel_type, flag").eq("id", vesselId).maybeSingle();
      return data;
    },
  });

  const { data: crewCount, isLoading: cLoading } = useQuery({
    queryKey: ["vessel-crew-count", vesselId],
    queryFn: async () => {
      const { count } = await (supabase as any)
        .from("crew_members").select("id", { count: "exact", head: true }).eq("yacht_id", vesselId);
      return count ?? 0;
    },
  });

  if (!allowed) {
    return (
      <PolarisShell label="Polaris / Vessel" title="Access restricted">
        <p className="text-sm text-muted-foreground">You don't have access to this vessel.</p>
      </PolarisShell>
    );
  }

  return (
    <PolarisShell
      label="Polaris / Vessel Operations"
      title={vessel?.vessel_name ?? "Vessel Dashboard"}
      workspace={{ type: "vessel", label: vessel?.vessel_name ?? vesselId.slice(0, 8) }}
    >
      <VesselBanner name={vessel?.vessel_name ?? "—"} sub={vessel?.vessel_type ?? undefined} flag={vessel?.flag} />

      <PanelGrid>
        <MetricCard label="Crew" value={crewCount ?? 0} loading={cLoading || vLoading} icon={<Users className="h-4 w-4" />} />
        <MetricCard label="Open Tasks" value="—" sub="No task source wired" icon={<CheckSquare className="h-4 w-4" />} />
        <MetricCard label="Compliance" value="—" sub="items requiring attention" icon={<ShieldCheck className="h-4 w-4" />} />
        <MetricCard label="Deliveries" value="—" icon={<Package className="h-4 w-4" />} />
      </PanelGrid>

      <div className="grid gap-4 lg:grid-cols-3">
        <ListPanel title="Ship Spares" items={[]} empty="No spares in transit" render={() => null} />
        <ListPanel title="Compliance" items={[]} empty="No compliance items" render={() => null} />
        <ListPanel title="Visa Reports" items={[]} empty="No visa reports" render={() => null} />
      </div>

      <ListPanel title="Recent Activity" items={[]} empty="No recent activity recorded for this vessel" render={() => null} />
    </PolarisShell>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useAccess } from "@/lib/auth/useAccess";
import { PolarisShell, PanelGrid, MetricCard, ListPanel, Panel } from "@/components/platform/PolarisShell";
import { Wallet, FileText, TrendingUp, Receipt } from "lucide-react";

export const Route = createFileRoute("/_app/portal/owner")({
  component: OwnerPortal,
  head: () => ({ meta: [{ title: "Owner Portal — Polaris" }] }),
});

function OwnerPortal() {
  const { canAccessModule, isGlobalAdmin } = useAccess();
  const finance = isGlobalAdmin || canAccessModule("finance", "finance");

  return (
    <PolarisShell label="Polaris / Owner" title="Owner Dashboard — Financial & Performance Overview">
      <PanelGrid>
        <MetricCard label="Financial Summary (YTD)" value="—" locked={!finance} icon={<Wallet className="h-4 w-4" />} />
        <MetricCard label="Open Requests" value="—" icon={<FileText className="h-4 w-4" />} />
        <MetricCard label="Upcoming Costs" value="—" locked={!finance} icon={<TrendingUp className="h-4 w-4" />} />
        <MetricCard label="Vessel Reports" value="—" icon={<Receipt className="h-4 w-4" />} />
      </PanelGrid>

      <div className="grid gap-4 lg:grid-cols-3">
        <ListPanel title="Open Requests" items={[]} empty="No open requests" render={() => null} />
        {finance
          ? <ListPanel title="Upcoming Costs" items={[]} empty="No upcoming costs" render={() => null} />
          : <Panel title="Upcoming Costs"><p className="py-4 text-center text-[13px] text-muted-foreground/70">Requires finance access</p></Panel>}
        <ListPanel title="Vessel Reports" items={[]} empty="No reports" render={() => null} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Latest Invoice">
          <p className="py-4 text-center text-[13px] text-muted-foreground/70">{finance ? "No invoice available" : "Requires finance access"}</p>
        </Panel>
        <Panel title="Statement of Account">
          <p className="py-4 text-center text-[13px] text-muted-foreground/70">{finance ? "No statement available" : "Requires finance access"}</p>
        </Panel>
      </div>
    </PolarisShell>
  );
}

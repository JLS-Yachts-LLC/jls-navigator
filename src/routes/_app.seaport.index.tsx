import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PolarisShell } from "@/components/platform/PolarisShell";
import { RequestStatusBadge } from "@/components/seaport/RequestStatusBadge";
import { SLATimer } from "@/components/seaport/SLATimer";
import { Button } from "@/components/ui/button";
import { Loader2, Plus, Ship, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/_app/seaport/")({
  component: SeaportQueue,
  head: () => ({ meta: [{ title: "Seaport Immigration — Polaris" }] }),
});

const fmtDate = (d: string) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

function SeaportQueue() {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ["seaport-queue"],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data: reqs } = await (supabase as any)
        .from("seaport_requests")
        .select("request_id, vessel_id, request_date, status, created_at, completed_at, yachts:vessel_id(vessel_name), seaport_sla(submitted_at, sla_target_mins, sla_breached, mins_to_completion)")
        .order("created_at", { ascending: false })
        .limit(200);
      const ids = (reqs ?? []).map((r: any) => r.request_id);
      const [{ data: arr }, { data: dep }] = await Promise.all([
        (supabase as any).from("seaport_arrivals").select("request_id").in("request_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]),
        (supabase as any).from("seaport_departures").select("request_id").in("request_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]),
      ]);
      const countBy = (rows: any[]) => rows.reduce((m, r) => ((m[r.request_id] = (m[r.request_id] ?? 0) + 1), m), {} as Record<string, number>);
      const arrCounts = countBy(arr ?? []); const depCounts = countBy(dep ?? []);
      return (reqs ?? []).map((r: any) => ({
        ...r,
        vesselName: r.yachts?.vessel_name ?? "Unknown vessel",
        arrivals: arrCounts[r.request_id] ?? 0,
        departures: depCounts[r.request_id] ?? 0,
        sla: Array.isArray(r.seaport_sla) ? r.seaport_sla[0] : r.seaport_sla,
      }));
    },
  });

  return (
    <PolarisShell
      label="Polaris / Port & Agency"
      title="Seaport Immigration"
      actions={<Button size="sm" className="gap-1.5" onClick={() => navigate({ to: "/seaport/new" as any })}><Plus className="h-4 w-4" /> New Request</Button>}
    >
      {isLoading ? (
        <div className="flex h-40 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : !data || data.length === 0 ? (
        <div className="flex h-40 flex-col items-center justify-center gap-2 text-center text-muted-foreground">
          <Ship className="h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm">No seaport requests yet.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">Vessel</th>
                <th className="px-4 py-2.5 font-medium">Week</th>
                <th className="px-4 py-2.5 font-medium">Crew</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium w-44">SLA</th>
                <th className="px-4 py-2.5 w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.map((r: any) => (
                <tr key={r.request_id} className="cursor-pointer hover:bg-muted/20"
                  onClick={() => navigate({ to: "/seaport/$requestId" as any, params: { requestId: r.request_id } })}>
                  <td className="px-4 py-3 font-medium">{r.vesselName}</td>
                  <td className="px-4 py-3 text-muted-foreground">{fmtDate(r.request_date)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.arrivals} arr · {r.departures} dep</td>
                  <td className="px-4 py-3"><RequestStatusBadge status={r.status} /></td>
                  <td className="px-4 py-3">
                    {r.sla?.submitted_at && (
                      <SLATimer submittedAt={r.sla.submitted_at} targetMins={r.sla.sla_target_mins ?? 240}
                        completedAt={r.status === "completed" || r.status === "report_sent" ? r.completed_at : null} />
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground/50"><ArrowRight className="h-4 w-4" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PolarisShell>
  );
}

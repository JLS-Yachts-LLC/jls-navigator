import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { RequestStatusBadge } from "@/components/seaport/RequestStatusBadge";
import { Button } from "@/components/ui/button";
import { Plus, Anchor, Loader2 } from "lucide-react";

const fmtDate = (d: string) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

/** Seaport Immigration summary for the vessel detail page. Ticket #127. */
export function SeaportImmigrationSection({ vesselId }: { vesselId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["seaport-vessel", vesselId],
    queryFn: async () => {
      const { data: reqs } = await (supabase as any)
        .from("seaport_requests")
        .select("request_id, request_date, status")
        .eq("vessel_id", vesselId).order("request_date", { ascending: false }).limit(6);
      const ids = (reqs ?? []).map((r: any) => r.request_id);
      const [{ data: arr }, { data: dep }] = await Promise.all([
        (supabase as any).from("seaport_arrivals").select("request_id").in("request_id", ids.length ? ids : ["x"]),
        (supabase as any).from("seaport_departures").select("request_id").in("request_id", ids.length ? ids : ["x"]),
      ]);
      const by = (rows: any[]) => (rows ?? []).reduce((m, r) => ((m[r.request_id] = (m[r.request_id] ?? 0) + 1), m), {} as Record<string, number>);
      const a = by(arr ?? []); const d = by(dep ?? []);
      return (reqs ?? []).map((r: any) => ({ ...r, arrivals: a[r.request_id] ?? 0, departures: d[r.request_id] ?? 0 }));
    },
  });

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold"><Anchor className="h-4 w-4 text-primary" /> Seaport Immigration</h2>
        <Link to={"/seaport/new" as any} search={{ vesselId } as any}>
          <Button size="sm" variant="outline" className="h-7 gap-1 text-xs"><Plus className="h-3.5 w-3.5" /> New Request</Button>
        </Link>
      </div>
      {isLoading ? (
        <div className="flex justify-center py-6"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
      ) : !data || data.length === 0 ? (
        <p className="px-4 py-5 text-center text-[13px] text-muted-foreground/70">No seaport requests for this vessel yet.</p>
      ) : (
        <div className="divide-y divide-border/50">
          {data.map((r: any) => (
            <Link key={r.request_id} to={"/seaport/$requestId" as any} params={{ requestId: r.request_id } as any}
              className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-muted/20">
              <span className="w-28 shrink-0 text-muted-foreground">{fmtDate(r.request_date)}</span>
              <span className="flex-1 text-muted-foreground">{r.arrivals} arrival{r.arrivals !== 1 ? "s" : ""} · {r.departures} departure{r.departures !== 1 ? "s" : ""}</span>
              <RequestStatusBadge status={r.status} />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

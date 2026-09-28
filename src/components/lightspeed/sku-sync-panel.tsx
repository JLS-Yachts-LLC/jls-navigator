import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/**
 * Manual Lightspeed → QuickBooks SKU sync. Paste one or more SKUs; each is looked
 * up in Lightspeed Retail and created (or updated) as an item in the retail
 * QuickBooks company — the on-demand counterpart of the webhook product sync.
 * Reused on the Automations page and the Waypoint Chandlery suppliers screen.
 *
 * With `linkToken` set it runs on the public /sku-sync/<token> page instead: the
 * token goes in the query string and no Supabase session is needed — the API
 * accepts the link token in place of an admin session (see api.lightspeed.sync).
 */
type LsSkuResult = { sku: string; action: "created" | "updated" | "not-found" | "error"; detail: string };
type LsSyncResult = { ok: boolean; processed: number; created: number; updated: number; notFound: number; errors: number; results: LsSkuResult[] };

const ACTION_CLS: Record<string, string> = {
  created: "bg-emerald-500/15 text-emerald-500",
  updated: "bg-blue-500/15 text-blue-400",
  "not-found": "bg-amber-500/15 text-amber-500",
  error: "bg-red-500/15 text-red-500",
};

export function LightspeedSkuSyncPanel({ compact = false, linkToken }: { compact?: boolean; linkToken?: string }) {
  const [skus, setSkus] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<LsSyncResult | null>(null);

  async function run() {
    if (!skus.trim()) return;
    setBusy(true);
    setResult(null);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      let url = "/api/lightspeed/sync";
      if (linkToken) {
        url += `?token=${encodeURIComponent(linkToken)}`;
      } else {
        const { data: { session } } = await (supabase as any).auth.getSession();
        headers.Authorization = `Bearer ${session?.access_token ?? ""}`;
      }
      const res = await fetch(url, { method: "POST", headers, body: JSON.stringify({ skus }) });
      const j = await res.json();
      if (!res.ok && !j.results) throw new Error(j.error ?? `HTTP ${res.status}`);
      setResult(j as LsSyncResult);
      const j2 = j as LsSyncResult;
      if (j2.errors) toast.error(`${j2.created + j2.updated} done, ${j2.errors} error(s)`);
      else toast.success(`${j2.created} created, ${j2.updated} updated${j2.notFound ? `, ${j2.notFound} not found` : ""}`);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    } finally { setBusy(false); }
  }

  return (
    <div className={compact ? "" : "rounded-lg border border-border/60 bg-background/40 p-3"}>
      {!compact && (
        <div className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
          Create / update items from Lightspeed SKUs
        </div>
      )}
      <Textarea
        value={skus}
        onChange={(e) => setSkus(e.target.value)}
        placeholder={"One or more SKUs, separated by commas or new lines\ne.g. SY-10432, SY-10433"}
        rows={linkToken ? 5 : 3}
        className={linkToken ? "text-sm font-mono" : "text-xs font-mono"}
      />
      <div className="mt-2 flex items-center gap-2">
        <Button size="sm" className={linkToken ? "h-9 gap-1.5 text-sm" : "h-7 gap-1 text-xs"} disabled={!skus.trim() || busy} onClick={() => void run()}>
          {busy && <Loader2 className="h-3 w-3 animate-spin" />} Run SKU sync
        </Button>
        <span className={linkToken ? "text-sm text-muted-foreground" : "text-[11px] text-muted-foreground"}>
          Looks up each SKU in Lightspeed, then creates or updates the matching item in the retail QuickBooks company.
        </span>
      </div>
      {result && (
        <div className="mt-2.5 max-h-64 overflow-y-auto rounded-md border border-border/50">
          <table className={cn("w-full", linkToken ? "text-sm" : "text-xs")}>
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground/60">
                <th className="px-2 py-1.5">SKU</th>
                <th className="px-2 py-1.5">Result</th>
                <th className="px-2 py-1.5">Detail</th>
              </tr>
            </thead>
            <tbody>
              {result.results.map((r, i) => (
                <tr key={`${r.sku}-${i}`} className="border-t border-border/40">
                  <td className="whitespace-nowrap px-2 py-1.5 font-mono text-foreground/80">{r.sku}</td>
                  <td className="px-2 py-1.5">
                    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", ACTION_CLS[r.action] ?? "bg-muted/60 text-muted-foreground")}>
                      {r.action}
                    </span>
                  </td>
                  <td className="max-w-[360px] truncate px-2 py-1.5 text-muted-foreground" title={r.detail}>{r.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

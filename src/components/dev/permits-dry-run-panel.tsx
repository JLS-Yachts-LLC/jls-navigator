/**
 * Sync Centre → Permits: check the seven SharePoint permit lists before they go
 * back on.
 *
 * The permit lists overwrote each other's rows until 3 Sept 2026 and have been
 * switched off since. The matching is fixed and the duplicates removed; this runs
 * GET /api/sharepoint/permits-dry-run (global/org admin), which reads SharePoint
 * and reports per list what a real sync WOULD do: rows updated (and which fields
 * actually change), rows added, and "risky" changes — a permit moving to another
 * vessel or person, the old failure mode. Nothing is written.
 */
import { Fragment, useState } from "react";
import { AlertTriangle, ChevronDown, FlaskConical, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface Detail {
  permitType: string; spItems: number; polarisRows: number;
  updates: number; changedRows: number; inserts: number; riskyChanges: number;
  fieldChanges: Record<string, number>;
  samples: Array<{ id: string; holder: string; field: string; from: string; to: string; risky: boolean }>;
  insertSamples: Array<{ holder: string; vessel: string | null; permitNumber: string | null; expiry: string | null }>;
  insertsWithoutVessel: number;
}
interface ListResult { list: string; result: { synced: number; errors: number; samples?: string[]; dryRun?: Detail } }
interface DryRun {
  ok: boolean; error?: string;
  totals: { updates: number; changedRows: number; riskyChanges: number; inserts: number; errors: number };
  lists: ListResult[];
}

const FIELD_LABEL: Record<string, string> = {
  yacht_id: "vessel", holder_name: "holder", permit_type: "permit type", permit_number: "permit no.",
  expiry_date: "expiry", issue_date: "issue date", status: "status",
};
const label = (f: string) => FIELD_LABEL[f] ?? f.replace(/_/g, " ");

export function PermitsDryRunPanel({ lists }: { lists: Array<{ name: string; enabled: boolean; lastSyncedAt: string | null }> }) {
  const [busy, setBusy] = useState(false);
  const [run, setRun] = useState<DryRun | null>(null);
  const [ranAt, setRanAt] = useState<Date | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const offCount = lists.filter((l) => !l.enabled).length;
  const lastSync = lists.map((l) => l.lastSyncedAt).filter(Boolean).sort().at(-1) ?? null;

  const start = async () => {
    setBusy(true);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      const res = await fetch("/api/sharepoint/permits-dry-run", { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      const body = await res.json().catch(() => ({ ok: false, error: `Dry run failed (${res.status})` }));
      if (!res.ok || !body.ok) throw new Error(body.error ?? `Dry run failed (${res.status})`);
      setRun(body); setRanAt(new Date());
    } catch (e: any) {
      toast.error(e?.message ?? "Dry run failed");
    } finally { setBusy(false); }
  };

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 bg-card/60 px-4 py-2.5">
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Permits — check before switching back on
        </span>
        <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-medium",
          offCount ? "border-amber-500/40 bg-amber-500/10 text-amber-300" : "border-teal-500/40 bg-teal-500/10 text-teal-300")}>
          {offCount ? `${offCount} of ${lists.length} lists off` : "all lists on"}
          {lastSync && ` · last synced ${new Date(lastSync).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        <p className="min-w-[260px] flex-1 text-xs text-muted-foreground">
          Reads all {lists.length} SharePoint permit lists and shows what a real sync would change in Polaris — which permits it
          would update (and which fields), which it would add, and any that would move to a different vessel or person.
          <span className="text-foreground/80"> Nothing is written.</span> Takes up to a minute.
        </p>
        <Button size="sm" className="gap-1.5" disabled={busy} onClick={() => void start()}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FlaskConical className="h-3.5 w-3.5" />}
          {busy ? "Checking SharePoint…" : run ? "Run the dry run again" : "Dry run"}
        </Button>
      </div>

      {run && (
        <>
          <div className="grid grid-cols-2 gap-px border-y border-border/60 bg-border/40 text-center sm:grid-cols-5">
            {[
              { k: "Would update", v: run.totals.updates, sub: `${run.totals.changedRows} with a real change` },
              { k: "Values changed", v: run.totals.changedRows, sub: `${run.totals.updates - run.totals.changedRows} unchanged` },
              { k: "Would add", v: run.totals.inserts, sub: "new from SharePoint" },
              { k: "Risky changes", v: run.totals.riskyChanges, sub: "vessel / person / type replaced", warn: run.totals.riskyChanges > 0 },
              { k: "Errors", v: run.totals.errors, sub: "lists that failed", warn: run.totals.errors > 0 },
            ].map((t) => (
              <div key={t.k} className="bg-card px-3 py-2.5">
                <div className={cn("font-display text-xl font-bold", t.warn ? "text-amber-300" : "text-foreground")}>{t.v.toLocaleString()}</div>
                <div className="text-[11px] font-medium text-foreground/80">{t.k}</div>
                <div className="text-[10px] text-muted-foreground">{t.sub}</div>
              </div>
            ))}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="border-b border-border/60 text-[10.5px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-left font-semibold">List</th>
                  <th className="px-3 py-2 text-right font-semibold">In SharePoint</th>
                  <th className="px-3 py-2 text-right font-semibold">In Polaris now</th>
                  <th className="px-3 py-2 text-right font-semibold">Would change</th>
                  <th className="px-3 py-2 text-right font-semibold">Would add</th>
                  <th className="px-3 py-2 text-right font-semibold">Risky</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {run.lists.map((l) => {
                  const d = l.result.dryRun;
                  const isOpen = open === l.list;
                  return (
                    <Fragment key={l.list}>
                      <tr className={cn("border-b border-border/40", d && "cursor-pointer hover:bg-accent/20")}
                          onClick={() => d && setOpen(isOpen ? null : l.list)}>
                        <td className="px-4 py-2 font-medium">{l.list}</td>
                        {d ? (
                          <>
                            <td className="px-3 py-2 text-right tabular-nums">{d.spItems.toLocaleString()}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{d.polarisRows.toLocaleString()}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{d.changedRows.toLocaleString()} <span className="text-muted-foreground">of {d.updates.toLocaleString()}</span></td>
                            <td className="px-3 py-2 text-right tabular-nums">{d.inserts.toLocaleString()}</td>
                            <td className={cn("px-3 py-2 text-right tabular-nums", d.riskyChanges && "font-semibold text-amber-300")}>{d.riskyChanges}</td>
                            <td className="px-2"><ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition", isOpen && "rotate-180")} /></td>
                          </>
                        ) : (
                          <td colSpan={6} className="px-3 py-2 text-red-300">{l.result.samples?.[0] ?? "Failed"}</td>
                        )}
                      </tr>
                      {d && isOpen && (
                        <tr className="border-b border-border/40 bg-background/30">
                          <td colSpan={7} className="space-y-3 px-4 py-3">
                            {Object.keys(d.fieldChanges).length > 0 && (
                              <div>
                                <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">Fields that would change</div>
                                <div className="flex flex-wrap gap-1.5">
                                  {Object.entries(d.fieldChanges).sort((a, b) => b[1] - a[1]).map(([f, n]) => (
                                    <span key={f} className="rounded-full border border-border bg-background/50 px-2 py-0.5">{label(f)} · {n}</span>
                                  ))}
                                </div>
                              </div>
                            )}
                            {d.samples.length > 0 && (
                              <div>
                                <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">Examples</div>
                                <table className="w-full">
                                  <tbody>
                                    {d.samples.map((s, i) => (
                                      <tr key={i} className={cn(s.risky && "text-amber-200")}>
                                        <td className="w-5 py-0.5">{s.risky && <AlertTriangle className="h-3 w-3" />}</td>
                                        <td className="py-0.5 pr-3">{s.holder}</td>
                                        <td className="py-0.5 pr-3 text-muted-foreground">{label(s.field)}</td>
                                        <td className="py-0.5"><span className="line-through opacity-60">{s.from}</span> → {s.to}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                            {d.inserts > 0 && (
                              <div>
                                <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
                                  Would add {d.inserts.toLocaleString()} — first {d.insertSamples.length}
                                  {d.insertsWithoutVessel > 0 && <span className="normal-case tracking-normal text-amber-300"> · {d.insertsWithoutVessel} with no vessel matched</span>}
                                </div>
                                <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
                                  {d.insertSamples.map((s, i) => (
                                    <div key={i} className="truncate py-0.5">
                                      {s.holder} <span className="text-muted-foreground">· {s.vessel ?? "no vessel"}{s.permitNumber ? ` · ${s.permitNumber}` : ""}{s.expiry ? ` · expires ${s.expiry}` : ""}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            {!Object.keys(d.fieldChanges).length && !d.inserts && (
                              <div className="text-muted-foreground">Nothing would change on this list.</div>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2 text-[10.5px] text-muted-foreground">
            Checked {ranAt?.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}. Click a list for detail.
            A large "would add" on a short list (e.g. Navigation License) is expected — those rows were lost to the old overwriting and SharePoint is the source of truth.
          </div>
        </>
      )}
    </section>
  );
}

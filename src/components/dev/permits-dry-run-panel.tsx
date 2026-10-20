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
 *
 * A real run is two-way: the pull goes first, then every permit Polaris changed is
 * PUSHED over SharePoint. So the panel also shows that half — how many would
 * overwrite a SharePoint item, how many would create one, and how many of those
 * are really a bulk/system stamp rather than a member of staff.
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
  dateFixOnlyRows: number;
  unmatchedVessels: Array<{ name: string; count: number }>;
  conflicts: number;
  conflictSamples: Array<{ polarisId: string; itemId: string; reason: string; polaris: string; sharepoint: string; copyOf?: string }>;
  twinLinks: Array<{ polarisId: string; itemId: string; holder: string; vessel: string | null; issue: string | null; how?: string }>;
  copySkips: Array<{ itemId: string; holds: string; copyOf: string }>;
  nearMisses: Array<{ polarisId: string; polaris: string; itemId: string | null; sharepoint: string | null; why: string }>;
  testItems: number;
  testSamples: string[];
  push: { dirty: number; bulkStamped: number; patch: number; create: number; heldBack: number };
}
interface FixItem { list: string; itemId: string; holdsNow: string; shouldBe: string; note: string }
interface ListResult { list: string; result: { synced: number; errors: number; samples?: string[]; dryRun?: Detail } }
interface DryRun {
  ok: boolean; error?: string;
  totals: {
    updates: number; changedRows: number; riskyChanges: number; inserts: number; errors: number;
    dateFixOnlyRows: number; conflicts: number; twinLinks: number; testItems: number;
    pushDirty: number; pushBulkStamped: number; pushPatch: number; pushCreate: number; heldBack: number;
    copySkips: number; nearMisses: number;
  };
  lists: ListResult[];
  fixList: FixItem[];
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

          <div className="grid grid-cols-2 gap-px border-b border-border/60 bg-border/40 text-center sm:grid-cols-5">
            {[
              { k: "Polaris → SharePoint", v: run.totals.pushPatch, sub: "SharePoint items overwritten by Polaris", warn: run.totals.pushPatch > 0 },
              { k: "New in SharePoint", v: run.totals.pushCreate, sub: "items Polaris would create", warn: run.totals.pushCreate > 0 },
              { k: "Bulk-stamped", v: run.totals.pushBulkStamped, sub: `of ${run.totals.pushDirty.toLocaleString()} unpushed — not staff edits`, warn: run.totals.pushBulkStamped > 0 },
              { k: "Left alone", v: run.totals.conflicts + run.totals.copySkips, sub: `SharePoint item overwritten (${run.totals.copySkips} copies not added)` },
              { k: "Linked to twin", v: run.totals.twinLinks, sub: `Polaris permit found in SharePoint${run.totals.nearMisses ? ` · ${run.totals.nearMisses} near misses` : ""}` },
            ].map((t) => (
              <div key={t.k} className="bg-card px-3 py-2.5">
                <div className={cn("font-display text-xl font-bold", t.warn ? "text-amber-300" : "text-foreground")}>{t.v.toLocaleString()}</div>
                <div className="text-[11px] font-medium text-foreground/80">{t.k}</div>
                <div className="text-[10px] text-muted-foreground">{t.sub}</div>
              </div>
            ))}
          </div>
          {(run.totals.dateFixOnlyRows > 0 || run.totals.heldBack > 0 || run.totals.testItems > 0) && (
            <div className="space-y-0.5 border-b border-border/60 px-4 py-2 text-[11px] text-muted-foreground">
              {run.totals.dateFixOnlyRows > 0 && <div>{run.totals.dateFixOnlyRows.toLocaleString()} of the changed rows only move a date one day later — the fix for the old one-day-early import. Expected.</div>}
              {run.totals.heldBack > 0 && <div className="text-amber-300">{run.totals.heldBack.toLocaleString()} SharePoint updates would be held back because the Polaris row has unpushed changes — Polaris would overwrite SharePoint instead.</div>}
              {run.totals.testItems > 0 && <div>{run.totals.testItems} SharePoint test entries (&ldquo;TEST&rdquo;, &ldquo;123456&rdquo;) would not be added.</div>}
            </div>
          )}

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
                  <th className="px-3 py-2 text-right font-semibold">Left alone</th>
                  <th className="px-3 py-2 text-right font-semibold">Would push</th>
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
                            <td className="px-3 py-2 text-right tabular-nums">{d.conflicts}</td>
                            <td className={cn("px-3 py-2 text-right tabular-nums", d.push.patch + d.push.create > 0 && "text-amber-300")}>
                              {d.push.patch + d.push.create}{d.push.create > 0 && <span className="text-muted-foreground"> ({d.push.create} new)</span>}
                            </td>
                            <td className="px-2"><ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition", isOpen && "rotate-180")} /></td>
                          </>
                        ) : (
                          <td colSpan={8} className="px-3 py-2 text-red-300">{l.result.samples?.[0] ?? "Failed"}</td>
                        )}
                      </tr>
                      {d && isOpen && (
                        <tr className="border-b border-border/40 bg-background/30">
                          <td colSpan={9} className="space-y-3 px-4 py-3">
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
                            {d.conflicts > 0 && (
                              <div>
                                <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
                                  Left alone — the SharePoint item now holds a different permit ({d.conflicts})
                                </div>
                                <table className="w-full">
                                  <tbody>
                                    {d.conflictSamples.slice(0, 60).map((c, i) => (
                                      <tr key={i}>
                                        <td className="py-0.5 pr-3 text-muted-foreground">item {c.itemId}</td>
                                        <td className="py-0.5 pr-3">{c.polaris}</td>
                                        <td className="py-0.5 pr-3 text-muted-foreground">≠ {c.sharepoint}</td>
                                        <td className="py-0.5 text-muted-foreground">{c.reason}{c.copyOf && ` · same as ${c.copyOf}`}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                            {d.copySkips.length > 0 && (
                              <div>
                                <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
                                  Not added — a copy of another list&rsquo;s permit ({d.copySkips.length})
                                </div>
                                {d.copySkips.slice(0, 40).map((c) => (
                                  <div key={c.itemId} className="py-0.5">
                                    <span className="text-muted-foreground">item {c.itemId}</span> {c.holds} <span className="text-muted-foreground">· same as {c.copyOf}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                            {d.nearMisses.length > 0 && (
                              <div>
                                <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
                                  Would be created in SharePoint — closest SharePoint item on the same vessel
                                </div>
                                <table className="w-full">
                                  <tbody>
                                    {d.nearMisses.map((n) => (
                                      <tr key={n.polarisId} className={cn(n.itemId && "text-amber-200")}>
                                        <td className="py-0.5 pr-3">{n.polaris}</td>
                                        <td className="py-0.5 pr-3 text-muted-foreground">{n.itemId ? `item ${n.itemId}: ${n.sharepoint}` : "—"}</td>
                                        <td className="py-0.5 text-muted-foreground">{n.why}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                            {d.twinLinks.length > 0 && (
                              <div>
                                <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">Polaris permits linked to their SharePoint copy</div>
                                {d.twinLinks.map((t) => (
                                  <div key={t.polarisId} className="py-0.5">{t.holder} <span className="text-muted-foreground">· {t.vessel ?? "no vessel"}{t.issue ? ` · ${t.issue}` : ""} → item {t.itemId}{t.how ? ` (by ${t.how})` : ""}</span></div>
                                ))}
                              </div>
                            )}
                            {d.push.dirty > 0 && (
                              <div className="text-muted-foreground">
                                Push: {d.push.dirty} Polaris row(s) with unpushed changes ({d.push.bulkStamped} bulk-stamped) — {d.push.patch} would overwrite a SharePoint item, {d.push.create} would create one; {d.push.heldBack} SharePoint update(s) held back.
                              </div>
                            )}
                            {d.unmatchedVessels.length > 0 && (
                              <div className="text-muted-foreground">
                                Vessel names not found in Polaris: {d.unmatchedVessels.map((v) => `${v.name} (${v.count})`).join(", ")}
                              </div>
                            )}
                            {d.testItems > 0 && (
                              <div className="text-muted-foreground">Test entries not added: {d.testSamples.join("; ")}</div>
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
          {run.fixList?.length > 0 && <FixList items={run.fixList} />}
          <div className="px-4 py-2 text-[10.5px] text-muted-foreground">
            Checked {ranAt?.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}. Click a list for detail.
            A large "would add" on a short list (e.g. Navigation License) is expected — those rows were lost to the old overwriting and SharePoint is the source of truth.
          </div>
        </>
      )}
      <RepairSharePoint />
      <DmaCopies />
    </section>
  );
}

/**
 * The SharePoint items staff need to correct by hand — what each holds now and
 * what it should hold — to copy into an email or download for Hilary.
 */
function FixList({ items }: { items: FixItem[] }) {
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, 25);
  const csv = () => {
    const q = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
    return ["List,Item,Holds now,Should be,Why", ...items.map((i) => [i.list, i.itemId, i.holdsNow, i.shouldBe, i.note].map(q).join(","))].join("\r\n");
  };
  const copy = async () => {
    const text = items.map((i) => `${i.list} item ${i.itemId}: holds "${i.holdsNow}" — should be "${i.shouldBe}" (${i.note})`).join("\n");
    try { await navigator.clipboard.writeText(text); toast.success(`Copied ${items.length} items`); }
    catch { toast.error("Could not copy — use Download instead"); }
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([csv()], { type: "text/csv" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `permits-to-fix-in-sharepoint-${new Date().toISOString().slice(0, 10)}.csv` });
    a.click(); URL.revokeObjectURL(url);
  };
  return (
    <div className="border-t border-border/60 px-4 py-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">To fix in SharePoint ({items.length})</div>
          <div className="text-[11px] text-muted-foreground">Items the old sync overwrote with another permit. The sync leaves them alone; correct them in SharePoint by hand.</div>
        </div>
        <div className="flex gap-1.5">
          <Button size="sm" variant="outline" onClick={() => void copy()}>Copy list</Button>
          <Button size="sm" variant="outline" onClick={download}>Download CSV</Button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-[10.5px] uppercase tracking-wider text-muted-foreground">
            <tr><th className="py-1 pr-3 text-left">List · item</th><th className="py-1 pr-3 text-left">Holds now</th><th className="py-1 pr-3 text-left">Should be</th><th className="py-1 text-left">Why</th></tr>
          </thead>
          <tbody>
            {shown.map((i) => (
              <tr key={`${i.list}-${i.itemId}`} className="border-t border-border/30 align-top">
                <td className="whitespace-nowrap py-1 pr-3">{i.list} · {i.itemId}</td>
                <td className="py-1 pr-3 text-amber-200">{i.holdsNow}</td>
                <td className="py-1 pr-3">{i.shouldBe}</td>
                <td className="py-1 text-muted-foreground">{i.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {items.length > 25 && (
        <button className="mt-1 text-[11px] text-teal-300 hover:underline" onClick={() => setAll(!all)}>
          {all ? "Show fewer" : `Show all ${items.length}`}
        </button>
      )}
    </div>
  );
}

type RepairAction = {
  key: string;
  kind: "restore" | "delete" | "person";
  list: string;
  itemId: string;
  holds: string;
  home: string | null;
  polarisId?: string;
  restoreTo?: string;
  why: string;
};

const KIND_LABEL: Record<RepairAction["kind"], string> = {
  restore: "Write Polaris's permit back",
  delete: "Delete the copy",
  person: "Check by hand",
};

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * Put right the SharePoint items the old push overwrote with another list's permit:
 * preview first (nothing written), then apply exactly what was previewed. Deleted
 * items go to the SharePoint recycle bin (93 days).
 */
function RepairSharePoint() {
  const [busy, setBusy] = useState<"plan" | "apply" | null>(null);
  const [actions, setActions] = useState<RepairAction[] | null>(null);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; failed: Array<{ key: string; error: string }>; skipped: number } | null>(null);
  const [all, setAll] = useState(false);

  const plan = async () => {
    setBusy("plan"); setProgress(null);
    try {
      const res = await fetch("/api/sharepoint/permits-repair", { headers: await authHeaders() });
      const body = await res.json().catch(() => ({ ok: false, error: `Preview failed (${res.status})` }));
      if (!res.ok || !body.ok) throw new Error(body.error ?? `Preview failed (${res.status})`);
      setActions(body.actions); setCheckedAt(body.checkedAt);
    } catch (e: any) {
      toast.error(e?.message ?? "Preview failed");
    } finally { setBusy(null); }
  };

  const runnable = (actions ?? []).filter((a) => a.kind !== "person");
  const apply = async () => {
    const restores = runnable.filter((a) => a.kind === "restore").length;
    const deletes = runnable.length - restores;
    if (!window.confirm(`Change SharePoint now?\n\n• Write Polaris's permit back into ${restores} item(s)\n• Delete ${deletes} copied item(s) (they go to the SharePoint recycle bin for 93 days)\n\nOnly the items in this preview are touched.`)) return;
    setBusy("apply");
    let keys = runnable.map((a) => a.key);
    const total = { done: 0, failed: [] as Array<{ key: string; error: string }>, skipped: 0 };
    try {
      while (keys.length) {
        const res = await fetch("/api/sharepoint/permits-repair", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(await authHeaders()) },
          body: JSON.stringify({ keys }),
        });
        const body = await res.json().catch(() => ({ ok: false, error: `Repair failed (${res.status})` }));
        if (!res.ok || !body.ok) throw new Error(body.error ?? `Repair failed (${res.status})`);
        total.done += body.done.length; total.failed.push(...body.failed); total.skipped += body.skipped;
        setProgress({ ...total });
        if (!body.done.length && !body.failed.length) break;
        // What this call had no room for; keys that changed since the preview are dropped.
        keys = body.remaining;
      }
      toast.success(`SharePoint repaired: ${total.done} item(s)${total.failed.length ? `, ${total.failed.length} failed` : ""}`);
    } catch (e: any) {
      toast.error(e?.message ?? "Repair failed");
    } finally { setBusy(null); }
  };

  const counts = (actions ?? []).reduce<Record<string, number>>((m, a) => ({ ...m, [a.kind]: (m[a.kind] ?? 0) + 1 }), {});
  const shown = all ? actions ?? [] : (actions ?? []).slice(0, 40);

  return (
    <div className="border-t border-border/60 px-4 py-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-[260px] flex-1">
          <div className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">Repair in SharePoint</div>
          <div className="text-[11px] text-muted-foreground">
            Items the old sync overwrote with another list's permit. A copy is deleted (recycle bin, 93 days); an item Polaris still
            has the original of gets it written back — but only when the permit it holds also sits in its own list, so nothing that
            exists nowhere else is touched. Preview writes nothing.
          </div>
        </div>
        <div className="flex gap-1.5">
          <Button size="sm" variant="outline" className="gap-1.5" disabled={!!busy} onClick={() => void plan()}>
            {busy === "plan" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {busy === "plan" ? "Reading SharePoint…" : actions ? "Preview again" : "Preview repair"}
          </Button>
          {actions && runnable.length > 0 && (
            <Button size="sm" className="gap-1.5" disabled={!!busy} onClick={() => void apply()}>
              {busy === "apply" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {busy === "apply" ? `Repairing… ${progress?.done ?? 0}/${runnable.length}` : `Apply ${runnable.length} change${runnable.length === 1 ? "" : "s"}`}
            </Button>
          )}
        </div>
      </div>

      {actions && (
        <>
          <div className="mb-2 flex flex-wrap gap-3 text-[11px]">
            <span><b className="text-teal-300">{counts.restore ?? 0}</b> written back from Polaris</span>
            <span><b className="text-amber-300">{counts.delete ?? 0}</b> copies deleted</span>
            <span><b className="text-foreground">{counts.person ?? 0}</b> to check by hand</span>
            {checkedAt && <span className="text-muted-foreground">read {new Date(checkedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</span>}
          </div>
          {progress && (
            <div className="mb-2 text-[11px] text-muted-foreground">
              Done {progress.done}{progress.skipped ? ` · ${progress.skipped} skipped (changed since the preview)` : ""}
              {progress.failed.length > 0 && <span className="text-amber-300"> · {progress.failed.length} failed: {progress.failed.slice(0, 3).map((f) => f.error).join("; ")}</span>}
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-[10.5px] uppercase tracking-wider text-muted-foreground">
                <tr><th className="py-1 pr-3 text-left">Action</th><th className="py-1 pr-3 text-left">List · item</th><th className="py-1 pr-3 text-left">Holds now</th><th className="py-1 pr-3 text-left">Becomes</th><th className="py-1 text-left">Why</th></tr>
              </thead>
              <tbody>
                {shown.map((a) => (
                  <tr key={a.key} className="border-t border-border/30 align-top">
                    <td className={cn("whitespace-nowrap py-1 pr-3", a.kind === "delete" ? "text-amber-300" : a.kind === "restore" ? "text-teal-300" : "text-muted-foreground")}>{KIND_LABEL[a.kind]}</td>
                    <td className="whitespace-nowrap py-1 pr-3">{a.list} · {a.itemId}</td>
                    <td className="py-1 pr-3">{a.holds}</td>
                    <td className="py-1 pr-3">{a.kind === "delete" ? "— (deleted)" : a.restoreTo ?? "—"}</td>
                    <td className="py-1 text-muted-foreground">{a.why}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {actions.length > 40 && (
            <button className="mt-1 text-[11px] text-teal-300 hover:underline" onClick={() => setAll(!all)}>
              {all ? "Show fewer" : `Show all ${actions.length}`}
            </button>
          )}
        </>
      )}
    </div>
  );
}

type DmaCopyAction = {
  key: string;
  kind: "remove" | "person";
  polarisId: string | null;
  list: string | null;
  itemId: string | null;
  holds: string;
  real: string | null;
  why: string;
};

/**
 * DMA Foreign Visitor Permits the old push copied into every other list (and the
 * sync then pulled back in as Navigation Licenses, Tenders, Gate Passes…). Preview,
 * then remove: Polaris rows are backed up first, SharePoint items go to the recycle bin.
 */
function DmaCopies() {
  const [busy, setBusy] = useState<"plan" | "apply" | null>(null);
  const [actions, setActions] = useState<DmaCopyAction[] | null>(null);
  const [progress, setProgress] = useState<{ done: number; failed: Array<{ key: string; error: string }>; skipped: number; backups: string[] } | null>(null);
  const [all, setAll] = useState(false);
  const url = "/api/sharepoint/permits-repair?job=dma-copies";

  const plan = async () => {
    setBusy("plan"); setProgress(null);
    try {
      const res = await fetch(url, { headers: await authHeaders() });
      const body = await res.json().catch(() => ({ ok: false, error: `Preview failed (${res.status})` }));
      if (!res.ok || !body.ok) throw new Error(body.error ?? `Preview failed (${res.status})`);
      setActions(body.actions);
    } catch (e: any) {
      toast.error(e?.message ?? "Preview failed");
    } finally { setBusy(null); }
  };

  const removable = (actions ?? []).filter((a) => a.kind === "remove");
  const inPolaris = removable.filter((a) => a.polarisId).length;
  const inSharePoint = removable.filter((a) => a.itemId).length;
  const apply = async () => {
    if (!window.confirm(`Remove ${removable.length} copied DMA permit(s)?\n\n• ${inPolaris} from Polaris (each backed up first)\n• ${inSharePoint} from SharePoint (to the recycle bin for 93 days)\n\nThe real DMA permits are not touched.`)) return;
    setBusy("apply");
    let keys = removable.map((a) => a.key);
    const total = { done: 0, failed: [] as Array<{ key: string; error: string }>, skipped: 0, backups: [] as string[] };
    try {
      while (keys.length) {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(await authHeaders()) },
          body: JSON.stringify({ keys }),
        });
        const body = await res.json().catch(() => ({ ok: false, error: `Clean-up failed (${res.status})` }));
        if (!res.ok || !body.ok) throw new Error(body.error ?? `Clean-up failed (${res.status})`);
        total.done += body.done.length; total.failed.push(...body.failed); total.skipped += body.skipped;
        if (body.backup) total.backups.push(body.backup);
        setProgress({ ...total });
        if (!body.done.length && !body.failed.length) break;
        keys = body.remaining;
      }
      toast.success(`Removed ${total.done} copied permit(s)${total.failed.length ? `, ${total.failed.length} failed` : ""}`);
    } catch (e: any) {
      toast.error(e?.message ?? "Clean-up failed");
    } finally { setBusy(null); }
  };

  const shown = all ? actions ?? [] : (actions ?? []).slice(0, 40);
  return (
    <div className="border-t border-border/60 px-4 py-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-[260px] flex-1">
          <div className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">DMA permits copied into other lists</div>
          <div className="text-[11px] text-muted-foreground">
            The old sync added every DMA Foreign Visitor Permit ("PRMT…") to the other lists too, so it shows up again as a Navigation
            License, Tenders permit, Gate Pass… A copy is removed only when the real DMA permit is in Polaris and in the SharePoint DMA
            list. Polaris rows are backed up first. Preview writes nothing.
          </div>
        </div>
        <div className="flex gap-1.5">
          <Button size="sm" variant="outline" className="gap-1.5" disabled={!!busy} onClick={() => void plan()}>
            {busy === "plan" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {busy === "plan" ? "Reading SharePoint…" : actions ? "Preview again" : "Preview clean-up"}
          </Button>
          {actions && removable.length > 0 && (
            <Button size="sm" className="gap-1.5" disabled={!!busy} onClick={() => void apply()}>
              {busy === "apply" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {busy === "apply" ? `Removing… ${progress?.done ?? 0}/${removable.length}` : `Remove ${removable.length} copies`}
            </Button>
          )}
        </div>
      </div>
      {actions && (
        <>
          <div className="mb-2 flex flex-wrap gap-3 text-[11px]">
            <span><b className="text-amber-300">{inPolaris}</b> from Polaris</span>
            <span><b className="text-amber-300">{inSharePoint}</b> from SharePoint</span>
            <span><b className="text-foreground">{actions.length - removable.length}</b> to check by hand</span>
          </div>
          {progress && (
            <div className="mb-2 text-[11px] text-muted-foreground">
              Done {progress.done}{progress.skipped ? ` · ${progress.skipped} skipped (changed since the preview)` : ""}
              {progress.backups.length > 0 && ` · backup: ${progress.backups.join(", ")}`}
              {progress.failed.length > 0 && <span className="text-amber-300"> · {progress.failed.length} failed: {progress.failed.slice(0, 3).map((f) => f.error).join("; ")}</span>}
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-[10.5px] uppercase tracking-wider text-muted-foreground">
                <tr><th className="py-1 pr-3 text-left">Action</th><th className="py-1 pr-3 text-left">Copy</th><th className="py-1 pr-3 text-left">SharePoint</th><th className="py-1 pr-3 text-left">Real DMA permit</th><th className="py-1 text-left">Why</th></tr>
              </thead>
              <tbody>
                {shown.map((a) => (
                  <tr key={a.key} className="border-t border-border/30 align-top">
                    <td className={cn("whitespace-nowrap py-1 pr-3", a.kind === "remove" ? "text-amber-300" : "text-muted-foreground")}>{a.kind === "remove" ? "Remove copy" : "Check by hand"}</td>
                    <td className="py-1 pr-3">{a.holds}</td>
                    <td className="whitespace-nowrap py-1 pr-3">{a.list && a.itemId ? `${a.list} · ${a.itemId}` : "—"}</td>
                    <td className="py-1 pr-3">{a.real ?? "—"}</td>
                    <td className="py-1 text-muted-foreground">{a.why}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {actions.length > 40 && (
            <button className="mt-1 text-[11px] text-teal-300 hover:underline" onClick={() => setAll(!all)}>
              {all ? "Show fewer" : `Show all ${actions.length}`}
            </button>
          )}
        </>
      )}
    </div>
  );
}

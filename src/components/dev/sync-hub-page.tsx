/**
 * Sync Centre (Admin Settings → Sync) — every scheduled sync with an external
 * platform in one place: what it does, when it runs, when it last ran, and a
 * "Run now" button wired to the same functions the crons execute.
 */
import { useCallback, useEffect, useState } from "react";
import {
  Cloud, Database, FileSpreadsheet, Image as ImageIcon, Loader2, Play,
  Radar, RefreshCw, Ship, Upload,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { getSyncHubStatus, runSyncNow, type SyncHubStatus } from "@/lib/sync-hub.server";

function rel(ts: string | null): string {
  if (!ts) return "never";
  const mins = Math.round((Date.now() - new Date(ts).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const h = Math.round(mins / 60);
  if (h < 48) return `${h}h ago`;
  return new Date(ts).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function ScheduleChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-border bg-background/40 px-2 py-0.5 text-[10px] font-medium text-muted-foreground whitespace-nowrap">
      {children}
    </span>
  );
}

function RunButton({ onRun, label = "Run now" }: { onRun: () => Promise<string>; label?: string }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  return (
    <div className="flex flex-col items-end gap-1">
      <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" disabled={busy}
              onClick={async () => {
                setBusy(true); setResult(null);
                try { setResult(await onRun()); }
                catch (e: any) { setResult(`Failed: ${e?.message ?? e}`); toast.error(e?.message ?? "Sync failed"); }
                finally { setBusy(false); }
              }}>
        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />} {label}
      </Button>
      {result && <div className="max-w-[420px] truncate text-right text-[10px] text-muted-foreground" title={result}>{result}</div>}
    </div>
  );
}

function SyncRow({ icon: Icon, name, description, schedule, lastRun, extra, action }: {
  icon: React.ComponentType<{ className?: string }>;
  name: string; description: string; schedule: string;
  lastRun?: string | null; extra?: string | null;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-border/50 px-4 py-3 last:border-b-0">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-background/50">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="min-w-[220px] flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold">{name}</span>
          <ScheduleChip>{schedule}</ScheduleChip>
        </div>
        <div className="mt-0.5 text-[11px] text-muted-foreground">{description}</div>
        {extra && <div className="mt-0.5 max-w-xl truncate text-[10px] text-muted-foreground/60" title={extra}>{extra}</div>}
      </div>
      {lastRun !== undefined && (
        <div className="shrink-0 text-right text-xs">
          <div className="text-muted-foreground">last run</div>
          <div className={cn("font-medium", lastRun ? "text-foreground/85" : "text-muted-foreground/50")}>{rel(lastRun)}</div>
        </div>
      )}
      {action}
    </div>
  );
}

export function SyncHubPage() {
  const [status, setStatus] = useState<SyncHubStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [imgBusy, setImgBusy] = useState(false);
  const [imgStatus, setImgStatus] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setLoadError(null);
    try {
      const s = await (getSyncHubStatus as any)();
      if (!s || !Array.isArray(s.spLists)) throw new Error("Empty response from the status endpoint");
      setStatus(s);
    }
    catch (e: any) {
      setLoadError(e?.message ?? "Could not load sync status");
      toast.error(e?.message ?? "Could not load sync status");
    }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const run = useCallback(async (key: string, id?: string, offset?: number): Promise<string> => {
    const r = await (runSyncNow as any)({ data: { key, id, offset } });
    if (!r.ok) throw new Error(r.detail);
    void load();
    return r.detail;
  }, [load]);

  // Full image sync: batches with an offset that skips past failures.
  const syncAllImages = useCallback(async () => {
    setImgBusy(true); setImgStatus("Starting…");
    let downloaded = 0, failed = 0;
    try {
      for (let i = 0; i < 60; i++) {
        const r = await (runSyncNow as any)({ data: { key: "images", offset: failed } });
        if (!r.ok) throw new Error(r.detail);
        const d = JSON.parse(r.detail);
        downloaded += d.downloaded ?? 0;
        failed += Math.max(0, (d.processed ?? 0) - (d.downloaded ?? 0));
        setImgStatus(`Downloaded ${downloaded} · skipped ${failed}…`);
        if ((d.processed ?? 0) === 0) break;
      }
      setImgStatus(`Done — ${downloaded} downloaded${failed ? `, ${failed} without a usable SharePoint image` : ""}.`);
      toast.success(`Image sync complete — ${downloaded} downloaded`);
      void load();
    } catch (e: any) {
      setImgStatus(`Failed: ${e?.message ?? e}`);
      toast.error(e?.message ?? "Image sync failed");
    } finally { setImgBusy(false); }
  }, [load]);

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 px-6 py-4">
        <div>
          <div className="label-caps">Polaris / Admin Settings</div>
          <h1 className="font-display text-xl font-bold">Sync Centre</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Every scheduled sync with an external platform — SharePoint, QuickBooks, vessel tracking and the visa trackers.
          </p>
        </div>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => void load()}>
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </Button>
      </header>

      <div className="flex-1 space-y-5 overflow-auto px-6 py-5">
        {loading && !status ? (
          <div className="flex h-40 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : loadError && !status ? (
          <div className="flex h-40 flex-col items-center justify-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 text-sm">
            <span className="text-red-300">Could not load sync status: {loadError}</span>
            <Button size="sm" variant="outline" onClick={() => void load()}>Try again</Button>
          </div>
        ) : status && (
          <>
            {/* Platform syncs */}
            <section className="overflow-hidden rounded-xl border border-border bg-card">
              <div className="border-b border-border/60 bg-card/60 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Platform syncs
              </div>
              <SyncRow icon={Database} name="QuickBooks Online — documents"
                       description="Invoices, estimates and payments pulled into qbo_invoices/qbo_payments (drives Finance, yacht Finance tabs, Outstanding column)."
                       schedule="every 5 min" lastRun={status.qbo.lastRun} extra={status.qbo.detail}
                       action={<RunButton onRun={() => run("qbo")} />} />
              <SyncRow icon={Ship} name="MyShipTracking — live vessel positions"
                       description="AIS position, speed, heading and voyage for the fleet (Live Tracking map, Actual location, movement icons)."
                       schedule="hourly · extended every 6h" lastRun={status.mst.lastPosition}
                       extra={`${status.mst.tracked} vessels with a live position`}
                       action={<RunButton onRun={() => run("mst")} />} />
              <SyncRow icon={Radar} name="AIS stream collector"
                       description="Secondary AIS position collector writing to the same vessel positions."
                       schedule="4× per hour" lastRun={undefined}
                       action={<RunButton onRun={() => run("ais")} />} />
              <SyncRow icon={FileSpreadsheet} name="Visa ⇄ Excel trackers (two-way)"
                       description="Crew visa tracker workbooks on SharePoint reconciled with visa applications — newest edit wins, one vessel chunk per hour."
                       schedule="hourly chunk (~8h full cycle)" lastRun={status.visa.lastRun} extra={status.visa.detail}
                       action={<RunButton onRun={() => run("visa-2way")} label="Run chunk" />} />
            </section>

            {/* SharePoint */}
            <section className="overflow-hidden rounded-xl border border-border bg-card">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 bg-card/60 px-4 py-2.5">
                <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  SharePoint — {status.spLists.length} list syncs
                </span>
                <ScheduleChip>one list per 15 min, rotating · full re-pull daily 02:00 UTC</ScheduleChip>
              </div>
              {status.spLists.map((s) => (
                <SyncRow key={s.name} icon={Cloud} name={s.name}
                         description={`${s.listName ?? "—"} → ${s.syncTarget ?? "—"}${s.enabled ? "" : " · DISABLED"}`}
                         schedule={s.enabled ? "rotating" : "off"} lastRun={s.lastSyncedAt}
                         extra={s.lastSynced != null ? `last result: ${s.lastSynced} synced / ${s.lastErrors ?? 0} errors` : null}
                         action={s.id ? <RunButton onRun={() => run("sp-list", s.id!)} /> : undefined} />
              ))}
              <SyncRow icon={Upload} name="Push-back (app → SharePoint)"
                       description="In-app edits pushed out to the SharePoint lists."
                       schedule="hourly" lastRun={undefined}
                       action={<RunButton onRun={() => run("sp-pushback")} />} />
              <SyncRow icon={ImageIcon} name="Yacht images"
                       description="Vessel photos downloaded from the SharePoint Yachts list into storage. Unlinked yachts are matched by IMO or exact name."
                       schedule="each 15-min tick (batch of 10)" lastRun={undefined}
                       extra={`${status.imagesPending} yachts still without an image`}
                       action={
                         <div className="flex flex-col items-end gap-1">
                           <Button size="sm" className="h-7 gap-1.5 text-xs" disabled={imgBusy} onClick={() => void syncAllImages()}>
                             {imgBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <ImageIcon className="h-3 w-3" />} Sync all images
                           </Button>
                           {imgStatus && <div className="max-w-[420px] truncate text-right text-[10px] text-muted-foreground">{imgStatus}</div>}
                         </div>
                       } />
            </section>

            {/* ShipSync */}
            <section className="overflow-hidden rounded-xl border border-border bg-card">
              <div className="border-b border-border/60 bg-card/60 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                ShipSync ⇄ SharePoint
              </div>
              <SyncRow icon={Cloud} name="Import (SharePoint → app)"
                       description="Packages and drivers pulled in via the rotating list sync above; this runs a full import immediately."
                       schedule="via list rotation" lastRun={status.shipsync.lastRun} extra={status.shipsync.detail}
                       action={<RunButton onRun={() => run("shipsync-import")} label="Import now" />} />
              <SyncRow icon={Upload} name="Push (app → SharePoint)"
                       description="Manual only by design — SharePoint stays the source of truth for ShipSync."
                       schedule="manual" lastRun={undefined}
                       action={<RunButton onRun={() => run("shipsync-push")} label="Push now" />} />
            </section>
          </>
        )}
      </div>
    </div>
  );
}

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import {
  getIntegrationsStatus, getEnabledSyncs, syncOneList, syncImagesBatch, type IntegrationsStatus,
} from "@/lib/integrations.server";
import { useDevAccess } from "@/lib/dev-access";
import { Button } from "@/components/ui/button";
import {
  Plug, ShieldOff, CheckCircle2, XCircle, Loader2, Copy, AlertTriangle, Cloud, CloudDownload, RefreshCw, Image as ImageIcon,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { QboCustomersPanel } from "@/components/dev/qbo-customers-panel";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Map as MapIcon } from "lucide-react";

const REQUIRED_PERMS: { perm: string; purpose: string; have?: boolean }[] = [
  { perm: "Sites.Read.All / Files.Read.All", purpose: "Read SharePoint lists & download files (vessel images)", have: true },
  { perm: "Sites.ReadWrite.All", purpose: "Write Crew List items & Sign-On/Off events back to SharePoint" },
  { perm: "Files.ReadWrite.All", purpose: "Write the Visa Excel tracker & upload crew documents" },
  { perm: "Sites.Manage.All", purpose: "Auto-create the 'Crew Sign On Off' list" },
];

const copy = (v: string) => { navigator.clipboard.writeText(v); toast.success("Copied"); };
const fmt = (d: string | null) => d ? new Date(d).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "never";

export function IntegrationsPage() {
  const devAccess = useDevAccess();
  const { data, isLoading, error } = useQuery<IntegrationsStatus>({
    queryKey: ["integrations-status"],
    enabled: devAccess,
    queryFn: () => (getIntegrationsStatus as any)(),
  });

  if (!devAccess) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <ShieldOff className="h-10 w-10 text-muted-foreground/40" />
        <p className="font-display text-base font-semibold">Integrations is restricted</p>
        <p className="max-w-sm text-sm text-muted-foreground">You need the Dev role or admin access to view integrations.</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-border/70 bg-card/30 px-6 py-3.5">
        <div className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground/60">Polaris / Developer</div>
        <h1 className="mt-0.5 flex items-center gap-2 font-display text-[1.25rem] font-semibold tracking-tight">
          <Plug className="h-5 w-5 text-primary" /> Integrations
        </h1>
      </header>

      <div className="flex-1 overflow-auto px-6 py-5">
        <div className="mx-auto max-w-4xl space-y-6">
          {isLoading ? (
            <div className="flex h-40 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : error ? (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-300">
              Could not load integration status. {(error as Error)?.message}
            </div>
          ) : data ? (
            <>
              {/* SharePoint connection */}
              <section className="rounded-xl border border-border bg-card p-5 shadow-[0_2px_12px_-4px_rgba(0,0,0,0.4)]">
                <div className="mb-3 flex items-center gap-2">
                  <Cloud className="h-4 w-4 text-primary" />
                  <h2 className="font-display text-sm font-semibold">Microsoft SharePoint / Graph</h2>
                  <StatusPill ok={data.sharepoint.configured} okLabel="Connected" badLabel="Not configured" />
                </div>
                <dl className="grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
                  <Field label="Application (client) ID" value={data.sharepoint.clientId} mono onCopy={copy} />
                  <Field label="Directory (tenant) ID" value={data.sharepoint.tenantId} mono onCopy={copy} />
                  <Field label="Site" value={data.sharepoint.siteUrl} />
                  <Field label="Client secret" value={data.sharepoint.secretConfigured ? "Configured" : "Missing"} />
                </dl>

                <div className="mt-4 border-t border-border/60 pt-4">
                  <h3 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    <AlertTriangle className="h-3 w-3 text-amber-400" /> Required Graph application permissions
                  </h3>
                  <div className="space-y-1.5">
                    {REQUIRED_PERMS.map((p) => (
                      <div key={p.perm} className="flex items-start gap-2 text-[12.5px]">
                        {p.have
                          ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
                          : <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/40" />}
                        <div>
                          <code className="rounded bg-muted px-1.5 py-px font-mono text-[11px]">{p.perm}</code>
                          <span className="ml-2 text-muted-foreground">{p.purpose}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="mt-2 text-[11px] text-muted-foreground/70">
                    Grant in Azure → Entra ID → App registrations → this app → API permissions, then “Grant admin consent”.
                  </p>
                </div>
              </section>

              {/* Sync configs */}
              <section className="rounded-xl border border-border bg-card p-5 shadow-[0_2px_12px_-4px_rgba(0,0,0,0.4)]">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-display text-sm font-semibold">SharePoint Sync Lists <span className="text-muted-foreground">({data.syncs.length})</span></h2>
                  <SyncAllControls />
                </div>
                {data.syncs.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No sync lists configured.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-left text-[10.5px] uppercase tracking-wide text-muted-foreground">
                          <th className="py-2 pr-3 font-semibold">List → Target</th>
                          <th className="px-3 py-2 font-semibold">Enabled</th>
                          <th className="px-3 py-2 font-semibold">Last sync</th>
                          <th className="px-3 py-2 font-semibold">Synced / Errors</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.syncs.map((s) => (
                          <tr key={s.name} className="border-b border-border/40 align-top">
                            <td className="py-2.5 pr-3">
                              <div className="font-medium">{s.listName ?? s.name}</div>
                              <div className="font-mono text-[11px] text-muted-foreground">{s.syncTarget}</div>
                            </td>
                            <td className="px-3 py-2.5">
                              <StatusPill ok={s.enabled} okLabel="On" badLabel="Off" />
                            </td>
                            <td className="px-3 py-2.5 text-[12px] text-muted-foreground">{fmt(s.lastSyncedAt)}</td>
                            <td className="px-3 py-2.5">
                              <span className="text-emerald-400">{s.lastSynced ?? 0}</span>
                              <span className="text-muted-foreground"> / </span>
                              <span className={cn((s.lastErrors ?? 0) > 0 ? "text-red-400" : "text-muted-foreground")}>{s.lastErrors ?? 0}</span>
                              {!!s.errorSample?.length && (
                                <div className="mt-1 max-w-md text-[10.5px] text-red-400/80">{s.errorSample[0]}</div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              {/* Google Maps (directions & route planning) */}
              <GoogleMapsCard />

              {/* ShipSync → SharePoint (outbound push) */}
              <ShipSyncSyncStatus />

              {/* QuickBooks vessel ↔ customer links */}
              <QboCustomersPanel />
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ── Google Maps (directions & route planning) ────────────────────────────────
function GoogleMapsCard() {
  const [enabled, setEnabled] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    (supabase as any)
      .from("integration_settings")
      .select("enabled, config")
      .eq("integration_name", "google_maps")
      .maybeSingle()
      .then(({ data }: any) => {
        if (data) {
          setEnabled(!!data.enabled);
          setApiKey(data.config?.api_key ?? "");
          setConnected(!!data.enabled && !!data.config?.api_key);
        }
        setLoading(false);
      });
  }, []);

  async function save() {
    setSaving(true);
    const { error } = await (supabase as any)
      .from("integration_settings")
      .upsert({ integration_name: "google_maps", enabled, config: { api_key: apiKey.trim() } }, { onConflict: "integration_name" });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    setConnected(enabled && !!apiKey.trim());
    toast.success("Google Maps settings saved" + (enabled && apiKey.trim() ? " — maps are live on ShipSync routes & Crew Cab trips" : ""));
  }

  async function test() {
    setTesting(true);
    try {
      const key = apiKey.trim();
      if (!key) throw new Error("Enter the API key first");
      const res = await fetch(`https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly`, { method: "GET" });
      if (!res.ok) throw new Error(`Google responded ${res.status} — check the key`);
      const body = await res.text();
      if (/InvalidKey|ApiNotActivated|RefererNotAllowed/i.test(body)) throw new Error("Key rejected — check API restrictions in the Google Cloud console");
      toast.success("Key looks valid — save, then reload the app to activate maps");
    } catch (e: any) {
      toast.error(e?.message ?? "Test failed");
    } finally {
      setTesting(false);
    }
  }

  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-[0_2px_12px_-4px_rgba(0,0,0,0.4)]">
      <div className="mb-3 flex items-center gap-2">
        <MapIcon className="h-4 w-4 text-primary" />
        <h2 className="font-display text-sm font-semibold">Google Maps</h2>
        <StatusPill ok={connected} okLabel="Connected" badLabel="Not configured" />
        <button
          onClick={() => setEnabled(v => !v)}
          className={cn("ml-auto relative inline-flex h-5 w-9 items-center rounded-full transition-colors", enabled ? "bg-primary" : "bg-muted-foreground/30")}
          title={enabled ? "Enabled" : "Disabled"}
        >
          <span className={cn("inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform", enabled ? "translate-x-[18px]" : "translate-x-1")} />
        </button>
      </div>
      <p className="mb-3 text-[12px] text-muted-foreground">
        Powers directions & route planning on ShipSync delivery runs (optimized stop order, distances, ETA) and Crew Cab trips
        (address search, route preview, journey times for airport pickups).
      </p>
      {loading ? (
        <div className="flex h-10 items-center"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Google Maps API key (browser key)"
              className="h-9 max-w-md font-mono text-xs"
            />
            <Button size="sm" variant="outline" className="h-9" onClick={test} disabled={testing || !apiKey.trim()}>
              {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Test key"}
            </Button>
            <Button size="sm" className="h-9 min-w-[72px]" onClick={save} disabled={saving}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save"}
            </Button>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground/70">
            In the Google Cloud console enable <code className="rounded bg-muted px-1 font-mono text-[10px]">Maps JavaScript API</code>,{" "}
            <code className="rounded bg-muted px-1 font-mono text-[10px]">Places API</code> and{" "}
            <code className="rounded bg-muted px-1 font-mono text-[10px]">Directions API</code>, and restrict the key by HTTP referrer to this site.
          </p>
        </>
      )}
    </section>
  );
}

// ── ShipSync outbound sync status ───────────────────────────────────────────
function ShipSyncSyncStatus() {
  const [s, setS] = useState<{ total: number; pending: number; notes: number; lastPushAt: string | null; pushed: number; errors: number; detail: string | null } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    const { supabase } = await import("@/integrations/supabase/client");
    const db = supabase as any;
    const [{ count: total }, { count: pending }, { count: notes }, { data: state }] = await Promise.all([
      db.from("shipsync_packages").select("id", { count: "exact", head: true }),
      db.from("shipsync_packages").select("id", { count: "exact", head: true }).or("sp_synced_at.is.null,updated_at.gt.sp_synced_at"),
      db.from("shipsync_delivery_notes").select("id", { count: "exact", head: true }),
      db.from("shipsync_sync_state").select("*").eq("id", 1).maybeSingle(),
    ]);
    setS({
      total: total ?? 0, pending: pending ?? 0, notes: notes ?? 0,
      lastPushAt: state?.last_push_at ?? null, pushed: state?.pushed ?? 0, errors: state?.errors ?? 0, detail: state?.detail ?? null,
    });
  }
  useEffect(() => { void load(); }, []);

  async function run(dryRun: boolean) {
    setBusy(dryRun ? "dry" : "push");
    try {
      const { supabase } = await import("@/integrations/supabase/client");
      const { data: { session } } = await supabase.auth.getSession();
      const r = await fetch("/api/shipsync/sp-push", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
        body: JSON.stringify({ dryRun }),
      });
      const j = await r.json();
      if (j.ok) toast.success(`${dryRun ? "Dry run" : "Pushed"}: ${j.pushed} item(s), ${j.errors} error(s)`);
      else toast.error(j.error ?? "Push failed");
      await load();
    } catch (e: any) { toast.error(e?.message ?? "Failed"); } finally { setBusy(null); }
  }

  async function importFromSp() {
    if (!window.confirm("Import the legacy SharePoint Packages list into Polaris? This is a one-time backfill — run it once to populate ShipSync, after which Polaris is the source of truth.")) return;
    setBusy("import");
    try {
      const { supabase } = await import("@/integrations/supabase/client");
      const { data: { session } } = await supabase.auth.getSession();
      const r = await fetch("/api/shipsync/sp-import", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
        body: JSON.stringify({}),
      });
      const j = await r.json();
      if (j.ok) toast.success(`Imported ${j.imported} package(s) from SharePoint`);
      else toast.error(j.error ?? "Import failed");
      await load();
    } catch (e: any) { toast.error(e?.message ?? "Failed"); } finally { setBusy(null); }
  }

  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-[0_2px_12px_-4px_rgba(0,0,0,0.4)]">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-sm font-semibold">ShipSync → SharePoint <span className="text-muted-foreground">(outbound push)</span></h2>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={importFromSp} disabled={!!busy}>
            {busy === "import" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CloudDownload className="h-3.5 w-3.5" />} Import from SharePoint
          </Button>
          <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => run(true)} disabled={!!busy}>
            {busy === "dry" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Dry run
          </Button>
          <Button size="sm" className="h-8 gap-1.5" onClick={() => run(false)} disabled={!!busy}>
            {busy === "push" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Cloud className="h-3.5 w-3.5" />} Push now
          </Button>
        </div>
      </div>
      {!s ? (
        <div className="py-4 text-center"><Loader2 className="mx-auto h-4 w-4 animate-spin text-muted-foreground" /></div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "Packages", value: s.total },
              { label: "Pending push", value: s.pending, warn: s.pending > 0 },
              { label: "Delivery notes", value: s.notes },
              { label: "Last push errors", value: s.errors, warn: s.errors > 0 },
            ].map((c) => (
              <div key={c.label} className="rounded-lg border border-border/60 p-3">
                <div className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">{c.label}</div>
                <div className={cn("mt-1 font-display text-xl font-bold tabular-nums", c.warn ? "text-amber-400" : "")}>{c.value}</div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[12px] text-muted-foreground">
            Last push: <strong>{fmt(s.lastPushAt)}</strong> · pushed {s.pushed}. Supabase is the source of truth; the daily sync writes changed packages back to the SharePoint <code className="font-mono">Packages</code> list (same as the lists above). Use <strong>Dry run</strong> to preview the field mapping.
          </p>
          {s.detail && <p className="mt-1 text-[11px] text-muted-foreground/70">{s.detail}</p>}
        </>
      )}
    </section>
  );
}

function Field({ label, value, mono, onCopy }: { label: string; value: string | null; mono?: boolean; onCopy?: (v: string) => void }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground/70">{label}</dt>
      <dd className={cn("mt-0.5 flex items-center gap-1.5 text-sm", mono && "font-mono text-[12.5px]")}>
        <span className="truncate">{value ?? "—"}</span>
        {value && onCopy && (
          <button onClick={() => onCopy(value)} className="shrink-0 text-muted-foreground/50 hover:text-foreground" title="Copy">
            <Copy className="h-3 w-3" />
          </button>
        )}
      </dd>
    </div>
  );
}

function SyncAllControls() {
  const qc = useQueryClient();
  const [listBusy, setListBusy] = useState(false);
  const [imgBusy, setImgBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [failures, setFailures] = useState<Array<{ vessel: string; reason: string }>>([]);

  const refresh = () => qc.invalidateQueries({ queryKey: ["integrations-status"] });

  async function syncAllLists() {
    setListBusy(true); setStatus(null);
    try {
      const syncs = await (getEnabledSyncs as any)();
      let i = 0;
      for (const s of syncs) {
        setStatus(`Syncing list ${++i}/${syncs.length}: ${s.label}…`);
        try { await (syncOneList as any)({ data: { id: s.id } }); } catch { /* keep going */ }
      }
      setStatus(`Re-synced ${syncs.length} list${syncs.length === 1 ? "" : "s"}.`);
      toast.success("All list syncs complete");
      refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "List sync failed");
    } finally { setListBusy(false); }
  }

  async function syncAllImages() {
    setImgBusy(true); setStatus("Starting image sync…"); setFailures([]);
    const fails = new Map<string, string>();
    let total = 0;
    try {
      for (let i = 0; i < 60; i++) { // safety cap: 60×12 ≫ fleet size
        // Skip past rows that already failed this run, so a cluster of vessels
        // with no usable SharePoint image can't block the ones behind them.
        const r = await (syncImagesBatch as any)({ data: { offset: fails.size } });
        total += r.downloaded;
        for (const f of r.failures) fails.set(f.vessel, f.reason);
        setStatus(`Downloaded ${total} image${total === 1 ? "" : "s"} · ${r.remaining} remaining…`);
        if (r.remaining === 0) break;
        if ((r.processed ?? 0) === 0) break; // nothing left to attempt
      }
      setFailures([...fails].map(([vessel, reason]) => ({ vessel, reason })));
      setStatus(`Image sync complete — ${total} downloaded${fails.size ? `, ${fails.size} skipped` : ""}.`);
      toast.success(`Image sync complete — ${total} downloaded`);
      refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Image sync failed");
    } finally { setImgBusy(false); }
  }

  const busy = listBusy || imgBusy;
  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex gap-2">
        <Button size="sm" variant="outline" className="h-8 gap-1.5" disabled={busy} onClick={syncAllLists}>
          {listBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Re-sync all lists
        </Button>
        <Button size="sm" className="h-8 gap-1.5" disabled={busy} onClick={syncAllImages}>
          {imgBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImageIcon className="h-3.5 w-3.5" />} Sync all images
        </Button>
      </div>
      {status && <p className="text-[11px] text-muted-foreground">{status}</p>}
      {failures.length > 0 && (
        <details className="w-full max-w-md text-right">
          <summary className="cursor-pointer text-[11px] text-amber-400/90">{failures.length} vessel{failures.length === 1 ? "" : "s"} without an image — why?</summary>
          <div className="mt-1 max-h-48 overflow-auto rounded-lg border border-border bg-muted/30 p-2 text-left">
            {failures.map((f) => (
              <div key={f.vessel} className="text-[11px] leading-relaxed">
                <span className="font-medium">{f.vessel}</span>{" — "}
                <span className="text-muted-foreground">{f.reason}</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function StatusPill({ ok, okLabel, badLabel }: { ok: boolean; okLabel: string; badLabel: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-semibold",
      ok ? "bg-emerald-500/15 text-emerald-400" : "bg-muted text-muted-foreground")}>
      {ok ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}{ok ? okLabel : badLabel}
    </span>
  );
}

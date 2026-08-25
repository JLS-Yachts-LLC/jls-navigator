/**
 * Backups — Mini Backup platform for EC2 instances (Yacht IT Solutions).
 *
 * Per instance: a scheduled AMI image (NoReboot) with retention pruning, then
 * an offsite copy of the image's snapshot blocks to Impossible Cloud, streamed
 * by the 15-minute cron. Credentials are entered here (stored in
 * integration_settings) — the platform is inert until both are saved.
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DatabaseBackup, Loader2, Plus, Play, RefreshCw, Cloud, KeyRound, CheckCircle2,
  AlertTriangle, Trash2, HardDrive,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Inst = {
  id: string; name: string; instance_id: string; region: string;
  schedule: "daily" | "weekly" | "manual"; hour_utc: number; retention: number;
  offsite: boolean; active: boolean;
};
type Run = {
  id: string; instance_pk: string; status: "imaging" | "offsite" | "complete" | "error";
  ami_id: string | null; snapshots: Array<{ snapshotId: string; volumeSizeGiB: number }>;
  offsite_bytes: number; error: string | null; started_at: string; finished_at: string | null;
};

const fmtGB = (b: number) => (b >= 1e9 ? `${(b / 1e9).toFixed(2)} GB` : `${(b / 1e6).toFixed(0)} MB`);
const fmtWhen = (d: string) => new Date(d).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

const STATUS_META: Record<Run["status"], { label: string; cls: string }> = {
  imaging: { label: "Creating AMI", cls: "bg-blue-500/15 text-blue-400" },
  offsite: { label: "Copying offsite", cls: "bg-yellow-500/15 text-yellow-400" },
  complete: { label: "Complete", cls: "bg-emerald-500/15 text-emerald-400" },
  error: { label: "Failed", cls: "bg-red-500/15 text-red-400" },
};

async function post(action: string, extra: Record<string, unknown> = {}): Promise<any> {
  const res = await fetch("/api/backups", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...extra }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error ?? `Request failed (${res.status})`);
  return body;
}

// ── Credentials card (AWS + Impossible Cloud) ──────────────────────────────────

function CredsCard({ onSaved }: { onSaved: () => void }) {
  const [aws, setAws] = useState({ enabled: false, access_key_id: "", secret_access_key: "", region: "ap-southeast-1" });
  const [ic, setIc] = useState({ enabled: false, access_key_id: "", secret_access_key: "", endpoint: "", region: "eu-central-2", bucket: "" });
  const [awsSet, setAwsSet] = useState(false);
  const [icSet, setIcSet] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    const db = supabase as any;
    const { data } = await db.from("integration_settings").select("integration_name, enabled, config")
      .in("integration_name", ["aws_backup", "impossible_cloud"]);
    for (const row of (data ?? []) as any[]) {
      const c = row.config ?? {};
      if (row.integration_name === "aws_backup") {
        setAwsSet(!!c.access_key_id);
        setAws((p) => ({ ...p, enabled: !!row.enabled, region: c.region ?? p.region }));
      } else {
        setIcSet(!!c.access_key_id);
        setIc((p) => ({ ...p, enabled: !!row.enabled, endpoint: c.endpoint ?? "", region: c.region ?? p.region, bucket: c.bucket ?? "" }));
      }
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function save() {
    setSaving(true);
    try {
      const db = supabase as any;
      // Merge: never blank a stored secret because the (masked) field was left empty.
      const upsert = async (name: string, enabled: boolean, patch: Record<string, string>) => {
        const { data: row } = await db.from("integration_settings").select("config").eq("integration_name", name).maybeSingle();
        const config = { ...(row?.config ?? {}) };
        for (const [k, v] of Object.entries(patch)) if (v !== "") config[k] = v;
        const { error } = await db.from("integration_settings")
          .upsert({ integration_name: name, enabled, config, updated_at: new Date().toISOString() }, { onConflict: "integration_name" });
        if (error) throw error;
      };
      await upsert("aws_backup", aws.enabled, {
        access_key_id: aws.access_key_id.trim(), secret_access_key: aws.secret_access_key.trim(), region: aws.region.trim(),
      });
      await upsert("impossible_cloud", ic.enabled, {
        access_key_id: ic.access_key_id.trim(), secret_access_key: ic.secret_access_key.trim(),
        endpoint: ic.endpoint.trim(), region: ic.region.trim(), bucket: ic.bucket.trim(),
      });
      toast.success("Backup credentials saved");
      setAws((p) => ({ ...p, access_key_id: "", secret_access_key: "" }));
      setIc((p) => ({ ...p, access_key_id: "", secret_access_key: "" }));
      await load();
      onSaved();
    } catch (e: any) { toast.error(e?.message ?? "Could not save"); }
    finally { setSaving(false); }
  }

  async function testOffsite() {
    setTesting(true);
    try {
      const r = await post("test-offsite");
      toast.success(`Impossible Cloud reachable — bucket "${r.bucket}"`);
    } catch (e: any) { toast.error(e?.message ?? "Offsite test failed"); }
    finally { setTesting(false); }
  }

  const inputCls = "h-8 text-xs";
  const ok = (set: boolean, enabled: boolean) => set && enabled;

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <button className="flex w-full items-center gap-2 text-left" onClick={() => setOpen((v) => !v)}>
        <KeyRound className="h-4 w-4 text-primary" />
        <h3 className="font-display text-sm font-semibold">Credentials</h3>
        <span className={cn("ml-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold",
          ok(awsSet, aws.enabled) ? "bg-emerald-500/15 text-emerald-400" : "bg-amber-500/15 text-amber-400")}>
          {ok(awsSet, aws.enabled) ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />} AWS
        </span>
        <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold",
          ok(icSet, ic.enabled) ? "bg-emerald-500/15 text-emerald-400" : "bg-amber-500/15 text-amber-400")}>
          {ok(icSet, ic.enabled) ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />} Impossible Cloud
        </span>
        <span className="ml-auto text-xs text-muted-foreground">{open ? "Hide" : "Configure"}</span>
      </button>

      {open && (
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold text-muted-foreground">AWS (EC2 + EBS)</h4>
              <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <input type="checkbox" checked={aws.enabled} onChange={(e) => setAws((p) => ({ ...p, enabled: e.target.checked }))} /> Enabled
              </label>
            </div>
            <Input className={inputCls} placeholder={awsSet ? "Access key ID (saved — leave blank to keep)" : "Access key ID"}
              value={aws.access_key_id} onChange={(e) => setAws((p) => ({ ...p, access_key_id: e.target.value }))} />
            <Input className={inputCls} type="password" placeholder={awsSet ? "Secret access key (saved — leave blank to keep)" : "Secret access key"}
              value={aws.secret_access_key} onChange={(e) => setAws((p) => ({ ...p, secret_access_key: e.target.value }))} />
            <Input className={inputCls} placeholder="Region" value={aws.region}
              onChange={(e) => setAws((p) => ({ ...p, region: e.target.value }))} />
            <p className="text-[10.5px] text-muted-foreground">
              IAM policy needs: ec2 CreateImage/DescribeImages/DescribeInstances/CreateTags/DeregisterImage/DeleteSnapshot
              and ebs ListSnapshotBlocks/ListChangedBlocks/GetSnapshotBlock.
            </p>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold text-muted-foreground">Impossible Cloud (S3-compatible)</h4>
              <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <input type="checkbox" checked={ic.enabled} onChange={(e) => setIc((p) => ({ ...p, enabled: e.target.checked }))} /> Enabled
              </label>
            </div>
            <Input className={inputCls} placeholder={icSet ? "Access key ID (saved — leave blank to keep)" : "Access key ID"}
              value={ic.access_key_id} onChange={(e) => setIc((p) => ({ ...p, access_key_id: e.target.value }))} />
            <Input className={inputCls} type="password" placeholder={icSet ? "Secret key (saved — leave blank to keep)" : "Secret key"}
              value={ic.secret_access_key} onChange={(e) => setIc((p) => ({ ...p, secret_access_key: e.target.value }))} />
            <Input className={inputCls} placeholder="Endpoint, e.g. https://eu-central-2.storage.impossibleapi.net"
              value={ic.endpoint} onChange={(e) => setIc((p) => ({ ...p, endpoint: e.target.value }))} />
            <div className="grid grid-cols-2 gap-2">
              <Input className={inputCls} placeholder="Region" value={ic.region} onChange={(e) => setIc((p) => ({ ...p, region: e.target.value }))} />
              <Input className={inputCls} placeholder="Bucket" value={ic.bucket} onChange={(e) => setIc((p) => ({ ...p, bucket: e.target.value }))} />
            </div>
          </div>
          <div className="flex items-center gap-2 md:col-span-2">
            <Button size="sm" disabled={saving} onClick={() => void save()}>
              {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />} Save credentials
            </Button>
            <Button size="sm" variant="outline" disabled={testing} onClick={() => void testOffsite()}>
              {testing ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Cloud className="mr-1.5 h-3.5 w-3.5" />}
              Test Impossible Cloud
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export function BackupsPage() {
  const [instances, setInstances] = useState<Inst[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [discovered, setDiscovered] = useState<Array<{ instanceId: string; name: string; state: string; type: string }> | null>(null);

  const load = useCallback(async () => {
    const db = supabase as any;
    const [{ data: i }, { data: r }] = await Promise.all([
      db.from("it_backup_instances").select("*").order("name"),
      db.from("it_backup_runs").select("*").order("started_at", { ascending: false }).limit(60),
    ]);
    setInstances((i ?? []) as Inst[]);
    setRuns((r ?? []) as Run[]);
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  // Live progress while anything is imaging/copying
  useEffect(() => {
    if (!runs.some((r) => r.status === "imaging" || r.status === "offsite")) return;
    const t = setInterval(() => void load(), 20000);
    return () => clearInterval(t);
  }, [runs, load]);

  async function discover() {
    setBusy("discover");
    try {
      const r = await post("discover");
      setDiscovered(r.instances);
      if (!r.instances.length) toast.info(`No EC2 instances found in ${r.region}`);
    } catch (e: any) { toast.error(e?.message ?? "Discovery failed"); }
    finally { setBusy(null); }
  }

  async function addInstance(d: { instanceId: string; name: string }) {
    const { error } = await (supabase as any).from("it_backup_instances").insert([{
      name: d.name || d.instanceId, instance_id: d.instanceId,
    }]);
    if (error) { toast.error(error.message); return; }
    toast.success(`${d.name || d.instanceId} is now protected`);
    setDiscovered(null);
    await load();
  }

  async function patchInstance(id: string, patch: Partial<Inst>) {
    const { error } = await (supabase as any).from("it_backup_instances").update(patch).eq("id", id);
    if (error) toast.error(error.message); else await load();
  }

  async function removeInstance(inst: Inst) {
    if (!window.confirm(`Stop protecting ${inst.name}? Existing AMIs and offsite copies are NOT deleted.`)) return;
    const { error } = await (supabase as any).from("it_backup_instances").delete().eq("id", inst.id);
    if (error) toast.error(error.message); else { toast.success("Removed"); await load(); }
  }

  async function runNow(inst: Inst) {
    setBusy(inst.id);
    try {
      await post("run-now", { instancePk: inst.id });
      toast.success(`Backup of ${inst.name} started — creating the AMI now`);
      await load();
    } catch (e: any) { toast.error(e?.message ?? "Could not start the backup"); }
    finally { setBusy(null); }
  }

  const selectCls = "h-7 rounded-md border border-input bg-background px-1.5 text-[11px]";

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <DatabaseBackup className="h-4 w-4 text-primary" />
        <h2 className="font-display text-sm font-semibold">Backups</h2>
        <span className="text-[11px] text-muted-foreground">
          Scheduled AMI images of EC2 instances, with an offsite block-level copy to Impossible Cloud.
        </span>
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" variant="outline" className="h-8 gap-1.5" disabled={busy === "discover"} onClick={() => void discover()}>
            {busy === "discover" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Add instance
          </Button>
          <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => void load()}>
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
        </div>
      </div>

      <CredsCard onSaved={() => void load()} />

      {/* Discovery picker */}
      {discovered && (
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="mb-2 text-sm font-semibold">EC2 instances</h3>
          {discovered.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nothing found in this region.</p>
          ) : (
            <div className="space-y-1.5">
              {discovered.map((d) => {
                const already = instances.some((i) => i.instance_id === d.instanceId);
                return (
                  <div key={d.instanceId} className="flex items-center gap-3 rounded-lg border border-border/60 px-3 py-2 text-xs">
                    <HardDrive className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="font-medium">{d.name}</span>
                    <span className="font-mono text-muted-foreground">{d.instanceId}</span>
                    <span className="text-muted-foreground">{d.type} · {d.state}</span>
                    <Button size="sm" variant="outline" className="ml-auto h-6 px-2 text-[11px]" disabled={already}
                      onClick={() => void addInstance(d)}>
                      {already ? "Protected" : "Protect"}
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Protected instances */}
      {loading ? (
        <div className="flex items-center gap-2 py-8 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
      ) : instances.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No instances protected yet — save the AWS credentials, then “Add instance”.
        </div>
      ) : (
        <div className="space-y-2">
          {instances.map((inst) => {
            const lastRuns = runs.filter((r) => r.instance_pk === inst.id);
            const active = lastRuns.find((r) => r.status === "imaging" || r.status === "offsite");
            const last = lastRuns[0];
            return (
              <div key={inst.id} className="rounded-xl border border-border bg-card p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <HardDrive className="h-4 w-4 text-primary" />
                  <span className="text-sm font-semibold">{inst.name}</span>
                  <span className="font-mono text-[11px] text-muted-foreground">{inst.instance_id} · {inst.region}</span>
                  {last && (
                    <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold", STATUS_META[last.status].cls)}>
                      {STATUS_META[last.status].label}
                    </span>
                  )}
                  <div className="ml-auto flex items-center gap-2">
                    <select className={selectCls} value={inst.schedule}
                      onChange={(e) => void patchInstance(inst.id, { schedule: e.target.value as Inst["schedule"] })}>
                      <option value="daily">Daily</option><option value="weekly">Weekly (Mon)</option><option value="manual">Manual</option>
                    </select>
                    <select className={selectCls} value={inst.hour_utc}
                      onChange={(e) => void patchInstance(inst.id, { hour_utc: Number(e.target.value) })}>
                      {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:00 UTC</option>)}
                    </select>
                    <select className={selectCls} value={inst.retention}
                      onChange={(e) => void patchInstance(inst.id, { retention: Number(e.target.value) })}>
                      {[3, 5, 7, 14, 30].map((n) => <option key={n} value={n}>Keep {n}</option>)}
                    </select>
                    <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      <input type="checkbox" checked={inst.offsite} onChange={(e) => void patchInstance(inst.id, { offsite: e.target.checked })} />
                      Offsite
                    </label>
                    <Button size="sm" className="h-7 gap-1 px-2 text-[11px]" disabled={!!active || busy === inst.id}
                      onClick={() => void runNow(inst)}>
                      {busy === inst.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />} Run now
                    </Button>
                    <button className="text-muted-foreground/60 transition hover:text-red-400" title="Stop protecting"
                      onClick={() => void removeInstance(inst)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {lastRuns.length > 0 && (
                  <div className="mt-3 space-y-1">
                    {lastRuns.slice(0, 5).map((r) => (
                      <div key={r.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-muted/30 px-3 py-1.5 text-[11px]">
                        <span className={cn("inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-semibold", STATUS_META[r.status].cls)}>
                          {STATUS_META[r.status].label}
                        </span>
                        <span className="text-muted-foreground">{fmtWhen(r.started_at)}</span>
                        {r.ami_id && <span className="font-mono text-muted-foreground">{r.ami_id}</span>}
                        {r.snapshots?.length > 0 && (
                          <span className="text-muted-foreground">
                            {r.snapshots.length} vol · {r.snapshots.reduce((n, s) => n + s.volumeSizeGiB, 0)} GiB
                          </span>
                        )}
                        {r.status === "offsite" && (
                          <span className="flex items-center gap-1 text-yellow-400">
                            <Cloud className="h-3 w-3" /> {fmtGB(Number(r.offsite_bytes))} uploaded
                          </span>
                        )}
                        {r.status === "complete" && Number(r.offsite_bytes) > 0 && (
                          <span className="flex items-center gap-1 text-emerald-400">
                            <Cloud className="h-3 w-3" /> {fmtGB(Number(r.offsite_bytes))} offsite
                          </span>
                        )}
                        {r.error && <span className="text-red-400" title={r.error}>{r.error.slice(0, 80)}</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <p className="text-[10.5px] leading-relaxed text-muted-foreground">
        Offsite copies stream through the platform in bounded chunks (~150&nbsp;MB per 15-minute tick, ≈15&nbsp;GB/day),
        so the first copy of an instance takes a few days; after that only changed blocks upload, which takes minutes.
        Every offsite run includes a <span className="font-mono">restore.md</span> describing exactly how to rebuild the disk image.
      </p>
    </div>
  );
}

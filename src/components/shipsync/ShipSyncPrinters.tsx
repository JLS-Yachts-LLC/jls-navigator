/**
 * ShipSync → Printers: the warehouse's Zebra label printers and the connector that reaches them.
 *
 * Polaris can't reach a printer on the office network itself. A print connector (a small
 * PowerShell service on a member server, tools/print-connector) calls out to Polaris,
 * collects queued labels and sends them to each printer's IP. This screen is where the
 * printers are described (IP, label size, DPI, which connector) and where a connector is
 * added — its token is shown once, inside the install command.
 *
 * Everyone can see the printers and test them; adding or changing them needs ShipSync edit.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label as FieldLabel } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Copy, Loader2, Pencil, Plus, Printer, RefreshCw, Server, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAccess } from "@/lib/auth/useAccess";
import { errorMessage } from "@/lib/error-message";
import { cn } from "@/lib/utils";
import {
  isOnline, isReady, listPrinters, printerStateText, queueLabels, waitForJob, type LabelPrinter,
} from "@/lib/printing/printers";
import { rel } from "./shared";

const sb = supabase as any;

type Connector = { id: string; name: string; active: boolean; hostname: string | null; version: string | null; last_ip: string | null; last_seen_at: string | null };
type Job = { id: string; printer_id: string; status: string; error: string | null; ref: string | null; source: string | null; created_at: string; completed_at: string | null; labels: unknown[] };

type Form = { id?: string; name: string; location: string; host: string; port: string; dpi: string; width: string; height: string; connector_id: string; active: boolean };
const EMPTY: Form = { name: "", location: "", host: "", port: "9100", dpi: "203", width: "100", height: "50", connector_id: "", active: true };

const connectorOnline = (c: Connector) => !!c.last_seen_at && Date.now() - new Date(c.last_seen_at).getTime() < 2 * 60_000;

function installCommand(token: string, hosts: string[]): string {
  const allowed = hosts.length ? hosts.map((h) => `'${h}'`).join(",") : "'PRINTER-IP'";
  return [
    "[Net.ServicePointManager]::SecurityProtocol = 'Tls12'",
    `Invoke-WebRequest '${window.location.origin}/print-connector/install.ps1' -UseBasicParsing -OutFile \"$env:TEMP\\polaris-print-install.ps1\"`,
    `& \"$env:TEMP\\polaris-print-install.ps1\" -PolarisUrl '${window.location.origin}' -Token '${token}' -AllowedHosts ${allowed}`,
  ].join("\n");
}

export function ShipSyncPrinters() {
  const { canAccessModule, isGlobalAdmin } = useAccess();
  const canEdit = isGlobalAdmin || canAccessModule("shipsync", "edit");

  const [printers, setPrinters] = useState<LabelPrinter[]>([]);
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<Form | null>(null);
  const [saving, setSaving] = useState(false);
  const [delTarget, setDelTarget] = useState<LabelPrinter | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [newConnector, setNewConnector] = useState<string | null>(null);   // name being typed
  const [issued, setIssued] = useState<{ name: string; token: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const [p, c, j] = await Promise.all([
        listPrinters({ all: true }),
        sb.from("print_connectors").select("id, name, active, hostname, version, last_ip, last_seen_at").order("created_at"),
        sb.from("print_jobs").select("id, printer_id, status, error, ref, source, created_at, completed_at, labels").order("created_at", { ascending: false }).limit(25),
      ]);
      setPrinters(p);
      setConnectors((c.data ?? []) as Connector[]);
      setJobs((j.data ?? []) as Job[]);
    } catch (e) {
      toast.error(errorMessage(e, "Could not load the printers"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const t = window.setInterval(() => void load(), 30_000);
    return () => window.clearInterval(t);
  }, [load]);

  const printerName = useMemo(() => new Map(printers.map((p) => [p.id, p.name])), [printers]);
  const connectorName = useMemo(() => new Map(connectors.map((c) => [c.id, c.name])), [connectors]);
  const hosts = useMemo(() => [...new Set(printers.map((p) => p.host).filter((h): h is string => !!h))], [printers]);

  const openEdit = (p?: LabelPrinter) => setForm(p ? {
    id: p.id, name: p.name, location: p.location ?? "", host: p.host ?? "", port: String(p.port), dpi: String(p.dpi),
    width: String(p.label_width_mm), height: String(p.label_height_mm), connector_id: p.connector_id ?? "", active: p.active,
  } : { ...EMPTY, connector_id: connectors.length === 1 ? connectors[0].id : "" });

  const save = async () => {
    if (!form) return;
    if (!form.name.trim()) { toast.error("Give the printer a name"); return; }
    const host = form.host.trim();
    if (host && !/^[A-Za-z0-9.-]{1,253}$/.test(host)) { toast.error("The address should be an IP like 192.168.1.50 or a host name"); return; }
    const row = {
      name: form.name.trim(), location: form.location.trim() || null, host: host || null,
      port: Number(form.port), dpi: Number(form.dpi), label_width_mm: Number(form.width), label_height_mm: Number(form.height),
      connector_id: form.connector_id || null, active: form.active,
    };
    setSaving(true);
    try {
      const { error } = form.id ? await sb.from("label_printers").update(row).eq("id", form.id) : await sb.from("label_printers").insert(row);
      if (error) throw error;
      toast.success(form.id ? "Printer saved" : "Printer added");
      if (host && !hosts.includes(host)) toast.message("New printer address", { description: `Add ${host} to the connector's allowed printers on the server, or it will refuse to print there. See the install command under Connectors.`, duration: 15000 });
      setForm(null);
      await load();
    } catch (e) {
      toast.error(errorMessage(e, "Could not save the printer"));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!delTarget) return;
    const { error } = await sb.from("label_printers").delete().eq("id", delTarget.id);
    if (error) toast.error(errorMessage(error, "Could not remove the printer"));
    else { toast.success(`${delTarget.name} removed`); await load(); }
    setDelTarget(null);
  };

  const testPrint = async (p: LabelPrinter) => {
    setTesting(p.id);
    try {
      const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
      const id = await queueLabels(p.id, [{
        code: `TEST-${Date.now().toString(36).toUpperCase()}`,
        title: `${p.name} test label`,
        lines: [`${Number(p.label_width_mm)} × ${Number(p.label_height_mm)} mm · ${p.dpi} dpi`, stamp],
      }], { source: "test" });
      const r = await waitForJob(id);
      if (r.status === "printed") toast.success(`Test label printed on ${p.name}`);
      else if (r.status === "failed") toast.error(`${p.name}: ${r.error}`);
      else toast.warning(`Sent to ${p.name} — it hasn't confirmed yet. Is the connector running?`);
    } catch (e) {
      toast.error(errorMessage(e, "Could not send the test label"));
    } finally {
      setTesting(null);
      void load();
    }
  };

  const createConnector = async () => {
    const name = (newConnector ?? "").trim();
    if (!name) { toast.error("Name the connector after the server it runs on"); return; }
    const { data, error } = await sb.rpc("create_print_connector", { p_name: name });
    if (error) { toast.error(errorMessage(error, "Could not add the connector")); return; }
    const row = Array.isArray(data) ? data[0] : data;
    setNewConnector(null);
    setIssued({ name, token: row.token });
    await load();
  };

  const rotate = async (c: Connector) => {
    const { data, error } = await sb.rpc("rotate_print_connector_token", { p_id: c.id });
    if (error) { toast.error(errorMessage(error, "Could not issue a new token")); return; }
    setIssued({ name: c.name, token: data as string });
  };

  const toggleConnector = async (c: Connector) => {
    const { error } = await sb.from("print_connectors").update({ active: !c.active }).eq("id", c.id);
    if (error) toast.error(errorMessage(error, "Could not change the connector"));
    await load();
  };

  const copy = (text: string) => navigator.clipboard.writeText(text).then(() => toast.success("Copied"), () => toast.error("Couldn't copy — select it and copy by hand"));

  if (loading) return <div className="flex h-64 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-8 p-6">
      {/* Printers */}
      <section>
        <div className="mb-3 flex items-center gap-3">
          <div>
            <h2 className="font-semibold">Label printers</h2>
            <p className="text-sm text-muted-foreground">Zebra printers that warehouse labels can be sent to straight from the phones. Each one is reached through a print connector on the office network.</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => void load()} className="ml-auto h-9 gap-1.5"><RefreshCw className="h-4 w-4" /> Refresh</Button>
          {canEdit && <Button size="sm" onClick={() => openEdit()} className="h-9 gap-1.5"><Plus className="h-4 w-4" /> Add printer</Button>}
        </div>
        {printers.length === 0 ? (
          <div className="flex h-40 flex-col items-center justify-center rounded-xl border border-dashed border-border text-center text-sm text-muted-foreground">
            <Printer className="mb-2 h-6 w-6 opacity-50" /> No label printers yet.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {printers.map((p) => {
              const state = printerStateText(p);
              const tone = !p.active ? "muted" : isReady(p) ? "ok" : isOnline(p) ? "warn" : "bad";
              return (
                <div key={p.id} className={cn("rounded-xl border border-border bg-card p-4", !p.active && "opacity-70")}>
                  <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10"><Printer className="h-4 w-4 text-primary/80" /></div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-semibold">{p.name}</span>
                        <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium",
                          tone === "ok" && "bg-emerald-500/15 text-emerald-500",
                          tone === "warn" && "bg-amber-500/15 text-amber-500",
                          tone === "bad" && "bg-red-500/15 text-red-500",
                          tone === "muted" && "bg-muted/60 text-muted-foreground")}>
                          {p.active ? state : "Switched off"}
                        </span>
                      </div>
                      {p.location && <div className="text-xs text-muted-foreground">{p.location}</div>}
                      <div className="mt-1 text-xs text-muted-foreground">
                        {p.host ? `${p.host}:${p.port}` : "No address yet"} · {Number(p.label_width_mm)} × {Number(p.label_height_mm)} mm · {p.dpi} dpi
                      </div>
                      <div className="text-[11px] text-muted-foreground/70">
                        {p.connector_id ? `Via ${connectorName.get(p.connector_id) ?? "a connector"}` : "No connector chosen"}
                        {p.status_at && ` · checked ${rel(p.status_at)}`}
                        {p.status_detail && ` · ${p.status_detail}`}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-end gap-1 border-t border-border/40 pt-2">
                    <Button variant="outline" size="sm" className="mr-auto h-7 gap-1.5 text-xs" disabled={!p.active || !isOnline(p) || testing === p.id} onClick={() => void testPrint(p)}>
                      {testing === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Printer className="h-3.5 w-3.5" />} Test print
                    </Button>
                    {canEdit && <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground" onClick={() => openEdit(p)} aria-label="Edit"><Pencil className="h-3.5 w-3.5" /></Button>}
                    {canEdit && <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive/70 hover:text-destructive" onClick={() => setDelTarget(p)} aria-label="Remove"><Trash2 className="h-3.5 w-3.5" /></Button>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Connectors */}
      {canEdit && (
        <section>
          <div className="mb-3 flex items-center gap-3">
            <div>
              <h2 className="font-semibold">Print connectors</h2>
              <p className="text-sm text-muted-foreground">The service on an office server that collects labels from Polaris and sends them to the printers. It only calls out over HTTPS, and only prints to the printer addresses it was installed with.</p>
            </div>
            <Button size="sm" onClick={() => setNewConnector("")} className="ml-auto h-9 gap-1.5"><Plus className="h-4 w-4" /> Add connector</Button>
          </div>
          {connectors.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">No connector yet. Add one, then run its install command on the member server.</div>
          ) : (
            <div className="divide-y divide-border/50 rounded-xl border border-border bg-card">
              {connectors.map((c) => (
                <div key={c.id} className="flex flex-wrap items-center gap-3 p-3">
                  <Server className="h-4 w-4 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{c.name}</span>
                      <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium",
                        !c.active ? "bg-muted/60 text-muted-foreground" : connectorOnline(c) ? "bg-emerald-500/15 text-emerald-500" : "bg-red-500/15 text-red-500")}>
                        {!c.active ? "Switched off" : connectorOnline(c) ? "Online" : c.last_seen_at ? "Offline" : "Never connected"}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {c.hostname ?? "—"}{c.version && ` · v${c.version}`}{c.last_seen_at && ` · last seen ${rel(c.last_seen_at)}`}
                    </div>
                  </div>
                  <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => void rotate(c)}>New token</Button>
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => void toggleConnector(c)}>{c.active ? "Switch off" : "Switch on"}</Button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Recent jobs */}
      <section>
        <h2 className="mb-3 font-semibold">Recent print jobs</h2>
        {jobs.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing printed yet.</p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                <tr><th className="px-3 py-2">When</th><th className="px-3 py-2">Printer</th><th className="px-3 py-2">For</th><th className="px-3 py-2">Labels</th><th className="px-3 py-2">Result</th></tr>
              </thead>
              <tbody>
                {jobs.map((j) => (
                  <tr key={j.id} className="border-t border-border/50">
                    <td className="px-3 py-2 text-muted-foreground">{rel(j.created_at)}</td>
                    <td className="px-3 py-2">{printerName.get(j.printer_id) ?? "—"}</td>
                    <td className="px-3 py-2">{j.ref ?? (j.source === "test" ? "Test label" : "—")}</td>
                    <td className="px-3 py-2">{Array.isArray(j.labels) ? j.labels.length : "—"}</td>
                    <td className={cn("px-3 py-2", j.status === "failed" && "text-red-500", j.status === "printed" && "text-emerald-500")}>
                      {{ queued: "Waiting", sending: "Printing", printed: "Printed", failed: "Failed", cancelled: "Cancelled" }[j.status] ?? j.status}
                      {j.error && <span className="block text-xs text-muted-foreground">{j.error}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Add / edit printer */}
      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{form?.id ? "Edit printer" : "Add printer"}</DialogTitle>
            <DialogDescription>The address, DPI and label size are on the printer's configuration label (hold the feed button until it flashes once).</DialogDescription>
          </DialogHeader>
          {form && (
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1"><FieldLabel>Name</FieldLabel><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Receiving" /></div>
              <div className="col-span-2 space-y-1"><FieldLabel>Where it is</FieldLabel><Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Warehouse — receiving desk" /></div>
              <div className="space-y-1"><FieldLabel>IP address</FieldLabel><Input value={form.host} onChange={(e) => setForm({ ...form, host: e.target.value })} placeholder="192.168.1.50" /></div>
              <div className="space-y-1">
                <FieldLabel>Port</FieldLabel>
                <Select value={form.port} onValueChange={(v) => setForm({ ...form, port: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="9100">9100 (standard)</SelectItem><SelectItem value="6101">6101</SelectItem></SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><FieldLabel>Label width (mm)</FieldLabel><Input type="number" min={20} max={120} value={form.width} onChange={(e) => setForm({ ...form, width: e.target.value })} /></div>
              <div className="space-y-1"><FieldLabel>Label height (mm)</FieldLabel><Input type="number" min={10} max={300} value={form.height} onChange={(e) => setForm({ ...form, height: e.target.value })} /></div>
              <div className="space-y-1">
                <FieldLabel>Resolution</FieldLabel>
                <Select value={form.dpi} onValueChange={(v) => setForm({ ...form, dpi: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="203">203 dpi</SelectItem><SelectItem value="300">300 dpi</SelectItem><SelectItem value="600">600 dpi</SelectItem></SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <FieldLabel>Connector</FieldLabel>
                <Select value={form.connector_id || "none"} onValueChange={(v) => setForm({ ...form, connector_id: v === "none" ? "" : v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None yet</SelectItem>
                    {connectors.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <label className="col-span-2 flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> In use (offered on the phones)
              </label>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setForm(null)}>Cancel</Button>
            <Button onClick={() => void save()} disabled={saving}>{saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Name a new connector */}
      <Dialog open={newConnector !== null} onOpenChange={(o) => !o && setNewConnector(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add print connector</DialogTitle>
            <DialogDescription>Name it after the server it will run on. You'll get a one-time install command next.</DialogDescription>
          </DialogHeader>
          <Input autoFocus value={newConnector ?? ""} onChange={(e) => setNewConnector(e.target.value)} placeholder="JLS-APP01" onKeyDown={(e) => e.key === "Enter" && void createConnector()} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewConnector(null)}>Cancel</Button>
            <Button onClick={() => void createConnector()}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* The token, once */}
      <Dialog open={!!issued} onOpenChange={(o) => !o && setIssued(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Install {issued?.name}</DialogTitle>
            <DialogDescription>
              Run this in an <b>administrator</b> PowerShell on the member server. The token is shown only now — if it's lost, issue a new one.
              {hosts.length === 0 && " No printer has an address yet, so replace PRINTER-IP with the printers' IPs (comma-separated, each in quotes)."}
            </DialogDescription>
          </DialogHeader>
          {issued && (
            <div className="space-y-2">
              <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-muted/50 p-3 text-xs">{installCommand(issued.token, hosts)}</pre>
              <p className="text-xs text-muted-foreground">
                It installs to C:\Program Files\Polaris Print Connector and runs at start-up as the low-privilege Local Service account. It only prints to the addresses after -AllowedHosts; to add a printer later, run the command again with the new list (or edit AllowedHosts in C:\ProgramData\PolarisPrintConnector\config.json).
              </p>
            </div>
          )}
          <DialogFooter>
            {issued && <Button variant="outline" className="gap-1.5" onClick={() => void copy(installCommand(issued.token, hosts))}><Copy className="h-4 w-4" /> Copy command</Button>}
            <Button onClick={() => setIssued(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!delTarget} onOpenChange={(o) => !o && setDelTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {delTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>Phones will stop offering it, and its print history goes with it. To stop using it for a while, edit it and untick "In use" instead.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void remove()} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/**
 * Warehouse requests — the standard way for any department to ask the Warehouse for an incoming shipment, a picking or a
 * dispatch, with documents and photos attached. Everyone on staff can raise and read requests; the Warehouse / Logistics team
 * (ShipSync editors) move them along. The Warehouse and Logistics are emailed about every request.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Search, PackagePlus, PackageSearch, Truck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth";
import { useAccess } from "@/lib/auth/useAccess";
import { cn } from "@/lib/utils";
import { errorMessage } from "@/lib/error-message";
import {
  TYPE_LABEL, STATUS_LABEL, OPEN_STATUSES, emptyForm, linesSummary, type RequestType, type RequestFormInput,
} from "@/lib/warehouse/requests-model";
import { loadRequests, createWarehouseRequest, type WarehouseRequest, type PendingFile } from "@/lib/warehouse/requests";
import { RequestForm, checkForm } from "./request-form";
import { RequestDetailView, StatusBadge } from "./request-detail";

const TYPE_ICON: Record<RequestType, typeof PackagePlus> = { incoming: PackagePlus, picking: PackageSearch, dispatch: Truck };
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-GB", { timeZone: "Asia/Dubai", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");

export function WarehouseRequests({ openNumber }: { openNumber?: string }) {
  const { user } = useAuth();
  const { canAccessModule } = useAccess();
  const isWarehouse = canAccessModule("shipsync", "edit");

  const [rows, setRows] = useState<WarehouseRequest[] | null>(null);
  const [type, setType] = useState<RequestType | "all">("all");
  const [show, setShow] = useState<"open" | "all" | "mine">("open");
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState<RequestType | null>(null);
  const [form, setForm] = useState<RequestFormInput>(emptyForm("incoming"));
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [saving, setSaving] = useState(false);

  const [loadError, setLoadError] = useState<string | null>(null);
  const reload = useCallback(async () => { setRows(await loadRequests()); setLoadError(null); }, []);
  const firstLoad = useCallback(() => { setLoadError(null); void reload().catch((e) => { const m = errorMessage(e, "Could not load the requests"); toast.error(m); setLoadError(m); }); }, [reload]);
  useEffect(() => { firstLoad(); }, [firstLoad]);

  // A link from an email opens that request.
  useEffect(() => {
    if (!openNumber || !rows) return;
    const hit = rows.find((r) => r.number.toLowerCase() === openNumber.toLowerCase());
    if (hit) setOpenId(hit.id);
  }, [openNumber, rows]);

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (rows ?? []).filter((r) =>
      (type === "all" || r.type === type)
      && (show === "all" || (show === "open" ? OPEN_STATUSES.includes(r.status) : r.requester_id === user?.id))
      && (!t || [r.number, r.yacht, r.reference, r.destination, r.requester_name, r.department].some((v) => (v ?? "").toLowerCase().includes(t))));
  }, [rows, type, show, q, user?.id]);

  function start(t: RequestType) { setForm(emptyForm(t)); setFiles([]); setCreating(t); }

  async function submit() {
    if (!checkForm(form)) return;
    setSaving(true);
    try {
      const { request, emailed } = await createWarehouseRequest(form, files);
      toast.success(`${request.number} sent to the Warehouse`, { description: emailed ? "Logistics has been copied by email." : "Saved — the email to the Warehouse could not be sent, so please let them know." });
      setCreating(null);
      await reload();
      setOpenId(request.id);
    } catch (e) { toast.error(errorMessage(e, "Could not send the request")); }
    finally { setSaving(false); }
  }

  return (
    <div className="flex h-full min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {(["incoming", "picking", "dispatch"] as RequestType[]).map((t) => {
          const Icon = TYPE_ICON[t];
          return <Button key={t} className="gap-1.5" variant={t === "incoming" ? "default" : "outline"} onClick={() => start(t)}><Plus className="h-4 w-4" /><Icon className="h-4 w-4" /> New {TYPE_LABEL[t].toLowerCase()}</Button>;
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-lg border border-border bg-card/50 p-1">
          {([["open", "Open"], ["mine", "Mine"], ["all", "All"]] as const).map(([k, l]) => (
            <button key={k} type="button" onClick={() => setShow(k)} className={cn("rounded-md px-3 py-1.5 text-sm font-medium", show === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>{l}</button>
          ))}
        </div>
        <select className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={type} onChange={(e) => setType(e.target.value as RequestType | "all")} aria-label="Type">
          <option value="all">All types</option>{(["incoming", "picking", "dispatch"] as RequestType[]).map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
        </select>
        <div className="relative"><Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="h-9 w-64 pl-8" placeholder="Number, yacht, reference, requester…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        {rows && <span className="text-sm text-muted-foreground">{shown.length} of {rows.length}</span>}
      </div>

      {rows === null ? (loadError ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
          <span>{loadError}</span>
          <Button size="sm" variant="outline" onClick={firstLoad}>Try again</Button>
        </div>
      ) : <div className="flex h-32 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>) : shown.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">{rows.length === 0 ? "No requests yet. Use one of the buttons above to raise the first." : "Nothing matches these filters."}</p>
      ) : (
        <ul className="min-h-0 flex-1 space-y-2 overflow-auto">
          {shown.map((r) => {
            const Icon = TYPE_ICON[r.type];
            return (
              <li key={r.id}>
                <button type="button" onClick={() => setOpenId(r.id)} className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-border bg-card px-4 py-3 text-left hover:border-primary">
                  <Icon className="h-5 w-5 text-muted-foreground" />
                  <span className="font-mono text-sm font-semibold text-primary">{r.number}</span>
                  <StatusBadge status={r.status} />
                  {r.urgent && <span className="rounded-full border border-red-500/50 bg-red-500/10 px-2 py-0.5 text-xs font-bold text-red-400">URGENT</span>}
                  <span className="text-sm font-medium">{TYPE_LABEL[r.type]}</span>
                  <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{[r.type === "dispatch" ? r.destination : r.yacht, r.reference].filter(Boolean).join(" · ")}</span>
                  <span className="text-sm text-muted-foreground">{r.type === "incoming" ? `ETA ${when(r.eta)}` : `Needed ${when(r.required_at)}`}</span>
                  <span className="text-sm text-muted-foreground">{r.requester_name}{r.department ? ` · ${r.department}` : ""}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={!!creating} onOpenChange={(o) => { if (!o && !saving) setCreating(null); }}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader><DialogTitle>{creating ? `New ${TYPE_LABEL[creating].toLowerCase()}` : ""}</DialogTitle></DialogHeader>
          {creating && <>
            <RequestForm value={form} onChange={setForm} files={files} onFiles={setFiles} />
            <div className="flex justify-end gap-2 border-t border-border pt-3">
              <Button variant="ghost" disabled={saving} onClick={() => setCreating(null)}>Cancel</Button>
              <Button disabled={saving} onClick={() => void submit()}>{saving ? "Sending…" : "Send to the Warehouse"}</Button>
            </div>
          </>}
        </DialogContent>
      </Dialog>

      <Dialog open={!!openId} onOpenChange={(o) => { if (!o) setOpenId(null); }}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader><DialogTitle>{rows?.find((r) => r.id === openId)?.number ?? "Request"} · {rows?.find((r) => r.id === openId) ? `${TYPE_LABEL[rows!.find((r) => r.id === openId)!.type]} — ${STATUS_LABEL[rows!.find((r) => r.id === openId)!.status]}` : ""}</DialogTitle></DialogHeader>
          {openId && <RequestDetailView id={openId} isWarehouse={isWarehouse} myId={user?.id ?? null} onChanged={() => void reload()} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

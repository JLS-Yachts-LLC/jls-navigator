/**
 * One warehouse request: what was asked, its documents and photos, who has done what, and the actions that person may take —
 * the Warehouse team moves it along (confirm, start, hold, complete), the person who raised it can change it or withdraw it,
 * and anyone on staff can comment (that is how conflicting instructions get agreed).
 */
import { useCallback, useEffect, useState } from "react";
import { Loader2, FileText, Image as ImageIcon, Pencil, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { SignedAnchor } from "@/components/ui/signed-file";
import { cn } from "@/lib/utils";
import { errorMessage } from "@/lib/error-message";
import {
  TYPE_LABEL, STATUS_LABEL, NEEDS_REASON, allowedMoves, canAmend, type RequestFormInput, type RequestStatus,
} from "@/lib/warehouse/requests-model";
import {
  loadRequestDetail, setRequestStatus, amendRequest, addComment, addRequestFiles, toFormInput,
  type RequestDetail, type PendingFile,
} from "@/lib/warehouse/requests";
import { RequestForm, FilePicker, checkForm } from "./request-form";

export const STATUS_STYLE: Record<RequestStatus, string> = {
  submitted: "border-sky-500/40 bg-sky-500/10 text-sky-400",
  confirmed: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400",
  in_progress: "border-amber-500/40 bg-amber-500/10 text-amber-400",
  completed: "border-border bg-muted/40 text-muted-foreground",
  on_hold: "border-orange-500/50 bg-orange-500/10 text-orange-400",
  cancelled: "border-border bg-muted/40 text-muted-foreground line-through",
};
export function StatusBadge({ status }: { status: RequestStatus }) {
  return <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold", STATUS_STYLE[status])}>{STATUS_LABEL[status]}</span>;
}

const MOVE_LABEL: Record<RequestStatus, string> = {
  submitted: "Back to submitted", confirmed: "Confirm", in_progress: "Start work", completed: "Mark completed", on_hold: "Put on hold…", cancelled: "Cancel request…",
};

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-GB", { timeZone: "Asia/Dubai", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return <div className="flex gap-3 py-1 text-sm"><div className="w-44 shrink-0 text-muted-foreground">{k}</div><div className="min-w-0 flex-1 break-words">{v || "—"}</div></div>;
}

export function RequestDetailView({ id, isWarehouse, myId, onChanged }: { id: string; isWarehouse: boolean; myId: string | null; onChanged: () => void }) {
  const [d, setD] = useState<RequestDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [move, setMove] = useState<RequestStatus | null>(null);   // a move waiting for its reason
  const [reason, setReason] = useState("");
  const [amending, setAmending] = useState<RequestFormInput | null>(null);
  const [amendReason, setAmendReason] = useState("");
  const [comment, setComment] = useState("");
  const [newFiles, setNewFiles] = useState<PendingFile[]>([]);

  const load = useCallback(async () => { setD(await loadRequestDetail(id)); }, [id]);
  useEffect(() => { void load().catch((e) => toast.error(errorMessage(e, "Could not load the request"))); }, [load]);

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    try { await fn(); toast.success(ok); await load(); onChanged(); }
    catch (e) { toast.error(errorMessage(e, "That did not work")); }
    finally { setBusy(false); }
  }

  if (!d) return <div className="flex h-40 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  const r = d.request;
  const me = { isWarehouse, isRequester: !!myId && r.requester_id === myId };
  const moves = allowedMoves(r.status, me);

  function pickMove(s: RequestStatus) {
    if (NEEDS_REASON.includes(s)) { setMove(s); setReason(""); return; }
    void run(() => setRequestStatus(id, s), `Now ${STATUS_LABEL[s].toLowerCase()}`);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={r.status} />
        {r.urgent && <span className="rounded-full border border-red-500/50 bg-red-500/10 px-2 py-0.5 text-xs font-bold text-red-400">URGENT</span>}
        {r.amended_count > 0 && <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">Changed {r.amended_count}×</span>}
      </div>

      {r.urgent && <div className="rounded-lg border border-red-500/40 bg-red-500/5 px-3 py-2 text-sm"><strong>Why it's urgent:</strong> {r.urgent_reason} · <strong>Deadline:</strong> {when(r.deadline)}</div>}
      {r.status === "on_hold" && r.hold_reason && <div className="rounded-lg border border-orange-500/40 bg-orange-500/5 px-3 py-2 text-sm"><strong>On hold until this is clarified:</strong> {r.hold_reason}</div>}

      <div className="rounded-lg border border-border px-3 py-2">
        <Row k="Type" v={TYPE_LABEL[r.type]} />
        <Row k="Raised by" v={`${r.requester_name ?? "—"}${r.department ? ` (${r.department})` : ""}`} />
        <Row k="Raised" v={when(r.created_at)} />
        <Row k={r.type === "dispatch" ? "Destination yacht" : "Yacht / project"} v={r.type === "dispatch" ? r.destination : r.yacht} />
        <Row k={r.type === "incoming" ? "Delivery order / reference" : "AWB / shipment reference"} v={r.reference} />
        {r.type === "incoming" ? <Row k="Expected arrival" v={when(r.eta)} /> : <Row k={r.type === "dispatch" ? "Required delivery" : "Needed by"} v={when(r.required_at)} />}
        {r.type === "dispatch" && <>
          <Row k="Berth / location" v={r.berth} />
          <Row k="Recipient" v={[r.recipient_name, r.recipient_phone, r.recipient_email].filter(Boolean).join(" · ")} />
        </>}
        {r.notes && <Row k="Notes" v={<span className="whitespace-pre-wrap">{r.notes}</span>} />}
      </div>

      <div>
        <h4 className="mb-1.5 text-sm font-semibold">Items</h4>
        <ul className="divide-y divide-border/60 rounded-lg border border-border">
          {d.lines.map((l, i) => (
            <li key={l.id} className="flex items-start gap-3 px-3 py-2 text-sm">
              <span className="w-5 text-muted-foreground">{i + 1}</span>
              <span className="min-w-0 flex-1">{l.description}
                {l.oversized && <span className="ml-2 text-amber-500">{l.length_cm ?? "?"} × {l.width_cm ?? "?"} × {l.height_cm ?? "?"} cm · {l.weight_kg ?? "?"} kg</span>}
              </span>
              <span className="whitespace-nowrap">{l.quantity ?? ""} {l.unit ?? ""}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="space-y-2">
        <h4 className="text-sm font-semibold">Documents and photos</h4>
        {d.files.length === 0 ? <p className="text-sm text-muted-foreground">Nothing attached yet.</p> : (
          <ul className="space-y-1">
            {d.files.map((f) => (
              <li key={f.id} className="text-sm">
                <SignedAnchor stored={f.url} className="inline-flex items-center gap-1.5 text-primary hover:underline">
                  {f.kind === "photo" ? <ImageIcon className="h-4 w-4" /> : <FileText className="h-4 w-4" />} {f.name}
                </SignedAnchor>
                {f.doc_type && <span className="ml-2 text-xs text-muted-foreground">{f.doc_type}</span>}
              </li>
            ))}
          </ul>
        )}
        {(me.isRequester || me.isWarehouse) && r.status !== "completed" && r.status !== "cancelled" && (
          <div className="space-y-2 rounded-lg border border-dashed border-border p-3">
            <FilePicker files={newFiles} onChange={setNewFiles} />
            {newFiles.length > 0 && <Button size="sm" disabled={busy} onClick={() => void run(async () => { await addRequestFiles(id, newFiles); setNewFiles([]); }, "Added")}>Upload {newFiles.length} file{newFiles.length === 1 ? "" : "s"}</Button>}
          </div>
        )}
      </div>

      {(moves.length > 0 || canAmend(r.status, me)) && (
        <div className="space-y-2 rounded-lg border border-border p-3">
          <div className="flex flex-wrap gap-2">
            {moves.map((s) => <Button key={s} size="sm" variant={s === "cancelled" ? "outline" : s === "on_hold" ? "outline" : "default"} disabled={busy} onClick={() => pickMove(s)}>{MOVE_LABEL[s]}</Button>)}
            {canAmend(r.status, me) && <Button size="sm" variant="outline" className="gap-1.5" disabled={busy} onClick={() => { setAmending(toFormInput(d)); setAmendReason(""); }}><Pencil className="h-4 w-4" /> Change this request</Button>}
          </div>
          {move && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">{move === "on_hold" ? "What has to be clarified before this can go ahead?" : "Why is it being cancelled?"} (recorded on the request)</p>
              <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
              <div className="flex gap-2">
                <Button size="sm" disabled={busy || !reason.trim()} onClick={() => void run(async () => { await setRequestStatus(id, move, reason); setMove(null); }, `Now ${STATUS_LABEL[move].toLowerCase()}`)}>Confirm</Button>
                <Button size="sm" variant="ghost" onClick={() => setMove(null)}>Back</Button>
              </div>
            </div>
          )}
        </div>
      )}

      {amending && (
        <div className="space-y-3 rounded-lg border border-primary/40 bg-primary/5 p-3">
          <h4 className="text-sm font-semibold">Change this request</h4>
          <RequestForm value={amending} onChange={setAmending} files={[]} onFiles={() => {}} showFiles={false} />
          <div className="space-y-1"><label className="text-sm font-medium">What changed, and why? <span className="text-muted-foreground">(sent to the Warehouse and kept on the request)</span></label>
            <Textarea rows={2} value={amendReason} onChange={(e) => setAmendReason(e.target.value)} /></div>
          <div className="flex gap-2">
            <Button size="sm" disabled={busy || !amendReason.trim()} onClick={() => { if (checkForm(amending)) void run(async () => { await amendRequest(id, amending, amendReason); setAmending(null); }, "Request changed"); }}>Save the change</Button>
            <Button size="sm" variant="ghost" onClick={() => setAmending(null)}>Cancel</Button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        <h4 className="text-sm font-semibold">Activity</h4>
        <ul className="space-y-2">
          {d.events.map((e) => (
            <li key={e.id} className="rounded-lg border border-border/60 px-3 py-2 text-sm">
              <div className="flex flex-wrap items-baseline gap-2">
                <strong>{e.actor_name ?? "Someone"}</strong>
                <span className="text-muted-foreground">
                  {e.kind === "submitted" ? "raised this request" : e.kind === "status" ? `set it to ${STATUS_LABEL[(e.to_status ?? "submitted") as RequestStatus]?.toLowerCase()}` : e.kind === "amended" ? "changed the request" : e.kind === "file" ? "added files" : "commented"}
                </span>
                <span className="ml-auto text-xs text-muted-foreground">{when(e.created_at)}</span>
              </div>
              {e.body && <p className="mt-1 whitespace-pre-wrap">{e.body}</p>}
            </li>
          ))}
        </ul>
        <div className="flex gap-2">
          <Textarea rows={2} placeholder="Add a comment — it goes to the Warehouse, Logistics and the requester" value={comment} onChange={(e) => setComment(e.target.value)} />
          <Button className="self-end gap-1.5" disabled={busy || !comment.trim()} onClick={() => void run(async () => { await addComment(id, comment); setComment(""); }, "Comment added")}><Send className="h-4 w-4" /> Send</Button>
        </div>
      </div>
    </div>
  );
}

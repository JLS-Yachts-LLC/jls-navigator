/** Crew Academy course creator — choose which vessels a JLS course is offered to. */
import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { adminFetch, inputCls, post } from "./shared";

// ── Offer to vessels ─────────────────────────────────────────────────────────
export function OfferModal({ id, offerAll, offeredTo, published, onClose, onSaved }: {
  id: string; offerAll: boolean; offeredTo: string[]; published: boolean; onClose: () => void; onSaved: () => void;
}) {
  const [vessels, setVessels] = useState<{ id: string; vessel_name: string }[] | null>(null);
  const [all, setAll] = useState(offerAll);
  const [picked, setPicked] = useState<Set<string>>(new Set(offeredTo));
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { adminFetch("/api/academy-admin?op=vessels").then((r) => setVessels(r.vessels)).catch((e) => toast.error(e.message)); }, []);
  const shown = (vessels ?? []).filter((v) => v.vessel_name.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="flex max-h-[85vh] w-full max-w-md flex-col rounded-2xl border border-border bg-card p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Offer to vessels</h2>
          <button onClick={onClose} aria-label="Close"><X className="h-5 w-5 text-muted-foreground" /></button>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Vessels with Crew Academy switched on will see this course and can enrol their crew.
          {!published && " It appears to them once it's published."}
        </p>
        <label className="mt-4 flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> Every vessel
        </label>
        {!all && (
          <>
            <input className={cn(inputCls, "mt-3")} placeholder="Search vessels" value={q} onChange={(e) => setQ(e.target.value)} />
            <div className="mt-2 min-h-0 flex-1 overflow-y-auto rounded-lg border border-border">
              {!vessels ? <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div> : shown.map((v) => (
                <label key={v.id} className="flex cursor-pointer items-center gap-2 border-b border-border/40 px-3 py-1.5 text-sm last:border-0 hover:bg-background/40">
                  <input type="checkbox" checked={picked.has(v.id)} onChange={(e) => {
                    const next = new Set(picked); e.target.checked ? next.add(v.id) : next.delete(v.id); setPicked(next);
                  }} /> {v.vessel_name}
                </label>
              ))}
            </div>
            <div className="mt-1.5 text-xs text-muted-foreground">{picked.size} chosen</div>
          </>
        )}
        <button disabled={busy} onClick={async () => {
          setBusy(true);
          try { await post({ op: "offer", id, offerAll: all, yachtIds: all ? [] : [...picked] }); toast.success("Saved"); onSaved(); }
          catch (e: any) { toast.error(e.message); setBusy(false); }
        }} className="mt-4 inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-50">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Save
        </button>
      </div>
    </div>
  );
}

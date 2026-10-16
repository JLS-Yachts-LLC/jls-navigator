/**
 * Desktop: add more parcels to a delivery note that already exists — the office adding a fifth parcel to a run that has four.
 * Lists what is waiting to go out (in the office or storage, on no note), searchable by AWB, boat or consignee, and puts the
 * ticked ones on the note. Where they go (the driver's run, or just reserved on a draft) is decided by addParcelsToNote.
 */
import { useMemo, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { addParcelsToNote } from "@/lib/shipsync/data";
import { isRoutable } from "@/lib/shipsync/trade-summary";
import { fmtDate } from "@/components/shipsync/shared";
import type { ShipSyncDeliveryNote, ShipSyncPackage } from "@/lib/shipsync/model";

export function AddParcelsDialog({ note, parcels, open, onClose, onDone }: {
  note: ShipSyncDeliveryNote;
  /** Every parcel the page knows about (Local, Import, Transit); the waiting ones are picked out here. */
  parcels: ShipSyncPackage[];
  open: boolean;
  onClose: () => void;
  onDone: () => Promise<void> | void;
}) {
  const [q, setQ] = useState("");
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const waiting = useMemo(() => parcels.filter(isRoutable), [parcels]);
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    const list = !s ? waiting : waiting.filter((p) => [p.barcode, p.boat_name, p.package_owner, p.courier].join(" ").toLowerCase().includes(s));
    // The note's own boat first: that is usually what is being added.
    const mine = (note.boat_name ?? "").trim().toLowerCase();
    return [...list].sort((a, b) => {
      const am = mine && (a.boat_name ?? "").trim().toLowerCase() === mine ? 0 : 1;
      const bm = mine && (b.boat_name ?? "").trim().toLowerCase() === mine ? 0 : 1;
      return am - bm || (a.boat_name ?? "").localeCompare(b.boat_name ?? "") || (a.received_at ?? "").localeCompare(b.received_at ?? "");
    });
  }, [waiting, q, note.boat_name]);

  const toggle = (id: string) => setTicked((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  async function add() {
    if (ticked.size === 0) return;
    setBusy(true);
    try {
      const r = await addParcelsToNote(note, [...ticked]);
      await onDone();
      if (r.addedIds.length) toast.success(`${r.addedIds.length} parcel${r.addedIds.length === 1 ? "" : "s"} added to DN-${note.number}`);
      if (r.skipped) toast.warning(`${r.skipped} parcel${r.skipped === 1 ? " was" : "s were"} taken by someone else just now and not added.`);
      setTicked(new Set()); setQ("");
      onClose();
    } catch (e: any) { toast.error(e?.message ?? "Could not add the parcels"); } finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="flex max-h-[85vh] max-w-xl flex-col">
        <DialogHeader>
          <DialogTitle>Add parcels to DN-{note.number}</DialogTitle>
          <DialogDescription>
            Parcels in the office or storage that are on no delivery.{" "}
            {note.driver_id ? "They join this run and appear on the driver's phone." : "This note has no driver yet, so they are only reserved on it."}
          </DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/50" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search AWB, boat, consignee…" className="h-9 pl-8 text-sm" autoFocus />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-border">
          {shown.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">{waiting.length === 0 ? "Nothing is waiting to go out." : "Nothing matches that search."}</p>
          ) : (
            <ul className="divide-y divide-border/60">
              {shown.map((p) => (
                <li key={p.id}>
                  <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5 text-sm hover:bg-white/5">
                    <Checkbox checked={ticked.has(p.id)} onCheckedChange={() => toggle(p.id)} aria-label={`Add ${p.barcode ?? "parcel"}`} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-mono text-[13px]">{p.barcode ?? "—"}</span>
                      <span className="block truncate text-[12.5px] text-muted-foreground">
                        {[p.boat_name, p.package_owner, p.courier].filter(Boolean).join(" · ") || "—"} · Qty {p.num_packages ?? 1} · {fmtDate(p.received_at)}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>
        <DialogFooter className="items-center gap-2 sm:justify-between">
          <span className="text-[13px] text-muted-foreground">{ticked.size ? `${ticked.size} selected` : `${shown.length} waiting`}</span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button onClick={() => void add()} disabled={busy || ticked.size === 0} className="gap-1.5">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Add{ticked.size ? ` ${ticked.size}` : ""} to this note
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

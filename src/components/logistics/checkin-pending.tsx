/**
 * Logistics mobile app — the "check-ins waiting to upload" side of offline
 * check-in: a hook that keeps the list and uploads it when the phone comes back
 * online, and the banner (with a review sheet) that shows it.
 */
import { useCallback, useEffect, useState } from "react";
import { CloudOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Sheet } from "./logistics-ui";
import { errorMessage } from "@/lib/error-message";
import { QUEUE_EVENT, allCheckins, discardCheckin, flushCheckins, resolveConflict, type QueuedCheckin } from "./logistics-offline";

export function useCheckinQueue(autoSync: boolean) {
  const [items, setItems] = useState<QueuedCheckin[]>([]);
  const [syncing, setSyncing] = useState(false);

  const refresh = useCallback(() => { void allCheckins().then(setItems).catch(() => {}); }, []);

  /** `quiet` suppresses the "nothing to do / still offline" messages for the automatic runs. */
  const sync = useCallback(async (quiet: boolean) => {
    setSyncing(true);
    try {
      const r = await flushCheckins();
      if (r.synced) toast.success(`${r.synced} check-in${r.synced === 1 ? "" : "s"} uploaded`);
      if (r.needsDecision && !quiet) toast.warning(`${r.needsDecision} check-in${r.needsDecision === 1 ? "" : "s"} need${r.needsDecision === 1 ? "s" : ""} your decision — open the list.`);
      if (r.failed && !quiet) toast.error(`${r.failed} check-in${r.failed === 1 ? "" : "s"} couldn't be uploaded — open the list to see why.`);
      if (!r.failed && !r.needsDecision && !quiet && r.remaining) toast.info("Still no signal — they'll upload when you're back online.");
    } finally { setSyncing(false); refresh(); }
  }, [refresh]);

  useEffect(() => {
    refresh();
    window.addEventListener(QUEUE_EVENT, refresh);
    return () => window.removeEventListener(QUEUE_EVENT, refresh);
  }, [refresh]);

  useEffect(() => {
    if (!autoSync) return;
    const go = () => { if (navigator.onLine) void sync(true); };
    go();
    window.addEventListener("online", go);
    const t = window.setInterval(go, 60_000);
    return () => { window.removeEventListener("online", go); window.clearInterval(t); };
  }, [autoSync, sync]);

  return { items, syncing, sync };
}

export function PendingBanner({ queue }: { queue: ReturnType<typeof useCheckinQueue> }) {
  const [open, setOpen] = useState(false);
  const { items, syncing, sync } = queue;
  if (items.length === 0) return null;
  const stuck = items.filter((i) => i.error).length;
  const decide = items.filter((i) => i.conflict).length;

  async function settle(id: string, action: "merge" | "discard") {
    try { await resolveConflict(id, action); toast.success(action === "merge" ? "Checked in on the existing record" : "Discarded"); }
    catch (e) { toast.error(errorMessage(e, "Could not do that — check your signal and try again")); }
  }

  return (
    <>
      <div className="flex items-center gap-3 rounded-xl border border-amber-500/50 bg-amber-500/10 p-3">
        <CloudOff className="h-5 w-5 shrink-0 text-amber-500" />
        <div className="min-w-0 flex-1 text-[14px]">
          <div className="font-semibold">{items.length} check-in{items.length === 1 ? "" : "s"} saved on this phone</div>
          <div className="text-muted-foreground">{decide ? `${decide} need${decide === 1 ? "s" : ""} your decision.` : stuck ? `${stuck} couldn't upload.` : "Waiting for signal — they upload by themselves."}</div>
        </div>
        <button type="button" onClick={() => setOpen(true)} className="shrink-0 rounded-lg border border-border px-3 py-2 text-[14px] font-semibold">View</button>
      </div>

      {open && (
        <Sheet title="Waiting to upload" onClose={() => setOpen(false)}>
          <ul className="divide-y divide-border/50 rounded-lg border border-border">
            {items.map((i) => (
              <li key={i.id} className="flex items-start gap-3 px-3 py-3">
                <div className="min-w-0 flex-1 text-[14px]">
                  <div className="truncate font-mono font-semibold">{i.payload.awb}</div>
                  <div className="truncate text-muted-foreground">{i.payload.fields.boat_name ?? "—"} · saved {new Date(i.savedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</div>
                  {i.conflict && <div className="mt-1 text-[14px] text-amber-600">{i.conflict.summary} Check this one in on that record, or discard it?</div>}
                  {i.error && <div className="mt-1 text-[14px] text-destructive">{i.error}</div>}
                  {i.conflict && (
                    <button type="button" onClick={() => void settle(i.id, "merge")} className="mt-2 h-10 rounded-lg bg-primary px-3 text-[14px] font-semibold text-primary-foreground">Check in on that record</button>
                  )}
                </div>
                <button type="button" className="shrink-0 px-2 py-1 text-[14px] font-medium text-destructive"
                  onClick={() => { if (window.confirm(`Discard the check-in for ${i.payload.awb}? It has not been uploaded.`)) void discardCheckin(i.id); }}>
                  Discard
                </button>
              </li>
            ))}
          </ul>
          <button type="button" onClick={() => void sync(false)} disabled={syncing}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-primary text-[16px] font-semibold text-primary-foreground disabled:opacity-50">
            {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : "Upload now"}
          </button>
        </Sheet>
      )}
    </>
  );
}

/**
 * The field app's connection strip — tells the crew they can keep working with
 * no signal, how many changes are waiting to go, and anything that couldn't be
 * sent (with Try again / Discard). Hidden when online with nothing waiting.
 */
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CloudOff, Loader2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ORBIT_OFFLINE_EVENT, ORBIT_SYNCED_EVENT, readStatus, sendNow, discardChange, retryChange, type OfflineStatus,
} from "@/lib/orbit-offline";
import { stamp } from "./orbit2-fields";

const EMPTY: OfflineStatus = { offline: false, pending: 0, problems: [], lastFresh: null };

export function useOrbitOffline(): OfflineStatus {
  const [status, setStatus] = useState<OfflineStatus>(EMPTY);
  const refresh = useCallback(() => { void readStatus().then(setStatus).catch(() => {}); }, []);
  useEffect(() => {
    refresh();
    const events = [ORBIT_OFFLINE_EVENT, ORBIT_SYNCED_EVENT, "online", "offline"];
    events.forEach((e) => window.addEventListener(e, refresh));
    const t = window.setInterval(refresh, 15_000);
    return () => { events.forEach((e) => window.removeEventListener(e, refresh)); window.clearInterval(t); };
  }, [refresh]);
  return status;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function OfflineBar({ status }: { status: OfflineStatus }) {
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const { offline, pending, problems, lastFresh } = status;
  if (!offline && pending === 0 && problems.length === 0) return null;

  async function send() {
    setSending(true);
    try { await sendNow(); } finally { setSending(false); }
  }

  return (
    <div className="border-b border-border/70">
      {offline ? (
        <div className="flex items-start gap-2.5 bg-amber-500/15 px-4 py-2.5 text-[14px] text-amber-200">
          <CloudOff className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="min-w-0">
            <div className="font-semibold">No signal — keep working</div>
            <div className="text-amber-100/80">
              {pending > 0 ? `${plural(pending, "change", "changes")} saved on this phone, sent when signal returns.` : "Changes are saved on this phone and sent when signal returns."}
              {lastFresh ? ` Jobs as of ${stamp(new Date(lastFresh).toISOString())}.` : ""}
            </div>
          </div>
        </div>
      ) : pending > 0 ? (
        <div className="flex items-center justify-between gap-3 bg-sky-500/15 px-4 py-2.5 text-[14px] text-sky-200">
          <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Sending {plural(pending, "change", "changes")}…</span>
          <button onClick={() => void send()} disabled={sending}
            className="rounded-md px-2 py-1 font-semibold text-sky-100 hover:bg-sky-500/20 disabled:opacity-60">Send now</button>
        </div>
      ) : null}

      {problems.length > 0 && (
        <div className="bg-red-500/10 px-4 py-2.5 text-[14px] text-red-200">
          <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between gap-2 text-left">
            <span className="flex items-center gap-2 font-semibold">
              <AlertTriangle className="h-4 w-4" /> {plural(problems.length, "change", "changes")} couldn't be sent
            </span>
            <span className="text-red-100/80">{open ? "Hide" : "Review"}</span>
          </button>
          {open && (
            <ul className="mt-2 space-y-2">
              {problems.map((p) => (
                <li key={p.seq} className="rounded-lg border border-red-500/30 bg-background/40 p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-foreground">{p.label}</span>
                    <span className="text-muted-foreground">{stamp(p.createdAt)}</span>
                  </div>
                  <div className="mt-0.5 text-red-100/80">{p.error ?? "Couldn't be sent."}</div>
                  <div className="mt-2 flex gap-2">
                    {p.state === "failed" && (
                      <button onClick={() => void retryChange(p)}
                        className={cn("flex items-center gap-1 rounded-md border border-border px-2.5 py-1 font-medium text-foreground hover:bg-accent")}>
                        <RefreshCw className="h-3.5 w-3.5" /> Try again
                      </button>
                    )}
                    <button onClick={() => void discardChange(p.seq!)}
                      className="rounded-md border border-border px-2.5 py-1 font-medium text-muted-foreground hover:bg-accent">
                      Discard
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

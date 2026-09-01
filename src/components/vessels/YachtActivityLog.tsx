/**
 * Everything Polaris has sent out about a vessel.
 *
 * Reads yacht_activity_log, which permit emails write to — including refused
 * attempts, so "we tried to email the client while sending was switched off" is
 * visible rather than invisible. Each entry can be expanded to show the exact
 * message that went out, kept verbatim at send time so a later template change
 * can't rewrite history.
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  History, Mail, Paperclip, ChevronDown, ChevronRight, Loader2,
  CheckCircle2, Ban, AlertTriangle, RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Entry = {
  id: string;
  permit_id: string | null;
  kind: string;
  channel: string;
  subject: string | null;
  recipients: string[] | null;
  cc: string[] | null;
  body_html: string | null;
  attachments: Array<{ filename?: string; link_only?: boolean }> | null;
  status: "sent" | "blocked" | "failed" | "preview";
  error: string | null;
  actor_name: string | null;
  created_at: string;
};

const KIND_LABELS: Record<string, string> = {
  cruising_mothership: "Cruising Permit — Mothership",
  cruising_tenders: "Cruising Permit — Tenders",
  dma: "DMA Permit",
  navigation_license: "Navigation Licence",
  sanitation: "Sanitation Certificate",
  tdra: "TDRA Permit",
  exit_entry: "Exit & Entry Permit",
  gate_pass: "Gate Pass",
  permit_to_work: "Permit to Work",
};

const STATUS_META: Record<Entry["status"], { label: string; cls: string; Icon: typeof Mail }> = {
  sent:    { label: "Sent",    cls: "bg-emerald-500/15 text-emerald-400", Icon: CheckCircle2 },
  blocked: { label: "Blocked", cls: "bg-amber-500/15 text-amber-400",     Icon: Ban },
  failed:  { label: "Failed",  cls: "bg-red-500/15 text-red-400",         Icon: AlertTriangle },
  preview: { label: "Preview", cls: "bg-muted text-muted-foreground",     Icon: Mail },
};

const fmtWhen = (d: string) =>
  new Date(d).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

export function YachtActivityLog({ yachtId }: { yachtId: string }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await (supabase as any)
      .from("yacht_activity_log")
      .select("*")
      .eq("yacht_id", yachtId)
      .order("created_at", { ascending: false })
      .limit(200);
    setEntries((data ?? []) as Entry[]);
    setLoading(false);
  }, [yachtId]);
  useEffect(() => { void load(); }, [load]);

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="mb-1 flex items-center gap-2">
        <History className="h-4 w-4 text-primary" />
        <h3 className="font-display text-sm font-semibold">Activity Log</h3>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
          {entries.length}
        </span>
        <button onClick={() => void load()} title="Refresh"
          className="ml-auto rounded p-1 text-muted-foreground transition hover:text-foreground">
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
        </button>
      </div>
      <p className="mb-3 text-[11.5px] text-muted-foreground">
        Everything Polaris has sent out about this vessel — permit emails to the client, with the exact message kept.
      </p>

      {loading && entries.length === 0 ? (
        <div className="flex items-center gap-2 py-6 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
        </div>
      ) : entries.length === 0 ? (
        <p className="py-4 text-xs text-muted-foreground">
          Nothing sent yet. Emailing a permit from its dialog records it here.
        </p>
      ) : (
        <div className="space-y-1.5">
          {entries.map((e) => {
            const meta = STATUS_META[e.status] ?? STATUS_META.sent;
            const isOpen = open === e.id;
            const attach = (e.attachments ?? []).filter(a => a?.filename);
            return (
              <div key={e.id} className="rounded-lg border border-border/70 bg-muted/20">
                <button
                  onClick={() => setOpen(isOpen ? null : e.id)}
                  className="flex w-full items-start gap-2 px-3 py-2 text-left"
                >
                  {isOpen ? <ChevronDown className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          : <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={cn("inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold", meta.cls)}>
                        <meta.Icon className="h-3 w-3" /> {meta.label}
                      </span>
                      <span className="text-xs font-medium">{KIND_LABELS[e.kind] ?? e.kind}</span>
                      {attach.length > 0 && (
                        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                          <Paperclip className="h-3 w-3" /> {attach.length}
                        </span>
                      )}
                      <span className="ml-auto text-[11px] text-muted-foreground/80">{fmtWhen(e.created_at)}</span>
                    </div>
                    <div className="mt-0.5 truncate text-[11.5px] text-muted-foreground">
                      To {(e.recipients ?? []).join(", ") || "—"}
                      {e.actor_name ? ` · by ${e.actor_name}` : ""}
                    </div>
                    {e.error && (
                      <div className="mt-1 text-[11px] text-amber-400/90">{e.error}</div>
                    )}
                  </div>
                </button>

                {isOpen && (
                  <div className="border-t border-border/60 p-3">
                    <div className="mb-2 text-[11.5px]">
                      <span className="text-muted-foreground">Subject: </span>{e.subject ?? "—"}
                      {(e.cc ?? []).length > 0 && (
                        <span className="ml-2 text-muted-foreground">Cc: {(e.cc ?? []).join(", ")}</span>
                      )}
                    </div>
                    {attach.length > 0 && (
                      <div className="mb-2 flex flex-wrap gap-1.5">
                        {attach.map((a, i) => (
                          <span key={i} className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10.5px] text-muted-foreground">
                            <Paperclip className="h-3 w-3" /> {a.filename}
                          </span>
                        ))}
                      </div>
                    )}
                    {e.body_html ? (
                      <iframe title="Sent message" srcDoc={e.body_html} sandbox=""
                        className="h-72 w-full rounded-lg border border-border bg-white" />
                    ) : (
                      <p className="text-xs text-muted-foreground">No message body was recorded.</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

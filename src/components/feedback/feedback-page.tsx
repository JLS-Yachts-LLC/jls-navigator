import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/fetch-all";
import { useAuth } from "@/lib/auth";
import { useDevAccess } from "@/lib/dev-access";
import { SignedAnchor } from "@/components/ui/signed-file";
import { Lightbulb, Bug, Sparkles, ChevronUp, ChevronDown, Loader2, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Feedback = {
  id: string; type: "bug" | "feature"; title: string | null; message: string;
  screenshot_url: string | null; log: any; status: string;
  created_by: string | null; created_by_email: string | null; created_at: string;
  /** Service Desk ticket raised for this report (queue 'polaris'). */
  ticket_id: string | null;
  /** When the support notification email went out; null means it never did. */
  notified_at: string | null;
  notify_error: string | null;
};
type Vote = { feedback_id: string; user_id: string; vote: number };

const STATUS = ["open", "planned", "in_progress", "done", "closed"];
const STATUS_CLS: Record<string, string> = {
  open: "bg-slate-500/15 text-slate-400", planned: "bg-sky-500/15 text-sky-400",
  in_progress: "bg-amber-500/15 text-amber-400", done: "bg-emerald-500/15 text-emerald-400",
  closed: "bg-muted text-muted-foreground",
};
const fmt = (d: string) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

/** Label the attachment by extension — it may be a screenshot, a screen
 *  recording, or a document (PDF / Word / …), all stored in screenshot_url. */
function attachmentLabel(url: string): string {
  const ext = (url.split("?")[0].split(".").pop() ?? "").toLowerCase();
  if (["png", "jpg", "jpeg", "gif", "webp", "bmp", "heic"].includes(ext)) return "Screenshot";
  if (["webm", "mp4", "mov", "mkv"].includes(ext)) return "Screen recording";
  if (ext === "pdf") return "PDF";
  if (["doc", "docx", "odt", "rtf"].includes(ext)) return "Document";
  if (["xls", "xlsx", "csv"].includes(ext)) return "Spreadsheet";
  return "Attachment";
}

export function FeedbackPage() {
  const { user } = useAuth();
  const isAdmin = useDevAccess();
  const [items, setItems] = useState<Feedback[]>([]);
  const [votes, setVotes] = useState<Vote[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"feature" | "bug">("feature");
  // feedback.ticket_id → Service Desk reference (SD-0001), for the tracked badge.
  const [ticketNos, setTicketNos] = useState<Record<string, string>>({});

  useEffect(() => { void load(); }, []);
  async function load() {
    setLoading(true);
    const [f, v] = await Promise.all([
      fetchAllRows(() => (supabase as any).from("feedback").select("*").order("created_at", { ascending: false })),
      fetchAllRows(() => (supabase as any).from("feedback_votes").select("feedback_id, user_id, vote")),
    ]);
    const rows = (f.data ?? []) as Feedback[];
    setItems(rows);
    setVotes((v.data ?? []) as Vote[]);
    setLoading(false);

    const ids = [...new Set(rows.map(r => r.ticket_id).filter(Boolean))] as string[];
    if (ids.length) {
      const { data: t } = await (supabase as any).from("it_tickets").select("id, ticket_no").in("id", ids);
      const map: Record<string, string> = {};
      for (const row of (t ?? []) as { id: string; ticket_no: string | null }[]) {
        if (row.ticket_no) map[row.id] = row.ticket_no;
      }
      setTicketNos(map);
    }
  }

  /** Service Desk reference for a feedback item, when a ticket was raised. */
  const ticketNoOf = (f: Feedback) => (f.ticket_id ? ticketNos[f.ticket_id] : undefined);

  const scoreOf = (id: string) => votes.filter(v => v.feedback_id === id).reduce((s, v) => s + v.vote, 0);
  const myVote = (id: string) => votes.find(v => v.feedback_id === id && v.user_id === user?.id)?.vote ?? 0;

  async function castVote(id: string, vote: 1 | -1) {
    if (!user?.id) return;
    const current = myVote(id);
    const db = supabase as any;
    if (current === vote) {
      // toggle off
      setVotes(prev => prev.filter(v => !(v.feedback_id === id && v.user_id === user.id)));
      await db.from("feedback_votes").delete().eq("feedback_id", id).eq("user_id", user.id);
    } else {
      setVotes(prev => [...prev.filter(v => !(v.feedback_id === id && v.user_id === user.id)), { feedback_id: id, user_id: user.id, vote }]);
      await db.from("feedback_votes").upsert({ feedback_id: id, user_id: user.id, vote }, { onConflict: "feedback_id,user_id" });
    }
  }

  async function setStatus(id: string, status: string) {
    setItems(prev => prev.map(i => i.id === id ? { ...i, status } : i));
    const { error } = await (supabase as any).from("feedback").update({ status, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) { toast.error(error.message); void load(); }
  }

  const features = useMemo(() => items.filter(i => i.type === "feature").sort((a, b) => scoreOf(b.id) - scoreOf(a.id)), [items, votes]);
  const bugs = useMemo(() => items.filter(i => i.type === "bug"), [items]);

  if (loading) return <div className="flex h-full items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-border/70 bg-card/30 px-6 py-3.5">
        <div className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground/60">Polaris</div>
        <h1 className="mt-0.5 flex items-center gap-2 font-display text-[1.25rem] font-semibold tracking-tight"><Lightbulb className="h-5 w-5 text-amber-400" /> Feedback &amp; Requests</h1>
      </header>

      <div className="flex-1 overflow-auto px-6 py-5">
        <div className="mx-auto max-w-4xl">
          <div className="mb-4 flex gap-1 rounded-lg border border-border bg-muted/30 p-0.5 w-fit">
            {([["feature", "Feature Requests", Sparkles, features.length], ["bug", "Bug Reports", Bug, bugs.length]] as const).map(([k, label, Icon, n]) => (
              <button key={k} onClick={() => setTab(k)}
                className={cn("flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12.5px] font-medium transition", tab === k ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                <Icon className="h-3.5 w-3.5" /> {label} <span className="rounded-full bg-muted px-1.5 text-[10px]">{n}</span>
              </button>
            ))}
          </div>

          {tab === "feature" ? (
            <div className="space-y-2.5">
              {features.length === 0 ? <Empty>No feature requests yet — submit one with the 💡 button.</Empty> : features.map(f => {
                const mv = myVote(f.id);
                return (
                  <div key={f.id} className="flex gap-3 rounded-xl border border-border bg-card p-4">
                    <div className="flex w-12 shrink-0 flex-col items-center gap-0.5">
                      <button onClick={() => castVote(f.id, 1)} className={cn("rounded-md p-1 hover:bg-accent", mv === 1 ? "text-emerald-400" : "text-muted-foreground")}><ChevronUp className="h-5 w-5" /></button>
                      <span className="font-display text-base font-bold tabular-nums">{scoreOf(f.id)}</span>
                      <button onClick={() => castVote(f.id, -1)} className={cn("rounded-md p-1 hover:bg-accent", mv === -1 ? "text-red-400" : "text-muted-foreground")}><ChevronDown className="h-5 w-5" /></button>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-display text-sm font-semibold">{f.title || "Feature request"}</h3>
                        <StatusBadge status={f.status} id={f.id} isAdmin={isAdmin} onChange={setStatus} />
                        <TicketRef ticketNo={ticketNoOf(f)} />
                        <NotifyState row={f} onResent={load} />
                      </div>
                      <p className="mt-1 whitespace-pre-wrap text-[13px] text-muted-foreground">{f.message}</p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground/60">
                        <span>{f.created_by_email ?? "—"} · {fmt(f.created_at)}</span>
                        {f.screenshot_url && (
                          <SignedAnchor stored={f.screenshot_url} className="inline-flex items-center gap-1 text-primary hover:underline">
                            <ExternalLink className="h-3 w-3" /> {attachmentLabel(f.screenshot_url)}
                          </SignedAnchor>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="space-y-2.5">
              {bugs.length === 0 ? <Empty>No bug reports.</Empty> : bugs.map(b => (
                <div key={b.id} className="rounded-xl border border-border bg-card p-4">
                  <div className="flex items-center gap-2">
                    <Bug className="h-4 w-4 text-red-400" />
                    <h3 className="font-display text-sm font-semibold">{b.title || b.message.slice(0, 70)}</h3>
                    <StatusBadge status={b.status} id={b.id} isAdmin={isAdmin} onChange={setStatus} />
                    <TicketRef ticketNo={ticketNoOf(b)} />
                    <NotifyState row={b} onResent={load} />
                  </div>
                  <p className="mt-1.5 whitespace-pre-wrap text-[13px] text-muted-foreground">{b.message}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground/70">
                    <span>{b.created_by_email ?? "—"} · {fmt(b.created_at)}</span>
                    {b.screenshot_url && <SignedAnchor stored={b.screenshot_url} className="inline-flex items-center gap-1 text-primary hover:underline"><ExternalLink className="h-3 w-3" /> {attachmentLabel(b.screenshot_url)}</SignedAnchor>}
                    {b.log?.lastError && <span className="text-red-400/80">Error: {String(b.log.lastError).slice(0, 80)}</span>}
                  </div>
                  {isAdmin && b.log?.actions?.length > 0 && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-[11px] text-muted-foreground">Activity log ({b.log.actions.length})</summary>
                      <pre className="mt-1 max-h-48 overflow-auto rounded-md bg-muted/40 p-2 text-[10.5px] text-muted-foreground">{(b.log.actions as any[]).map(a => `${a.t}  ${a.msg}`).join("\n")}</pre>
                    </details>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status, id, isAdmin, onChange }: { status: string; id: string; isAdmin: boolean; onChange: (id: string, s: string) => void }) {
  if (isAdmin) {
    return (
      <select value={status} onChange={e => onChange(id, e.target.value)}
        className={cn("rounded-full px-2 py-0.5 text-[10.5px] font-semibold capitalize", STATUS_CLS[status] ?? STATUS_CLS.open)}>
        {STATUS.map(s => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
      </select>
    );
  }
  return <span className={cn("rounded-full px-2 py-0.5 text-[10.5px] font-semibold capitalize", STATUS_CLS[status] ?? STATUS_CLS.open)}>{status.replace("_", " ")}</span>;
}

/**
 * Whether this report actually reached the support mailboxes.
 *
 * Raising the ticket and emailing support are independent, so a report could sit
 * here looking filed while nothing ever arrived at New Horizon — three reports
 * were lost that way in August with no trace. An unsent one now says so, and can
 * be sent again.
 */
function NotifyState({ row, onResent }: { row: Feedback; onResent: () => void }) {
  const [busy, setBusy] = useState(false);
  if (row.notified_at) return null;

  async function resend() {
    setBusy(true);
    try {
      const res = await fetch("/api/feedback/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedbackId: row.id }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? `Send failed (${res.status})`);
      toast.success("Sent to the support mailboxes");
      onResent();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not send it");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        title={row.notify_error ?? "This report has not been emailed to the support mailboxes."}
        className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10.5px] font-semibold text-amber-400"
      >
        Not sent
      </span>
      <button
        onClick={() => void resend()} disabled={busy}
        className="text-[10.5px] font-medium text-primary hover:underline disabled:opacity-50"
      >
        {busy ? "Sending…" : "Send again"}
      </button>
    </span>
  );
}

/** "SD-0001" pill — shows the report is tracked in the Service Desk (Polaris queue). */
function TicketRef({ ticketNo }: { ticketNo?: string }) {
  if (!ticketNo) return null;
  return (
    <span
      title="Tracked in the Service Desk — Polaris queue"
      className="rounded-full bg-primary/15 px-2 py-0.5 font-mono text-[10.5px] font-semibold text-primary"
    >
      {ticketNo}
    </span>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-dashed border-border py-12 text-center text-sm text-muted-foreground">{children}</div>;
}

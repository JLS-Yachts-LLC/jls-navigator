import { useState, useEffect, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Route } from "@/routes/_app.it-tickets.$ticketId";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ArrowLeft, Loader2, Ship, Send, Lock, MessageSquare, Trash2, Save, Clock, CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  STATUS_ORDER, STATUS_LABEL, STATUS_COLOR,
  PRIORITY_ORDER, PRIORITY_LABEL, PRIORITY_COLOR,
  CATEGORY_ORDER, CATEGORY_LABEL,
  QUEUE_ORDER, QUEUE_LABEL,
  labelFor,
} from "./ticket-meta";

type Ticket = {
  id: string;
  ticket_no: string | null;
  subject: string;
  description: string | null;
  yacht_id: string | null;
  it_yacht_id: string | null;
  queue: string | null;
  category: string | null;
  priority: string | null;
  status: string | null;
  requested_by: string | null;
  assigned_to: string | null;
  resolution: string | null;
  first_response_at: string | null;
  resolved_at: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
};
type Message = {
  id: string;
  body: string;
  internal: boolean;
  author_name: string | null;
  created_at: string;
};
type Yacht = { id: string; vessel_name: string };
type Profile = { id: string; display_name: string | null };

function fmtDateTime(d: string) {
  return new Date(d).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
function initials(name: string | null) {
  if (!name) return "??";
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || name.slice(0, 2).toUpperCase();
}

export function TicketDetailPage() {
  const { ticketId } = Route.useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [yachts, setYachts] = useState<Yacht[]>([]);
  const [itYachts, setItYachts] = useState<Yacht[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  const [reply, setReply] = useState("");
  const [internal, setInternal] = useState(false);
  const [sending, setSending] = useState(false);

  const [resolution, setResolution] = useState("");
  const [requestedBy, setRequestedBy] = useState("");
  const [savingMeta, setSavingMeta] = useState(false);
  const threadEnd = useRef<HTMLDivElement>(null);

  useEffect(() => { void load(); }, [ticketId]);
  useEffect(() => { threadEnd.current?.scrollIntoView({ behavior: "smooth" }); }, [messages.length]);

  async function load() {
    setLoading(true);
    const [tRes, mRes, yRes, pRes, iRes] = await Promise.all([
      (supabase as any).from("it_tickets").select("*").eq("id", ticketId).maybeSingle(),
      (supabase as any).from("it_ticket_messages").select("*").eq("ticket_id", ticketId).order("created_at"),
      supabase.from("yachts").select("id, vessel_name").order("vessel_name"),
      (supabase as any).from("profiles").select("id, display_name").order("display_name"),
      (supabase as any).from("it_yachts").select("id, name").eq("active", true).order("name"),
    ]);
    if (tRes.error || !tRes.data) {
      toast.error("Ticket not found");
      navigate({ to: "/it-tickets" });
      return;
    }
    const t = tRes.data as Ticket;
    setTicket(t);
    setResolution(t.resolution ?? "");
    setRequestedBy(t.requested_by ?? "");
    setMessages((mRes.data ?? []) as Message[]);
    setYachts((yRes.data ?? []) as Yacht[]);
    setItYachts(((iRes.data ?? []) as any[]).map(y => ({ id: y.id, vessel_name: y.name })));
    setProfiles((pRes.data ?? []) as Profile[]);
    setLoading(false);
  }

  const authorName = (user?.email ?? "Staff").split("@")[0];

  async function sendReply() {
    if (!reply.trim() || !ticket) return;
    setSending(true);
    try {
      const { error } = await (supabase as any).from("it_ticket_messages").insert([{
        ticket_id: ticket.id,
        body: reply.trim(),
        internal,
        author_id: user?.id ?? null,
        author_name: authorName,
      }]);
      if (error) throw error;

      // First public reply records the first-response timestamp.
      const patch: Record<string, any> = { updated_at: new Date().toISOString() };
      if (!internal && !ticket.first_response_at) patch.first_response_at = new Date().toISOString();
      await (supabase as any).from("it_tickets").update(patch).eq("id", ticket.id);

      setReply(""); setInternal(false);
      void load();
    } catch (e: any) { toast.error(e.message ?? "Failed to send"); }
    finally { setSending(false); }
  }

  // Inline metadata update — persists immediately.
  async function patchTicket(patch: Record<string, any>) {
    if (!ticket) return;
    const next: Record<string, any> = { ...patch, updated_at: new Date().toISOString() };
    if (patch.status === "resolved" && !ticket.resolved_at) next.resolved_at = new Date().toISOString();
    if (patch.status === "closed" && !ticket.closed_at) next.closed_at = new Date().toISOString();
    setTicket({ ...ticket, ...next });
    const { error } = await (supabase as any).from("it_tickets").update(next).eq("id", ticket.id);
    if (error) { toast.error(error.message); void load(); }
  }

  async function saveResolution() {
    if (!ticket) return;
    setSavingMeta(true);
    await patchTicket({ resolution: resolution || null, requested_by: requestedBy || null });
    setSavingMeta(false);
    toast.success("Saved");
  }

  async function deleteTicket() {
    if (!ticket) return;
    if (!confirm(`Delete ticket ${ticket.ticket_no ?? ""}? This removes its full conversation.`)) return;
    const { error } = await (supabase as any).from("it_tickets").delete().eq("id", ticket.id);
    if (error) toast.error(error.message);
    else { toast.success("Ticket deleted"); navigate({ to: "/it-tickets" }); }
  }

  if (loading) {
    return <div className="flex h-full items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }
  if (!ticket) return null;

  const yachtName = ticket.yacht_id
    ? (yachts.find(y => y.id === ticket.yacht_id)?.vessel_name ?? "—")
    : ticket.it_yacht_id
      ? (itYachts.find(y => y.id === ticket.it_yacht_id)?.vessel_name ?? "—")
      : null;
  const vesselValue = ticket.yacht_id ? `fleet:${ticket.yacht_id}` : ticket.it_yacht_id ? `it:${ticket.it_yacht_id}` : "__none";

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <header className="border-b border-border bg-card/40 px-6 py-4 space-y-3">
        <div className="flex items-center gap-3 text-sm">
          <button onClick={() => navigate({ to: "/it-tickets" })} className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition">
            <ArrowLeft className="h-4 w-4" /> Service Desk
          </button>
          <span className="text-muted-foreground/40">/</span>
          <span className="font-mono text-xs text-muted-foreground">{ticket.ticket_no ?? "—"}</span>
        </div>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="font-display text-xl font-bold">{ticket.subject}</h1>
              <span className={cn("rounded-full px-2.5 py-0.5 text-[10.5px] font-semibold", STATUS_COLOR[ticket.status ?? ""] ?? "bg-muted text-muted-foreground")}>
                {labelFor(STATUS_LABEL, ticket.status)}
              </span>
              <span className={cn("rounded-full px-2.5 py-0.5 text-[10.5px] font-semibold", PRIORITY_COLOR[ticket.priority ?? ""] ?? "bg-muted text-muted-foreground")}>
                {labelFor(PRIORITY_LABEL, ticket.priority)}
              </span>
            </div>
            <div className="mt-1.5 flex items-center gap-4 flex-wrap text-sm text-muted-foreground">
              {yachtName && <span className="flex items-center gap-1.5"><Ship className="h-3.5 w-3.5" />{yachtName}</span>}
              <span>Opened {fmtDateTime(ticket.created_at)}</span>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={deleteTicket} className="gap-1.5 text-destructive/70 hover:text-destructive">
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </Button>
        </div>
      </header>

      {/* Body: conversation + right rail */}
      <div className="flex flex-1 overflow-hidden">
        {/* Conversation */}
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
            {/* Original request */}
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="mb-2 flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary">
                  {initials(ticket.requested_by)}
                </div>
                <span className="text-sm font-semibold">{ticket.requested_by || "Requester"}</span>
                <span className="text-xs text-muted-foreground">opened this ticket · {fmtDateTime(ticket.created_at)}</span>
              </div>
              <p className="whitespace-pre-wrap text-sm text-foreground/90">{ticket.description || <span className="text-muted-foreground italic">No description provided.</span>}</p>
            </div>

            {/* Thread */}
            {messages.map(m => (
              <div key={m.id} className={cn("rounded-xl border p-4", m.internal ? "border-amber-500/30 bg-amber-500/5" : "border-border bg-card")}>
                <div className="mb-2 flex items-center gap-2">
                  <div className={cn("flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-bold", m.internal ? "bg-amber-500/20 text-amber-500" : "bg-primary/15 text-primary")}>
                    {initials(m.author_name)}
                  </div>
                  <span className="text-sm font-semibold">{m.author_name || "Staff"}</span>
                  {m.internal && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-500">
                      <Lock className="h-2.5 w-2.5" /> Internal note
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground">{fmtDateTime(m.created_at)}</span>
                </div>
                <p className="whitespace-pre-wrap text-sm text-foreground/90">{m.body}</p>
              </div>
            ))}
            <div ref={threadEnd} />
          </div>

          {/* Composer */}
          <div className="border-t border-border bg-card/40 px-6 py-3">
            <Textarea
              value={reply}
              onChange={e => setReply(e.target.value)}
              rows={3}
              placeholder={internal ? "Add an internal note (only visible to staff)…" : "Write a reply…"}
              className={cn("resize-none text-sm", internal && "border-amber-500/40 focus-visible:ring-amber-500/30")}
              onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") void sendReply(); }}
            />
            <div className="mt-2 flex items-center justify-between">
              <button
                onClick={() => setInternal(v => !v)}
                className={cn("flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs transition",
                  internal ? "border-amber-500/40 bg-amber-500/10 text-amber-500" : "border-border text-muted-foreground hover:text-foreground")}
              >
                <Lock className="h-3 w-3" /> Internal note
              </button>
              <Button size="sm" onClick={sendReply} disabled={sending || !reply.trim()} className="gap-1.5">
                {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                {internal ? "Add note" : "Send reply"}
              </Button>
            </div>
          </div>
        </div>

        {/* Right rail */}
        <aside className="w-80 shrink-0 overflow-y-auto border-l border-border bg-card/20 px-5 py-5 space-y-4">
          <div className="space-y-1.5">
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Status</Label>
            <Select value={ticket.status ?? "open"} onValueChange={v => patchTicket({ status: v })}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>{STATUS_ORDER.map(s => <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Priority</Label>
            <Select value={ticket.priority ?? "normal"} onValueChange={v => patchTicket({ priority: v })}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>{PRIORITY_ORDER.map(p => <SelectItem key={p} value={p}>{PRIORITY_LABEL[p]}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Queue</Label>
            <Select value={ticket.queue ?? "polaris"} onValueChange={v => patchTicket({ queue: v })}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>{QUEUE_ORDER.map(q => <SelectItem key={q} value={q}>{QUEUE_LABEL[q]}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Category</Label>
            <Select value={ticket.category ?? "general"} onValueChange={v => patchTicket({ category: v })}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>{CATEGORY_ORDER.map(c => <SelectItem key={c} value={c}>{CATEGORY_LABEL[c]}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Vessel</Label>
            <Select
              value={vesselValue}
              onValueChange={v => patchTicket({
                yacht_id:    v.startsWith("fleet:") ? v.slice(6) : null,
                it_yacht_id: v.startsWith("it:") ? v.slice(3) : null,
              })}
            >
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="— None —" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">— None —</SelectItem>
                {yachts.map(y => <SelectItem key={y.id} value={`fleet:${y.id}`}>{y.vessel_name}</SelectItem>)}
                {itYachts.length > 0 && <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50">IT Yachts</div>}
                {itYachts.map(y => <SelectItem key={y.id} value={`it:${y.id}`}>{y.vessel_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Assigned to</Label>
            <Select value={ticket.assigned_to ?? "__none"} onValueChange={v => patchTicket({ assigned_to: v === "__none" ? null : v })}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="— Unassigned —" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">— Unassigned —</SelectItem>
                {profiles.filter(p => p.display_name).map(p => <SelectItem key={p.id} value={p.display_name!}>{p.display_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Requested by</Label>
            <Input value={requestedBy} onChange={e => setRequestedBy(e.target.value)} className="h-9 text-sm" placeholder="Contact name" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Resolution</Label>
            <Textarea rows={4} value={resolution} onChange={e => setResolution(e.target.value)} className="resize-none text-sm" placeholder="How was this resolved?" />
          </div>
          <Button size="sm" onClick={saveResolution} disabled={savingMeta} className="w-full gap-1.5">
            {savingMeta ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save details
          </Button>

          {/* Lifecycle timestamps */}
          <div className="space-y-2 border-t border-border/60 pt-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5"><MessageSquare className="h-3 w-3" /> First response: {ticket.first_response_at ? fmtDateTime(ticket.first_response_at) : "—"}</div>
            <div className="flex items-center gap-1.5"><CheckCircle2 className="h-3 w-3" /> Resolved: {ticket.resolved_at ? fmtDateTime(ticket.resolved_at) : "—"}</div>
            <div className="flex items-center gap-1.5"><Clock className="h-3 w-3" /> Updated: {fmtDateTime(ticket.updated_at)}</div>
          </div>
        </aside>
      </div>
    </div>
  );
}

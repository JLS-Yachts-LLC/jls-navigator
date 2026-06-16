import { useState, useEffect, useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/fetch-all";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Search, Loader2, Headset, Ship, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  STATUS_ORDER, STATUS_LABEL, STATUS_COLOR, STATUS_DOT,
  PRIORITY_ORDER, PRIORITY_LABEL, PRIORITY_COLOR,
  CATEGORY_ORDER, CATEGORY_LABEL,
  QUEUE_ORDER, QUEUE_LABEL,
  labelFor,
} from "./ticket-meta";

type Ticket = {
  id: string;
  ticket_no: string | null;
  subject: string;
  yacht_id: string | null;
  it_yacht_id: string | null;
  queue: string | null;
  category: string | null;
  priority: string | null;
  status: string | null;
  requested_by: string | null;
  assigned_to: string | null;
  description: string | null;
  updated_at: string;
};
type Yacht = { id: string; vessel_name: string };
type Profile = { id: string; display_name: string | null };

const EMPTY_FORM = {
  subject: "", description: "", vessel: "", queue: "polaris", category: "general",
  priority: "normal", requested_by: "", requester_email: "", assigned_to: "",
};

function fmtWhen(d: string) {
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function Pill({ value, map, color }: { value: string | null; map: Record<string, string>; color: Record<string, string> }) {
  if (!value) return <span className="text-muted-foreground/40">—</span>;
  return (
    <span className={cn("rounded-full px-2.5 py-0.5 text-[10.5px] font-semibold", color[value] ?? "bg-muted text-muted-foreground")}>
      {labelFor(map, value)}
    </span>
  );
}

export function ServiceDeskPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Ticket[]>([]);
  const [yachts, setYachts] = useState<Yacht[]>([]);
  const [itYachts, setItYachts] = useState<Yacht[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterQueue, setFilterQueue] = useState("all");
  const [filterPriority, setFilterPriority] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterYacht, setFilterYacht] = useState("all");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);

  useEffect(() => { void load(); }, []);

  async function load() {
    setLoading(true);
    const [tRes, yRes, iRes, pRes] = await Promise.all([
      fetchAllRows(() => (supabase as any).from("it_tickets").select("*").order("updated_at", { ascending: false })),
      fetchAllRows(() => supabase.from("yachts").select("id, vessel_name").order("vessel_name")),
      fetchAllRows(() => (supabase as any).from("it_yachts").select("id, name").eq("active", true).order("name")),
      fetchAllRows(() => (supabase as any).from("profiles").select("id, display_name").order("display_name")),
    ]);
    if (tRes.error) toast.error(tRes.error.message);
    setRows((tRes.data ?? []) as Ticket[]);
    setYachts((yRes.data ?? []) as Yacht[]);
    setItYachts(((iRes.data ?? []) as any[]).map(y => ({ id: y.id, vessel_name: y.name })));
    setProfiles((pRes.data ?? []) as Profile[]);
    setLoading(false);
  }

  // Resolve a ticket's vessel from either the main fleet or the IT-yacht registry.
  const vesselName = (t: { yacht_id: string | null; it_yacht_id: string | null }) =>
    t.yacht_id ? (yachts.find(y => y.id === t.yacht_id)?.vessel_name ?? "—")
    : t.it_yacht_id ? (itYachts.find(y => y.id === t.it_yacht_id)?.vessel_name ?? "—")
    : "—";

  async function create() {
    if (!form.subject.trim()) { toast.error("Subject is required"); return; }
    setBusy(true);
    try {
      const { data, error } = await (supabase as any).from("it_tickets").insert([{
        subject: form.subject.trim(),
        description: form.description || null,
        yacht_id: form.vessel.startsWith("fleet:") ? form.vessel.slice(6) : null,
        it_yacht_id: form.vessel.startsWith("it:") ? form.vessel.slice(3) : null,
        queue: form.queue,
        category: form.category,
        priority: form.priority,
        status: "open",
        requested_by: form.requested_by || null,
        requester_email: form.requester_email || null,
        assigned_to: form.assigned_to || null,
        created_by: user?.id ?? null,
      }]).select("id").single();
      if (error) throw error;
      // Email notification (support mailbox + requester acknowledgement) via Graph.
      if (data?.id) fetch("/api/it-tickets/notify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ticketId: data.id, event: "created" }) }).catch(() => {});
      toast.success("Ticket created");
      setOpen(false); setForm(EMPTY_FORM);
      void load();
    } catch (e: any) { toast.error(e.message ?? "Create failed"); }
    finally { setBusy(false); }
  }

  const filtered = useMemo(() => rows.filter(r => {
    if (filterStatus !== "all" && r.status !== filterStatus) return false;
    if (filterQueue !== "all" && r.queue !== filterQueue) return false;
    if (filterPriority !== "all" && r.priority !== filterPriority) return false;
    if (filterCategory !== "all" && r.category !== filterCategory) return false;
    if (filterYacht !== "all") {
      const matchId = filterYacht.startsWith("fleet:") ? r.yacht_id : filterYacht.startsWith("it:") ? r.it_yacht_id : null;
      const wantId = filterYacht.replace(/^(fleet:|it:)/, "");
      if (matchId !== wantId) return false;
    }
    if (q.trim()) {
      const hay = [r.ticket_no, r.subject, r.requested_by, r.assigned_to, vesselName(r)]
        .join(" ").toLowerCase();
      if (!hay.includes(q.toLowerCase())) return false;
    }
    return true;
  }), [rows, q, filterStatus, filterQueue, filterPriority, filterCategory, filterYacht, yachts, itYachts]);

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-border/70 bg-card/30 px-6 py-3.5">
        <div>
          <div className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground/60">Yacht IT Solutions</div>
          <h1 className="mt-0.5 flex items-center gap-2 font-display text-[1.25rem] font-semibold tracking-tight">
            <Headset className="h-4 w-4 text-primary/80" /> Service Desk
          </h1>
        </div>
        <div className="flex items-center gap-2.5">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/50" />
            <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search tickets…" className="h-9 w-60 pl-8 text-sm" />
          </div>
          <Button size="sm" onClick={() => setOpen(true)} className="h-9 gap-1.5 px-3.5 font-medium shadow-sm">
            <Plus className="h-3.5 w-3.5" /> New Ticket
          </Button>
        </div>
      </header>

      {/* Status filter strip with counts */}
      <div className="flex flex-wrap items-center gap-4 border-b border-border/40 bg-muted/10 px-6 py-2 text-xs">
        <button onClick={() => setFilterStatus("all")}
          className={cn("transition", filterStatus === "all" ? "text-foreground font-semibold" : "text-muted-foreground hover:text-foreground")}>
          All {rows.length}
        </button>
        {STATUS_ORDER.map(s => (
          <button key={s} onClick={() => setFilterStatus(filterStatus === s ? "all" : s)}
            className={cn("flex items-center gap-1.5 transition", filterStatus === s ? "text-foreground font-semibold" : "text-muted-foreground hover:text-foreground")}>
            <span className={cn("h-1.5 w-1.5 rounded-full", STATUS_DOT[s])} />
            {rows.filter(r => r.status === s).length} {STATUS_LABEL[s]}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <Select value={filterQueue} onValueChange={setFilterQueue}>
            <SelectTrigger className="h-8 w-36 text-xs"><SelectValue placeholder="Queue" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Queues</SelectItem>
              {QUEUE_ORDER.map(q => <SelectItem key={q} value={q}>{QUEUE_LABEL[q]}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterPriority} onValueChange={setFilterPriority}>
            <SelectTrigger className="h-8 w-32 text-xs"><SelectValue placeholder="Priority" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Priority</SelectItem>
              {PRIORITY_ORDER.map(p => <SelectItem key={p} value={p}>{PRIORITY_LABEL[p]}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="h-8 w-36 text-xs"><SelectValue placeholder="Category" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {CATEGORY_ORDER.map(c => <SelectItem key={c} value={c}>{CATEGORY_LABEL[c]}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterYacht} onValueChange={setFilterYacht}>
            <SelectTrigger className="h-8 w-40 text-xs"><SelectValue placeholder="Vessel" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Vessels</SelectItem>
              {yachts.map(y => <SelectItem key={y.id} value={`fleet:${y.id}`}>{y.vessel_name}</SelectItem>)}
              {itYachts.length > 0 && <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50">IT Yachts</div>}
              {itYachts.map(y => <SelectItem key={y.id} value={`it:${y.id}`}>{y.vessel_name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-6 py-5">
        {loading ? (
          <div className="flex h-40 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : filtered.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center rounded-xl border border-dashed border-border text-center">
            <Headset className="mb-3 h-7 w-7 text-muted-foreground/40" />
            <p className="font-display text-base font-semibold">
              {rows.length === 0 ? "No tickets yet" : "No tickets match"}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              Raise and track IT support requests across the fleet — connectivity, cyber security, hardware and networks.
            </p>
            {rows.length === 0 && (
              <Button onClick={() => setOpen(true)} className="mt-4 gap-1.5"><Plus className="h-4 w-4" /> New Ticket</Button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-[0_2px_12px_-4px_rgba(0,0,0,0.4)]">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border bg-muted/30">
                {["Ticket", "Subject", "Vessel", "Queue", "Category", "Priority", "Status", "Assigned", "Updated"].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground whitespace-nowrap">{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {filtered.map(r => (
                  <tr key={r.id} className="border-b border-border/40 hover:bg-accent/20 transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <Link to="/it-tickets/$ticketId" params={{ ticketId: r.id }} className="font-mono text-xs text-primary hover:underline">
                        {r.ticket_no ?? "—"}
                      </Link>
                    </td>
                    <td className="px-4 py-3 max-w-xs">
                      <Link to="/it-tickets/$ticketId" params={{ ticketId: r.id }} className="font-medium hover:text-primary transition-colors line-clamp-1">
                        {r.subject}
                      </Link>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                      {(r.yacht_id || r.it_yacht_id)
                        ? <span className="inline-flex items-center gap-1"><Ship className="h-3 w-3" />{vesselName(r)}</span>
                        : <span className="text-muted-foreground/40">—</span>}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{labelFor(QUEUE_LABEL, r.queue)}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{labelFor(CATEGORY_LABEL, r.category)}</td>
                    <td className="px-4 py-3"><Pill value={r.priority} map={PRIORITY_LABEL} color={PRIORITY_COLOR} /></td>
                    <td className="px-4 py-3"><Pill value={r.status} map={STATUS_LABEL} color={STATUS_COLOR} /></td>
                    <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{r.assigned_to || <span className="text-muted-foreground/40">Unassigned</span>}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{fmtWhen(r.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* New ticket dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><MessageSquare className="h-4 w-4 text-primary" /> New Ticket</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            <div className="col-span-2 space-y-1.5">
              <Label className="text-xs">Subject <span className="text-destructive">*</span></Label>
              <Input value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} placeholder="Short summary of the issue…" autoFocus className="h-8" />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label className="text-xs">Description</Label>
              <Textarea rows={3} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="What's happening? Steps, error messages, affected systems…" className="resize-none text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Vessel</Label>
              <Select value={form.vessel || "__none"} onValueChange={v => setForm(f => ({ ...f, vessel: v === "__none" ? "" : v }))}>
                <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="— None —" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">— None —</SelectItem>
                  {yachts.map(y => <SelectItem key={y.id} value={`fleet:${y.id}`}>{y.vessel_name}</SelectItem>)}
                  {itYachts.length > 0 && <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50">IT Yachts</div>}
                  {itYachts.map(y => <SelectItem key={y.id} value={`it:${y.id}`}>{y.vessel_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Queue</Label>
              <Select value={form.queue} onValueChange={v => setForm(f => ({ ...f, queue: v }))}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>{QUEUE_ORDER.map(q => <SelectItem key={q} value={q}>{QUEUE_LABEL[q]}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Category</Label>
              <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>{CATEGORY_ORDER.map(c => <SelectItem key={c} value={c}>{CATEGORY_LABEL[c]}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Priority</Label>
              <Select value={form.priority} onValueChange={v => setForm(f => ({ ...f, priority: v }))}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>{PRIORITY_ORDER.map(p => <SelectItem key={p} value={p}>{PRIORITY_LABEL[p]}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Assign to</Label>
              <Select value={form.assigned_to || "__none"} onValueChange={v => setForm(f => ({ ...f, assigned_to: v === "__none" ? "" : v }))}>
                <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="— Unassigned —" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">— Unassigned —</SelectItem>
                  {profiles.filter(p => p.display_name).map(p => <SelectItem key={p.id} value={p.display_name!}>{p.display_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Requested by</Label>
              <Input value={form.requested_by} onChange={e => setForm(f => ({ ...f, requested_by: e.target.value }))} placeholder="Crew member / contact name" className="h-8" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Requester email</Label>
              <Input type="email" value={form.requester_email} onChange={e => setForm(f => ({ ...f, requester_email: e.target.value }))} placeholder="for ticket updates" className="h-8" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
            <Button onClick={create} disabled={busy} className="gap-1.5">{busy && <Loader2 className="h-4 w-4 animate-spin" />}Create Ticket</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

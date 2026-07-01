import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Orbit, Plus, Loader2, Search, Activity, Ship } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  ORBIT_CATEGORIES, CATEGORY_LABEL, QUICK_ACTIONS, STATUS_META, URGENCY_META,
} from "./orbit-constants";
import { BunkerRequestForm } from "./bunker-request-form";

type Yacht = { id: string; vessel_name: string };
type Request = {
  id: string; title: string; category: string; request_type: string | null;
  urgency: string; status: string; yacht_id: string | null; marina: string | null;
  scheduled_date: string | null; created_at: string;
  yacht?: { vessel_name: string } | null;
};

const SUMMARY_STATUSES = ["awaiting_quotation", "awaiting_approval", "scheduled", "in_progress", "completed", "cancelled"];

const EMPTY = {
  title: "", yacht_id: "__none", category: "TECHNICAL_MARINE", request_type: "",
  urgency: "medium", marina: "", scheduled_date: "", description: "", emergency: false,
};

function fmt(d: string | null) {
  return d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";
}
function relTime(iso: string) {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 60) return `${m}m ago`;
  if (m < 1440) return `${Math.round(m / 60)}h ago`;
  return `${Math.round(m / 1440)}d ago`;
}

export function OrbitRequestsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState<Request[]>([]);
  const [yachts, setYachts] = useState<Yacht[]>([]);
  const [activity, setActivity] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [bunkerFormOpen, setBunkerFormOpen] = useState(false);
  const [form, setForm] = useState({ ...EMPTY });
  const [busy, setBusy] = useState(false);

  useEffect(() => { void load(); }, []);
  async function load() {
    setLoading(true);
    const db = supabase as any;
    const [r, y, a] = await Promise.all([
      db.from("orbit_service_requests").select("*, yacht:yachts(vessel_name)").order("created_at", { ascending: false }),
      db.from("yachts").select("id, vessel_name").order("vessel_name"),
      db.from("orbit_activity_log").select("*, request:orbit_service_requests(title)").order("created_at", { ascending: false }).limit(8),
    ]);
    if (r.error) toast.error(r.error.message); else setRows((r.data ?? []) as Request[]);
    setYachts((y.data ?? []) as Yacht[]);
    setActivity(a.data ?? []);
    setLoading(false);
  }

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of rows) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [rows]);

  const filtered = useMemo(() => rows.filter(r => {
    if (statusFilter !== "all" && r.status !== statusFilter) return false;
    if (search.trim()) {
      const s = search.toLowerCase();
      if (![r.title, r.request_type, r.yacht?.vessel_name, CATEGORY_LABEL[r.category]].join(" ").toLowerCase().includes(s)) return false;
    }
    return true;
  }), [rows, statusFilter, search]);

  function openNew(category?: string, emergency = false) {
    setForm({ ...EMPTY, category: category ?? EMPTY.category, emergency, urgency: emergency ? "critical" : "medium" });
    setOpen(true);
  }

  async function save() {
    if (!form.title.trim()) { toast.error("A title is required"); return; }
    setBusy(true);
    try {
      const { data, error } = await (supabase as any).from("orbit_service_requests").insert([{
        title: form.title.trim(),
        yacht_id: form.yacht_id === "__none" ? null : form.yacht_id,
        category: form.category,
        request_type: form.request_type || null,
        urgency: form.urgency,
        // Emergency bypasses the quotation step → straight to in_progress (per spec).
        status: form.emergency ? "in_progress" : "submitted",
        marina: form.marina || null,
        scheduled_date: form.scheduled_date || null,
        description: form.description || null,
        requested_by: user?.id ?? null,
      }]).select("id").single();
      if (error) throw error;
      toast.success(form.emergency ? "Emergency request raised" : "Request submitted");
      setOpen(false);
      navigate({ to: "/orbit/requests/$id", params: { id: data.id } }).catch(() => void load());
    } catch (e: any) { toast.error(e.message ?? "Could not submit"); }
    finally { setBusy(false); }
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-border/70 bg-card/30 px-6 py-3.5">
        <div>
          <div className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground/60">Operations</div>
          <h1 className="mt-0.5 font-display text-[1.25rem] font-semibold tracking-tight flex items-center gap-2"><Orbit className="h-5 w-5 text-primary" /> Orbit — Service Requests</h1>
        </div>
        <Button size="sm" onClick={() => openNew()} className="h-9 gap-1.5 px-3.5 font-medium shadow-sm"><Plus className="h-3.5 w-3.5" /> New Request</Button>
      </header>

      <div className="flex-1 overflow-auto px-6 py-5 space-y-5">
        {/* Status summary */}
        <div className="grid grid-cols-3 gap-3 md:grid-cols-6">
          {SUMMARY_STATUSES.map(s => (
            <button key={s} onClick={() => setStatusFilter(statusFilter === s ? "all" : s)}
              className={cn("rounded-xl border bg-card p-3 text-left transition", statusFilter === s ? "border-primary ring-1 ring-primary/30" : "border-border hover:border-primary/30")}>
              <div className="font-display text-2xl font-bold tabular-nums">{counts[s] ?? 0}</div>
              <div className="text-[11px] text-muted-foreground">{STATUS_META[s].label}</div>
            </button>
          ))}
        </div>

        {/* Quick actions */}
        <div>
          <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Raise a request</p>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
            {QUICK_ACTIONS.map(q => {
              const Icon = q.icon;
              return (
                <button key={q.label} onClick={() => q.category === "FUEL_BUNKERING" ? setBunkerFormOpen(true) : openNew(q.category, q.emergency)}
                  className={cn("flex flex-col items-center justify-center gap-1.5 rounded-xl border p-3 text-center text-xs font-medium transition",
                    q.emergency ? "border-red-500/40 bg-red-500/10 text-red-500 hover:bg-red-500/20" : "border-border bg-card hover:border-primary/40 hover:bg-accent")}>
                  <Icon className="h-5 w-5" />
                  {q.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-3">
          {/* Requests list */}
          <div className="lg:col-span-2">
            <div className="mb-2 flex items-center gap-2">
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Requests</p>
              {statusFilter !== "all" && <button onClick={() => setStatusFilter("all")} className="text-[11px] text-muted-foreground hover:text-foreground">· clear filter ({STATUS_META[statusFilter]?.label})</button>}
              <div className="relative ml-auto">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/50" />
                <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…" className="h-8 w-48 pl-8 text-sm" />
              </div>
            </div>
            <div className="overflow-hidden rounded-xl border border-border bg-card">
              {loading ? (
                <div className="flex h-32 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
              ) : filtered.length === 0 ? (
                <div className="flex h-32 flex-col items-center justify-center gap-1 text-muted-foreground">
                  <Orbit className="h-8 w-8 opacity-30" /><p className="text-sm">No requests {statusFilter !== "all" ? "in this status" : "yet"}.</p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-border bg-muted/40 text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {["Request", "Vessel", "Category", "Urgency", "Status", "Raised"].map(h => <th key={h} className="px-3 py-2 whitespace-nowrap">{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {filtered.map(r => (
                      <tr key={r.id} onClick={() => navigate({ to: "/orbit/requests/$id", params: { id: r.id } })} className="cursor-pointer border-b border-border/40 hover:bg-accent/30">
                        <td className="px-3 py-2.5 font-medium text-foreground">{r.title}</td>
                        <td className="px-3 py-2.5 text-muted-foreground">{r.yacht?.vessel_name ?? "—"}</td>
                        <td className="px-3 py-2.5 text-muted-foreground">{CATEGORY_LABEL[r.category] ?? r.category}</td>
                        <td className={cn("px-3 py-2.5 font-medium", URGENCY_META[r.urgency]?.color)}>{URGENCY_META[r.urgency]?.label ?? r.urgency}</td>
                        <td className="px-3 py-2.5"><span className={cn("inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase", STATUS_META[r.status]?.color)}>{STATUS_META[r.status]?.label ?? r.status}</span></td>
                        <td className="px-3 py-2.5 tabular-nums text-muted-foreground">{relTime(r.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Recent activity */}
          <div>
            <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground flex items-center gap-1.5"><Activity className="h-3.5 w-3.5" /> Recent activity</p>
            <div className="rounded-xl border border-border bg-card p-3">
              {activity.length === 0 ? (
                <p className="py-3 text-center text-[12px] text-muted-foreground">No activity yet.</p>
              ) : (
                <ol className="space-y-2.5">
                  {activity.map(a => (
                    <li key={a.id} className="text-[12px]">
                      <span className="font-medium text-foreground">{a.request?.title ?? "Request"}</span>
                      <span className="text-muted-foreground"> — {a.action === "status_changed" ? a.notes : a.action.replace(/_/g, " ")}</span>
                      <div className="text-[10px] text-muted-foreground/70">{relTime(a.created_at)}</div>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Create dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[88vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{form.emergency ? "🚨 Emergency Assistance" : "New Service Request"}</DialogTitle></DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="space-y-1.5"><Label className="text-xs">Title <span className="text-destructive">*</span></Label>
              <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Generator fault — port engine room" className="h-8" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label className="text-xs">Vessel</Label>
                <Select value={form.yacht_id} onValueChange={v => setForm(f => ({ ...f, yacht_id: v }))}><SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="__none">— None —</SelectItem>{yachts.map(y => <SelectItem key={y.id} value={y.id}>{y.vessel_name}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-1.5"><Label className="text-xs">Category</Label>
                <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}><SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>{ORBIT_CATEGORIES.map(c => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}</SelectContent></Select></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label className="text-xs">Request type</Label>
                <Input value={form.request_type} onChange={e => setForm(f => ({ ...f, request_type: e.target.value }))} placeholder="e.g. Engine diagnostics" className="h-8" /></div>
              <div className="space-y-1.5"><Label className="text-xs">Urgency</Label>
                <Select value={form.urgency} onValueChange={v => setForm(f => ({ ...f, urgency: v }))}><SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(URGENCY_META).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}</SelectContent></Select></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label className="text-xs">Marina / location</Label>
                <Input value={form.marina} onChange={e => setForm(f => ({ ...f, marina: e.target.value }))} className="h-8" /></div>
              <div className="space-y-1.5"><Label className="text-xs">Preferred date</Label>
                <Input type="date" value={form.scheduled_date} onChange={e => setForm(f => ({ ...f, scheduled_date: e.target.value }))} className="h-8" /></div>
            </div>
            <div className="space-y-1.5"><Label className="text-xs">Description</Label>
              <Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={3} className="resize-none text-sm" placeholder="What's needed, equipment make/model, fault details…" /></div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
            <Button onClick={save} disabled={busy} className={cn("gap-1.5", form.emergency && "bg-red-500 hover:bg-red-600 text-white")}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} {form.emergency ? "Raise emergency" : "Submit request"}</Button>
          </div>
        </DialogContent>
      </Dialog>

      <BunkerRequestForm
        open={bunkerFormOpen}
        onOpenChange={setBunkerFormOpen}
        yachts={yachts}
        onCreated={(id) => navigate({ to: "/orbit/requests/$id", params: { id } }).catch(() => void load())}
      />
    </div>
  );
}

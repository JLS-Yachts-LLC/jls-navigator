import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate, Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowLeft, Loader2, Ship, Plus, Check, X, Activity } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { CATEGORY_LABEL, STATUS_META, URGENCY_META, SLA_TARGET, NEXT_STATUS, type OrbitStatus } from "./orbit-constants";

function fmt(d: string | null) {
  return d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";
}
function fmtDT(d: string | null) {
  return d ? new Date(d).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";
}

export function OrbitRequestDetailPage() {
  const { id } = useParams({ from: "/_app/orbit/requests/$id" }) as { id: string };
  const { user } = useAuth();
  const navigate = useNavigate();
  const [req, setReq] = useState<any>(null);
  const [quotes, setQuotes] = useState<any[]>([]);
  const [activity, setActivity] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [assign, setAssign] = useState({ assigned_supplier: "", scheduled_date: "" });
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [quote, setQuote] = useState({ supplier: "", amount: "", currency: "AED", valid_until: "", notes: "" });

  const load = useCallback(async () => {
    setLoading(true);
    const db = supabase as any;
    const [r, q, a] = await Promise.all([
      db.from("orbit_service_requests").select("*, yacht:yachts(vessel_name)").eq("id", id).maybeSingle(),
      db.from("orbit_quotations").select("*").eq("request_id", id).order("created_at", { ascending: false }),
      db.from("orbit_activity_log").select("*").eq("request_id", id).order("created_at", { ascending: false }),
    ]);
    setReq(r.data);
    setQuotes(q.data ?? []);
    setActivity(a.data ?? []);
    if (r.data) setAssign({ assigned_supplier: r.data.assigned_supplier ?? "", scheduled_date: r.data.scheduled_date ? r.data.scheduled_date.slice(0, 10) : "" });
    setLoading(false);
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  async function patch(updates: Record<string, unknown>, ok = "Updated") {
    setBusy(true);
    const { error } = await (supabase as any).from("orbit_service_requests")
      .update({ ...updates, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) toast.error(error.message); else { toast.success(ok); await load(); }
    setBusy(false);
  }
  function changeStatus(next: OrbitStatus) {
    patch({ status: next, ...(next === "completed" ? { completed_at: new Date().toISOString() } : {}) }, `Moved to ${STATUS_META[next].label}`);
  }
  async function logActivity(action: string, notes: string) {
    await (supabase as any).from("orbit_activity_log").insert([{ request_id: id, actor_id: user?.id ?? null, action, notes }]);
  }

  async function addQuote() {
    if (!quote.supplier.trim() || !quote.amount) { toast.error("Supplier and amount are required"); return; }
    setBusy(true);
    const { error } = await (supabase as any).from("orbit_quotations").insert([{
      request_id: id, supplier: quote.supplier.trim(), amount: Number(quote.amount), currency: quote.currency,
      valid_until: quote.valid_until || null, notes: quote.notes || null,
    }]);
    if (error) { toast.error(error.message); setBusy(false); return; }
    await logActivity("quote_added", `Quote from ${quote.supplier.trim()}: ${quote.currency} ${quote.amount}`);
    // First quote moves the request into the approval stage.
    if (req?.status === "submitted" || req?.status === "awaiting_quotation") await patch({ status: "awaiting_approval" }, "Quote added");
    else await load();
    setQuoteOpen(false); setQuote({ supplier: "", amount: "", currency: "AED", valid_until: "", notes: "" });
    setBusy(false);
  }
  async function reviewQuote(q: any, status: "accepted" | "rejected") {
    setBusy(true);
    await (supabase as any).from("orbit_quotations").update({ status, reviewed_at: new Date().toISOString(), reviewed_by: user?.id ?? null }).eq("id", q.id);
    await logActivity(`quote_${status}`, `${q.supplier} — ${q.currency} ${q.amount}`);
    if (status === "accepted") await patch({ assigned_supplier: q.supplier, status: "approved" }, "Quote accepted");
    else await load();
    setBusy(false);
  }

  if (loading) return <div className="flex h-full items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  if (!req) return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
      <p className="font-display text-base font-semibold">Request not found</p>
      <Button variant="outline" asChild><Link to={"/orbit/requests" as any}><ArrowLeft className="mr-1.5 h-4 w-4" /> Back to requests</Link></Button>
    </div>
  );

  const nexts = NEXT_STATUS[req.status] ?? [];
  const terminal = req.status === "completed" || req.status === "cancelled";

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-border/70 bg-card/30 px-6 py-3.5">
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => navigate({ to: "/orbit/requests" as any })}><ArrowLeft className="h-4 w-4" /></Button>
        <div className="min-w-0 flex-1">
          <div className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground/60">{CATEGORY_LABEL[req.category] ?? req.category}{req.request_type ? ` · ${req.request_type}` : ""}</div>
          <h1 className="mt-0.5 truncate font-display text-[1.2rem] font-semibold tracking-tight">{req.title}</h1>
        </div>
        <span className={cn("inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase", STATUS_META[req.status]?.color)}>{STATUS_META[req.status]?.label}</span>
      </header>

      <div className="flex-1 overflow-auto px-6 py-5">
        <div className="mx-auto grid max-w-5xl gap-5 lg:grid-cols-3">
          {/* Left: details + workflow */}
          <div className="space-y-5 lg:col-span-2">
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="grid grid-cols-2 gap-x-6 gap-y-2.5 text-sm sm:grid-cols-3">
                <Field label="Vessel" value={req.yacht?.vessel_name ?? "—"} icon={<Ship className="h-3.5 w-3.5" />} />
                <Field label="Urgency" value={<span className={URGENCY_META[req.urgency]?.color}>{URGENCY_META[req.urgency]?.label}</span>} />
                <Field label="SLA target" value={SLA_TARGET[req.urgency] ?? "—"} />
                <Field label="Marina" value={req.marina ?? "—"} />
                <Field label="Scheduled" value={fmt(req.scheduled_date)} />
                <Field label="Supplier" value={req.assigned_supplier ?? "—"} />
              </div>
              {req.description && <p className="mt-4 whitespace-pre-wrap border-t border-border/60 pt-3 text-sm text-muted-foreground">{req.description}</p>}
            </div>

            {/* Workflow */}
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="mb-3 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Workflow</p>
              {terminal ? (
                <p className="text-sm text-muted-foreground">This request is {STATUS_META[req.status].label.toLowerCase()}.{req.completed_at ? ` Completed ${fmtDT(req.completed_at)}.` : ""}</p>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  {nexts.map(n => (
                    <Button key={n} size="sm" disabled={busy} onClick={() => changeStatus(n)} className="gap-1.5">Move to {STATUS_META[n].label}</Button>
                  ))}
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => changeStatus("cancelled")} className="text-destructive">Cancel request</Button>
                </div>
              )}
              {/* Assign + schedule */}
              {!terminal && (
                <div className="mt-4 grid grid-cols-1 gap-3 border-t border-border/60 pt-4 sm:grid-cols-3">
                  <div className="space-y-1.5 sm:col-span-1"><Label className="text-xs">Supplier</Label>
                    <Input value={assign.assigned_supplier} onChange={e => setAssign(a => ({ ...a, assigned_supplier: e.target.value }))} className="h-8" placeholder="Assigned supplier" /></div>
                  <div className="space-y-1.5"><Label className="text-xs">Scheduled date</Label>
                    <Input type="date" value={assign.scheduled_date} onChange={e => setAssign(a => ({ ...a, scheduled_date: e.target.value }))} className="h-8" /></div>
                  <div className="flex items-end">
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => patch({ assigned_supplier: assign.assigned_supplier || null, scheduled_date: assign.scheduled_date || null }, "Saved")}>Save</Button>
                  </div>
                </div>
              )}
            </div>

            {/* Quotations */}
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Quotations</p>
                <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={() => setQuoteOpen(true)}><Plus className="h-3.5 w-3.5" /> Add quote</Button>
              </div>
              {quotes.length === 0 ? <p className="py-2 text-sm text-muted-foreground">No quotations yet.</p> : (
                <div className="divide-y divide-border/50">
                  {quotes.map(q => (
                    <div key={q.id} className="flex items-center gap-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <span className="text-sm font-medium">{q.supplier}</span>
                        <span className="ml-2 tabular-nums text-sm">{q.currency} {Number(q.amount).toLocaleString()}</span>
                        {q.valid_until && <span className="ml-2 text-[11px] text-muted-foreground">valid to {fmt(q.valid_until)}</span>}
                        {q.notes && <div className="text-[11px] text-muted-foreground">{q.notes}</div>}
                      </div>
                      {q.status === "pending" ? (
                        <div className="flex gap-1">
                          <Button size="sm" variant="outline" className="h-7 gap-1 text-xs text-emerald-600" disabled={busy} onClick={() => reviewQuote(q, "accepted")}><Check className="h-3.5 w-3.5" /> Accept</Button>
                          <Button size="sm" variant="outline" className="h-7 gap-1 text-xs text-destructive" disabled={busy} onClick={() => reviewQuote(q, "rejected")}><X className="h-3.5 w-3.5" /> Reject</Button>
                        </div>
                      ) : (
                        <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase", q.status === "accepted" ? "bg-emerald-500/15 text-emerald-600" : "bg-red-500/15 text-red-500")}>{q.status}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right: activity timeline */}
          <div>
            <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground flex items-center gap-1.5"><Activity className="h-3.5 w-3.5" /> Activity</p>
            <ol className="relative ml-1 border-l border-border">
              {activity.map(a => (
                <li key={a.id} className="ml-4 py-2">
                  <span className="absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full bg-primary/70 ring-2 ring-background" />
                  <div className="text-[12.5px] text-foreground">{a.action === "status_changed" ? a.notes : a.action.replace(/_/g, " ")}</div>
                  <div className="text-[10px] text-muted-foreground">{fmtDT(a.created_at)}</div>
                </li>
              ))}
              {activity.length === 0 && <li className="ml-4 py-2 text-sm text-muted-foreground">No activity.</li>}
            </ol>
          </div>
        </div>
      </div>

      {/* Add quote dialog */}
      <Dialog open={quoteOpen} onOpenChange={setQuoteOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add quotation</DialogTitle></DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="space-y-1.5"><Label className="text-xs">Supplier <span className="text-destructive">*</span></Label>
              <Input value={quote.supplier} onChange={e => setQuote(q => ({ ...q, supplier: e.target.value }))} className="h-8" /></div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5 col-span-2"><Label className="text-xs">Amount <span className="text-destructive">*</span></Label>
                <Input type="number" step="0.01" value={quote.amount} onChange={e => setQuote(q => ({ ...q, amount: e.target.value }))} className="h-8" /></div>
              <div className="space-y-1.5"><Label className="text-xs">Currency</Label>
                <Input value={quote.currency} onChange={e => setQuote(q => ({ ...q, currency: e.target.value }))} className="h-8" /></div>
            </div>
            <div className="space-y-1.5"><Label className="text-xs">Valid until</Label>
              <Input type="date" value={quote.valid_until} onChange={e => setQuote(q => ({ ...q, valid_until: e.target.value }))} className="h-8" /></div>
            <div className="space-y-1.5"><Label className="text-xs">Notes</Label>
              <Textarea value={quote.notes} onChange={e => setQuote(q => ({ ...q, notes: e.target.value }))} rows={2} className="resize-none text-sm" /></div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setQuoteOpen(false)} disabled={busy}>Cancel</Button>
            <Button onClick={addQuote} disabled={busy} className="gap-1.5">{busy && <Loader2 className="h-4 w-4 animate-spin" />} Add quote</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, value, icon }: { label: string; value: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/60">{label}</div>
      <div className="mt-0.5 flex items-center gap-1.5 text-sm text-foreground">{icon}{value}</div>
    </div>
  );
}

/**
 * SIM Cards — register of Etisalat / Du SIMs that JLS Yachts resells to yachts.
 * Tracks the number, ICCID, plan, which yacht holds it, what it costs us and
 * what we charge, renewal dates and status. Yacht IT Solutions hub tab.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Pencil, Plus, Search, Signal, Smartphone, Trash2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

const db = supabase as any;

type Sim = {
  id: string; provider: "etisalat" | "du"; phone_number: string | null; iccid: string | null;
  plan_name: string | null; yacht_id: string | null; assigned_to: string | null;
  status: "active" | "suspended" | "cancelled" | "spare";
  monthly_cost: number | null; cost_currency: string; sell_price: number | null; sell_currency: string;
  data_allowance: string | null; activated_on: string | null; renewal_date: string | null; notes: string | null;
};
type YachtOpt = { id: string; vessel_name: string };

const PROVIDER_META: Record<string, { label: string; cls: string }> = {
  etisalat: { label: "Etisalat", cls: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" },
  du: { label: "Du", cls: "border-sky-500/40 bg-sky-500/10 text-sky-300" },
};
const STATUS_CLS: Record<string, string> = {
  active: "pill-success",
  suspended: "pill-warning",
  cancelled: "pill-danger",
  spare: "pill-muted",
};
const money = (v: number | null, ccy: string) =>
  v == null ? "—" : `${ccy} ${Number(v).toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function SimCardsPage() {
  const [rows, setRows] = useState<Sim[]>([]);
  const [yachts, setYachts] = useState<YachtOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [providerFilter, setProviderFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [editing, setEditing] = useState<Sim | "new" | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Sim | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: sims, error }, { data: ys }] = await Promise.all([
      db.from("sim_cards").select("*").order("created_at", { ascending: false }),
      db.from("yachts").select("id, vessel_name").order("vessel_name"),
    ]);
    if (error) toast.error(error.message);
    setRows(sims ?? []);
    setYachts(ys ?? []);
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const yachtName = useMemo(() => {
    const m = new Map(yachts.map((y) => [y.id, y.vessel_name]));
    return (id: string | null) => (id ? m.get(id) ?? "—" : "—");
  }, [yachts]);

  const filtered = useMemo(() => {
    let list = rows;
    if (providerFilter !== "all") list = list.filter((r) => r.provider === providerFilter);
    if (statusFilter !== "all") list = list.filter((r) => r.status === statusFilter);
    if (q.trim()) {
      const s = q.toLowerCase();
      list = list.filter((r) =>
        [r.phone_number, r.iccid, r.plan_name, r.assigned_to, r.notes, yachtName(r.yacht_id)]
          .some((v) => String(v ?? "").toLowerCase().includes(s)));
    }
    return list;
  }, [rows, q, providerFilter, statusFilter, yachtName]);

  const stats = useMemo(() => {
    const active = rows.filter((r) => r.status === "active");
    const cost = active.reduce((s, r) => s + (Number(r.monthly_cost) || 0), 0);
    const revenue = active.reduce((s, r) => s + (Number(r.sell_price) || 0), 0);
    return {
      total: rows.length,
      active: active.length,
      etisalat: rows.filter((r) => r.provider === "etisalat").length,
      du: rows.filter((r) => r.provider === "du").length,
      cost, revenue, margin: revenue - cost,
    };
  }, [rows]);

  const remove = async () => {
    if (!deleteTarget) return;
    const { error } = await db.from("sim_cards").delete().eq("id", deleteTarget.id);
    if (error) toast.error(error.message); else { toast.success("SIM removed"); void load(); }
    setDeleteTarget(null);
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
        <div>
          <div className="label-caps">Yacht IT Solutions</div>
          <h1 className="font-display text-xl font-bold">SIM Cards</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">Etisalat &amp; Du SIMs resold to yachts.</p>
        </div>
        <Button size="sm" className="gap-1.5" onClick={() => setEditing("new")}>
          <Plus className="h-3.5 w-3.5" /> Add SIM
        </Button>
      </header>

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 px-6 pb-4 lg:grid-cols-5">
        <Kpi label="Total SIMs" value={String(stats.total)} sub={`${stats.etisalat} Etisalat · ${stats.du} Du`} />
        <Kpi label="Active" value={String(stats.active)} accent="text-success" />
        <Kpi label="Cost / month" value={money(stats.cost, "AED")} sub="what we pay" />
        <Kpi label="Billed / month" value={money(stats.revenue, "AED")} sub="what yachts pay" />
        <Kpi label="Margin / month" value={money(stats.margin, "AED")} accent={stats.margin >= 0 ? "text-success" : "text-destructive"} />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 px-6 pb-3">
        <div className="relative w-64">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/50" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search number, ICCID, yacht…" className="h-8 pl-8 text-[13px]" />
        </div>
        {["all", "etisalat", "du"].map((p) => (
          <button key={p} onClick={() => setProviderFilter(p)}
                  className={cn("rounded-full border px-2.5 py-0.5 text-[11px] font-medium capitalize transition",
                                providerFilter === p ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:text-foreground")}>
            {p === "all" ? "All providers" : PROVIDER_META[p].label}
          </button>
        ))}
        <span className="mx-1 h-4 w-px bg-border" />
        {["all", "active", "suspended", "spare", "cancelled"].map((s) => (
          <button key={s} onClick={() => setStatusFilter(s)}
                  className={cn("rounded-full border px-2.5 py-0.5 text-[11px] font-medium capitalize transition",
                                statusFilter === s ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:text-foreground")}>
            {s === "all" ? "Any status" : s}
          </button>
        ))}
        <span className="ml-auto text-[12px] text-muted-foreground/60">{filtered.length} of {rows.length}</span>
      </div>

      <div className="flex-1 overflow-auto px-6 pb-6">
        {loading ? (
          <div className="flex h-40 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : filtered.length === 0 ? (
          <div className="flex h-56 flex-col items-center justify-center rounded-xl border border-dashed border-border text-center">
            <Smartphone className="h-9 w-9 text-muted-foreground/50" />
            <h3 className="mt-3 font-display text-lg font-semibold">No SIM cards {rows.length ? "match" : "yet"}</h3>
            <p className="text-sm text-muted-foreground">{rows.length ? "Adjust the filters above." : "Add the first Etisalat or Du SIM to start the register."}</p>
            {!rows.length && <Button size="sm" className="mt-4 gap-1.5" onClick={() => setEditing("new")}><Plus className="h-3.5 w-3.5" /> Add SIM</Button>}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Number</th><th>Provider</th><th>Plan</th><th>Yacht</th><th>Assigned to</th>
                  <th>Data</th><th>Cost / mo</th><th>Billed / mo</th><th>Renewal</th><th>Status</th>
                  <th style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const pm = PROVIDER_META[r.provider];
                  const renewDays = r.renewal_date ? Math.ceil((new Date(r.renewal_date).getTime() - Date.now()) / 86400000) : null;
                  return (
                    <tr key={r.id}>
                      <td className="font-medium tabular-nums">
                        <span className="inline-flex items-center gap-2">
                          <Signal className="h-3.5 w-3.5 text-muted-foreground" />
                          {r.phone_number ?? <span className="text-muted-foreground/50">—</span>}
                        </span>
                      </td>
                      <td><span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-semibold", pm.cls)}>{pm.label}</span></td>
                      <td className="text-foreground/75">{r.plan_name ?? "—"}</td>
                      <td className="font-medium">{yachtName(r.yacht_id)}</td>
                      <td className="text-foreground/75">{r.assigned_to ?? "—"}</td>
                      <td className="text-foreground/75">{r.data_allowance ?? "—"}</td>
                      <td className="tabular-nums text-foreground/75">{money(r.monthly_cost, r.cost_currency)}</td>
                      <td className="tabular-nums text-foreground/75">{money(r.sell_price, r.sell_currency)}</td>
                      <td className="tabular-nums">
                        <span className={cn(renewDays != null && renewDays < 0 && "text-destructive", renewDays != null && renewDays >= 0 && renewDays <= 30 && "text-warning")}>
                          {r.renewal_date ?? "—"}
                        </span>
                      </td>
                      <td><span className={cn("pill", STATUS_CLS[r.status] ?? "pill-muted")}>{r.status}</span></td>
                      <td style={{ textAlign: "right" }}>
                        <div className="inline-flex gap-0.5">
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground" onClick={() => setEditing(r)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground/60 hover:text-destructive" onClick={() => setDeleteTarget(r)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && (
        <SimDialog sim={editing === "new" ? null : editing} yachts={yachts}
                   onClose={() => setEditing(null)}
                   onSaved={() => { setEditing(null); void load(); }} />
      )}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) setDeleteTarget(null); }}>
          <div className="w-full max-w-sm space-y-4 rounded-2xl border border-border bg-card p-5">
            <h3 className="font-semibold">Remove this SIM?</h3>
            <p className="text-sm text-muted-foreground">{deleteTarget.phone_number ?? deleteTarget.iccid ?? "This SIM"} will be deleted from the register.</p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setDeleteTarget(null)}>Cancel</Button>
              <Button variant="destructive" size="sm" onClick={() => void remove()}>Delete</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3">
      <div className="label-caps">{label}</div>
      <div className={cn("mt-1 font-display text-xl font-bold tabular-nums", accent)}>{value}</div>
      {sub && <div className="mt-0.5 text-[10px] text-muted-foreground/60">{sub}</div>}
    </div>
  );
}

function SimDialog({ sim, yachts, onClose, onSaved }: {
  sim: Sim | null; yachts: YachtOpt[]; onClose: () => void; onSaved: () => void;
}) {
  const [form, setForm] = useState<Partial<Sim>>(() => sim ?? {
    provider: "etisalat", status: "active", cost_currency: "AED", sell_currency: "AED",
  });
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<Sim>) => setForm((f) => ({ ...f, ...p }));
  const inputCls = "w-full rounded-lg border border-border bg-background/50 px-3 py-2 text-sm outline-none focus:border-primary/50";
  const labelCls = "mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground";

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const payload = {
      provider: form.provider, phone_number: form.phone_number?.trim() || null,
      iccid: form.iccid?.trim() || null, plan_name: form.plan_name?.trim() || null,
      yacht_id: form.yacht_id || null, assigned_to: form.assigned_to?.trim() || null,
      status: form.status,
      monthly_cost: form.monthly_cost === undefined || form.monthly_cost === null || String(form.monthly_cost) === "" ? null : Number(form.monthly_cost),
      cost_currency: form.cost_currency ?? "AED",
      sell_price: form.sell_price === undefined || form.sell_price === null || String(form.sell_price) === "" ? null : Number(form.sell_price),
      sell_currency: form.sell_currency ?? "AED",
      data_allowance: form.data_allowance?.trim() || null,
      activated_on: form.activated_on || null, renewal_date: form.renewal_date || null,
      notes: form.notes?.trim() || null,
    };
    const { error } = sim
      ? await db.from("sim_cards").update(payload).eq("id", sim.id)
      : await db.from("sim_cards").insert(payload);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(sim ? "SIM updated" : "SIM added");
    onSaved();
  };

  const CCYS = ["AED", "USD", "EUR", "GBP"];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form onSubmit={save} className="max-h-[92vh] w-full max-w-lg space-y-4 overflow-y-auto rounded-2xl border border-border bg-card p-5">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">{sim ? "Edit SIM" : "Add SIM"}</h3>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>

        <div>
          <label className={labelCls}>Provider</label>
          <div className="flex gap-2">
            {(["etisalat", "du"] as const).map((p) => (
              <button key={p} type="button" onClick={() => set({ provider: p })}
                      className={cn("flex-1 rounded-lg border px-3 py-2 text-sm font-semibold capitalize transition",
                                    form.provider === p ? "border-primary/60 bg-primary/15 text-foreground" : "border-border text-muted-foreground hover:text-foreground")}>
                {PROVIDER_META[p].label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div><label className={labelCls}>Phone number</label>
            <input className={inputCls} value={form.phone_number ?? ""} onChange={(e) => set({ phone_number: e.target.value })} placeholder="+971 5x xxx xxxx" /></div>
          <div><label className={labelCls}>ICCID / serial</label>
            <input className={inputCls} value={form.iccid ?? ""} onChange={(e) => set({ iccid: e.target.value })} placeholder="8971…" /></div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div><label className={labelCls}>Plan</label>
            <input className={inputCls} value={form.plan_name ?? ""} onChange={(e) => set({ plan_name: e.target.value })} placeholder="e.g. Business 100GB" /></div>
          <div><label className={labelCls}>Data allowance</label>
            <input className={inputCls} value={form.data_allowance ?? ""} onChange={(e) => set({ data_allowance: e.target.value })} placeholder="100 GB / Unlimited" /></div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div><label className={labelCls}>Yacht</label>
            <select className={inputCls} value={form.yacht_id ?? ""} onChange={(e) => set({ yacht_id: e.target.value || null })}>
              <option value="">Unassigned (spare stock)</option>
              {yachts.map((y) => <option key={y.id} value={y.id}>{y.vessel_name}</option>)}
            </select></div>
          <div><label className={labelCls}>Assigned to (person / device)</label>
            <input className={inputCls} value={form.assigned_to ?? ""} onChange={(e) => set({ assigned_to: e.target.value })} placeholder="Captain / router / crew iPad…" /></div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Monthly cost (we pay)</label>
            <div className="flex gap-1.5">
              <select className={cn(inputCls, "w-24")} value={form.cost_currency ?? "AED"} onChange={(e) => set({ cost_currency: e.target.value })}>
                {CCYS.map((c) => <option key={c}>{c}</option>)}
              </select>
              <input className={inputCls} type="number" step="0.01" min="0" value={form.monthly_cost ?? ""} onChange={(e) => set({ monthly_cost: e.target.value as any })} placeholder="0.00" />
            </div>
          </div>
          <div>
            <label className={labelCls}>Monthly billed (yacht pays)</label>
            <div className="flex gap-1.5">
              <select className={cn(inputCls, "w-24")} value={form.sell_currency ?? "AED"} onChange={(e) => set({ sell_currency: e.target.value })}>
                {CCYS.map((c) => <option key={c}>{c}</option>)}
              </select>
              <input className={inputCls} type="number" step="0.01" min="0" value={form.sell_price ?? ""} onChange={(e) => set({ sell_price: e.target.value as any })} placeholder="0.00" />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div><label className={labelCls}>Activated</label>
            <input className={inputCls} type="date" value={form.activated_on ?? ""} onChange={(e) => set({ activated_on: e.target.value })} /></div>
          <div><label className={labelCls}>Renewal</label>
            <input className={inputCls} type="date" value={form.renewal_date ?? ""} onChange={(e) => set({ renewal_date: e.target.value })} /></div>
          <div><label className={labelCls}>Status</label>
            <select className={inputCls} value={form.status ?? "active"} onChange={(e) => set({ status: e.target.value as Sim["status"] })}>
              {["active", "suspended", "spare", "cancelled"].map((s) => <option key={s} value={s}>{s}</option>)}
            </select></div>
        </div>

        <div><label className={labelCls}>Notes</label>
          <textarea className={cn(inputCls, "resize-none")} rows={2} value={form.notes ?? ""} onChange={(e) => set({ notes: e.target.value })} /></div>

        <Button type="submit" disabled={busy} className="w-full gap-1.5">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} {sim ? "Save changes" : "Add SIM"}
        </Button>
      </form>
    </div>
  );
}

/**
 * Stock & requisitions (On board) — what the vessel keeps on board, and the
 * requisitions the crew raise for what they need. A requisition goes from draft
 * → awaiting approval → approved → sent to JLS (as a Client Request, where the
 * crew and JLS talk it through) → received, which tops the stock back up.
 *
 * Reads go through RLS (vessel-scoped, also works in staff preview); stock
 * writes go through /api/portal/onboard and requisitions through
 * /api/portal/requisitions.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { portalFetch } from "@/lib/portal/portal-fetch";
import { cn } from "@/lib/utils";
import {
  ArrowRight, CheckCircle2, ClipboardList, Loader2, Minus, Package, PackageCheck, Pencil, Plus, Send, Trash2, X,
} from "lucide-react";
import {
  isLowStock, suggestedOrder, REQUISITION_STATUS_LABEL, STOCK_DEPARTMENTS,
} from "@/lib/portal/onboard";
import {
  AddButton, RecordFormModal, SectionCard, SectionEmpty, SectionHeader, SectionLoading, StatusBadge,
  fmtDate, onboardRequest, type FormField,
} from "./section-ui";

const db = supabase as any;

type StockItem = {
  id: string; name: string; department: string; category: string | null; location: string | null; unit: string | null;
  quantity: number; min_quantity: number | null; par_quantity: number | null; supplier_ref: string | null; notes: string | null;
};
type Requisition = {
  id: string; reference: string; title: string; department: string; status: string; needed_by: string | null; notes: string | null;
  raised_by_name: string | null; submitted_at: string | null; approved_by_name: string | null; approved_at: string | null;
  sent_by_name: string | null; sent_at: string | null; captain_request_id: string | null;
  received_by_name: string | null; received_at: string | null; created_at: string;
};
type ReqItem = {
  id: string; requisition_id: string; stock_item_id: string | null; description: string; quantity: number;
  unit: string | null; notes: string | null; received_quantity: number | null; sort_order: number;
};

const REQ_TONE: Record<string, "green" | "amber" | "red" | "sky" | "slate"> = {
  draft: "slate", submitted: "amber", approved: "sky", sent: "sky", received: "green", cancelled: "red",
};
const deptLabel = (d: string) => STOCK_DEPARTMENTS.find((x) => x.value === d)?.label ?? d;
const qty = (n: number | null | undefined) =>
  n == null ? "—" : Number.isInteger(Number(n)) ? String(Number(n)) : String(Number(Number(n).toFixed(3)));

const STOCK_FIELDS: FormField[] = [
  { key: "name", label: "Item", required: true, wide: true, placeholder: "e.g. Still water 500 ml" },
  { key: "department", label: "Department", type: "select", required: true, options: STOCK_DEPARTMENTS.map((d) => ({ value: d.value, label: d.label })) },
  { key: "category", label: "Category", placeholder: "e.g. Beverages" },
  { key: "quantity", label: "On board now", type: "number" },
  { key: "unit", label: "Unit", placeholder: "e.g. bottles, kg, cases" },
  { key: "min_quantity", label: "Minimum level", type: "number", placeholder: "Flag it when it gets this low" },
  { key: "par_quantity", label: "Par level", type: "number", placeholder: "Reorder up to this" },
  { key: "location", label: "Kept in", placeholder: "e.g. Lazarette store" },
  { key: "supplier_ref", label: "Brand / supplier code" },
  { key: "notes", label: "Notes", type: "textarea" },
];

async function reqRequest(init: RequestInit & { id?: string; action?: string } = {}) {
  const qs = new URLSearchParams();
  if (init.id) qs.set("id", init.id);
  if (init.action) qs.set("action", init.action);
  const res = await portalFetch(`/api/portal/requisitions${qs.size ? `?${qs}` : ""}`, {
    ...init,
    headers: init.body ? { "Content-Type": "application/json" } : undefined,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error ?? "Something went wrong — please try again.");
  return body;
}

export function StockSection({ yachtId, canEdit, canApprove, onOpenRequest }: {
  yachtId: string; canEdit: boolean; canApprove: boolean; onOpenRequest: (requestId: string) => void;
}) {
  const [items, setItems] = useState<StockItem[]>([]);
  const [reqs, setReqs] = useState<Requisition[]>([]);
  const [lines, setLines] = useState<ReqItem[]>([]);
  const [requestRefs, setRequestRefs] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"stock" | "requisitions">("stock");
  const [dept, setDept] = useState<string>("all");
  const [lowOnly, setLowOnly] = useState(false);
  const [editingItem, setEditingItem] = useState<StockItem | "new" | null>(null);
  const [editingReq, setEditingReq] = useState<Requisition | "new" | null>(null);
  const [openReqId, setOpenReqId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [s, r, l]: any[] = await Promise.all([
      db.from("onboard_stock_items")
        .select("id, name, department, category, location, unit, quantity, min_quantity, par_quantity, supplier_ref, notes")
        .eq("yacht_id", yachtId).order("name"),
      db.from("onboard_requisitions").select("*").eq("yacht_id", yachtId).order("created_at", { ascending: false }),
      db.from("onboard_requisition_items").select("*").eq("yacht_id", yachtId).order("sort_order"),
    ]);
    setItems(s.data ?? []); setReqs(r.data ?? []); setLines(l.data ?? []);
    const crIds = (r.data ?? []).map((x: Requisition) => x.captain_request_id).filter(Boolean);
    if (crIds.length) {
      const { data } = await db.from("captain_requests").select("id, reference").in("id", crIds);
      setRequestRefs(Object.fromEntries((data ?? []).map((x: any) => [x.id, x.reference])));
    }
    setLoading(false);
  }, [yachtId]);
  useEffect(() => { void load(); }, [load]);

  const deptCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of items) m.set(i.department, (m.get(i.department) ?? 0) + 1);
    return m;
  }, [items]);

  if (loading) return <SectionLoading />;

  const inDept = items.filter((i) => dept === "all" || i.department === dept);
  const low = inDept.filter(isLowStock);
  const shown = lowOnly ? low : inDept;
  const openReq = reqs.find((r) => r.id === openReqId) ?? null;
  const awaiting = reqs.filter((r) => r.status === "submitted").length;
  const active = reqs.filter((r) => !["received", "cancelled"].includes(r.status)).length;

  const adjust = async (item: StockItem, delta: number) => {
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, quantity: Math.max(0, Number(i.quantity) + delta) } : i)));
    try {
      const res = await onboardRequest("stock_item", { method: "POST", id: item.id, action: "adjust", body: JSON.stringify({ delta }) });
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, quantity: res.quantity } : i)));
    } catch (e) {
      alert(e instanceof Error ? e.message : "Could not update the count.");
      void load();
    }
  };

  const requisitionLow = async () => {
    setBusy(true);
    try {
      const res = await reqRequest({ method: "POST", action: "from-low-stock", body: JSON.stringify(dept === "all" ? {} : { department: dept }) });
      await load();
      setView("requisitions");
      setOpenReqId(res.id);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Could not raise the requisition.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Stock & requisitions"
        subtitle="What's on board, what's running low, and what you've asked JLS for. Only your crew see your stock."
        action={canEdit && (view === "stock"
          ? <AddButton onClick={() => setEditingItem("new")}>Add item</AddButton>
          : <AddButton onClick={() => setEditingReq("new")}>New requisition</AddButton>)}
      />

      <div className="grid grid-cols-3 gap-3">
        <SectionCard className="p-4"><div className="text-[11px] uppercase tracking-wide text-muted-foreground">Items</div><div className="mt-1 text-lg font-bold">{items.length}</div></SectionCard>
        <SectionCard className="p-4"><div className="text-[11px] uppercase tracking-wide text-muted-foreground">At or below minimum</div><div className={cn("mt-1 text-lg font-bold", items.some(isLowStock) && "text-amber-400")}>{items.filter(isLowStock).length}</div></SectionCard>
        <SectionCard className="p-4"><div className="text-[11px] uppercase tracking-wide text-muted-foreground">Open requisitions</div><div className="mt-1 text-lg font-bold">{active}{awaiting > 0 && <span className="ml-1.5 text-xs font-medium text-amber-400">· {awaiting} to approve</span>}</div></SectionCard>
      </div>

      <div className="inline-flex rounded-xl border border-border p-1 text-sm">
        {(["stock", "requisitions"] as const).map((v) => (
          <button key={v} onClick={() => setView(v)}
                  className={cn("rounded-lg px-4 py-1.5 font-medium capitalize transition", view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
            {v}{v === "requisitions" && active ? ` (${active})` : ""}
          </button>
        ))}
      </div>

      {view === "stock" && (
        <>
          {items.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => setDept("all")}
                      className={cn("rounded-full border px-3 py-1 text-xs font-medium transition", dept === "all" ? "border-primary/50 bg-primary/15 text-primary" : "border-border text-muted-foreground hover:text-foreground")}>
                All · {items.length}
              </button>
              {STOCK_DEPARTMENTS.filter((d) => deptCounts.has(d.value)).map((d) => (
                <button key={d.value} type="button" onClick={() => setDept(d.value)}
                        className={cn("rounded-full border px-3 py-1 text-xs font-medium transition", dept === d.value ? "border-primary/50 bg-primary/15 text-primary" : "border-border text-muted-foreground hover:text-foreground")}>
                  {d.label} · {deptCounts.get(d.value)}
                </button>
              ))}
              <label className="ml-auto inline-flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                <input type="checkbox" checked={lowOnly} onChange={(e) => setLowOnly(e.target.checked)} className="h-3.5 w-3.5" /> Low only
              </label>
            </div>
          )}

          {canEdit && low.length > 0 && (
            <SectionCard className="flex flex-wrap items-center gap-3 border-amber-500/30 bg-amber-500/5 p-4">
              <Package className="h-5 w-5 shrink-0 text-amber-400" />
              <div className="min-w-0 flex-1 text-sm">
                <span className="font-semibold">{low.length} item{low.length === 1 ? "" : "s"} at or below minimum</span>
                <span className="text-muted-foreground">{dept === "all" ? "" : ` in ${deptLabel(dept)}`} — raise a requisition topping each one back up to its par level.</span>
              </div>
              <button type="button" onClick={() => void requisitionLow()} disabled={busy}
                      className="inline-flex min-h-9 items-center gap-1.5 rounded-xl bg-primary px-4 text-xs font-semibold text-primary-foreground transition hover:brightness-110 disabled:opacity-50">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardList className="h-4 w-4" />} Raise requisition
              </button>
            </SectionCard>
          )}

          {shown.length === 0 ? (
            <SectionEmpty icon={Package} message={items.length === 0
              ? (canEdit ? "Nothing on the list yet. Add what you keep on board, with a minimum level, and you'll see what's running low at a glance." : "No stock recorded yet.")
              : "Nothing matches this filter."} />
          ) : (
            <div className="space-y-2">
              {shown.map((i) => {
                const isLow = isLowStock(i);
                return (
                  <SectionCard key={i.id} className={cn("flex flex-wrap items-center gap-x-4 gap-y-2 p-3 pl-4", isLow && "border-amber-500/30")}>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{i.name}</span>
                        {isLow && <StatusBadge label="low" tone="amber" />}
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {[deptLabel(i.department), i.category, i.location].filter(Boolean).join(" · ")}
                        {i.min_quantity != null && ` · min ${qty(i.min_quantity)}`}
                        {i.par_quantity != null && ` · par ${qty(i.par_quantity)}`}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {canEdit && (
                        <button type="button" onClick={() => void adjust(i, -1)} disabled={Number(i.quantity) <= 0} aria-label={`One fewer ${i.name}`}
                                className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground transition hover:text-foreground disabled:opacity-30">
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                      )}
                      <div className="min-w-[64px] text-center">
                        <div className={cn("text-base font-bold tabular-nums", isLow && "text-amber-400")}>{qty(i.quantity)}</div>
                        {i.unit && <div className="-mt-0.5 text-[10px] text-muted-foreground">{i.unit}</div>}
                      </div>
                      {canEdit && (
                        <>
                          <button type="button" onClick={() => void adjust(i, 1)} aria-label={`One more ${i.name}`}
                                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground transition hover:text-foreground">
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                          <button type="button" onClick={() => setEditingItem(i)} aria-label={`Edit ${i.name}`}
                                  className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-background/60 hover:text-foreground">
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </SectionCard>
                );
              })}
            </div>
          )}
        </>
      )}

      {view === "requisitions" && (
        reqs.length === 0 ? (
          <SectionEmpty icon={ClipboardList} message={canEdit
            ? "No requisitions yet. Raise one from your low stock, or start a new one for anything you need — once approved it goes straight to JLS."
            : "No requisitions yet."} />
        ) : (
          <div className="space-y-2">
            {reqs.map((r) => {
              const its = lines.filter((l) => l.requisition_id === r.id);
              return (
                <button key={r.id} type="button" onClick={() => setOpenReqId(r.id)}
                        className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 rounded-2xl border border-border bg-card/80 p-4 text-left transition hover:border-primary/50">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[11px] text-muted-foreground">{r.reference}</span>
                      <span className="font-medium">{r.title}</span>
                      <StatusBadge label={REQUISITION_STATUS_LABEL[r.status] ?? r.status} tone={REQ_TONE[r.status] ?? "slate"} />
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {deptLabel(r.department)} · {its.length} item{its.length === 1 ? "" : "s"}
                      {r.raised_by_name && ` · raised by ${r.raised_by_name}`}
                      {r.needed_by && ` · needed by ${fmtDate(r.needed_by)}`}
                      {r.captain_request_id && requestRefs[r.captain_request_id] && ` · ${requestRefs[r.captain_request_id]}`}
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground/60" />
                </button>
              );
            })}
          </div>
        )
      )}

      {editingItem && (
        <RecordFormModal
          title={editingItem === "new" ? "Add stock item" : `Edit ${editingItem.name}`}
          kind="stock_item" fields={STOCK_FIELDS}
          initial={editingItem === "new" ? { department: dept === "all" ? "galley" : dept, quantity: 0 } : editingItem}
          onClose={() => setEditingItem(null)}
          onSaved={() => { setEditingItem(null); void load(); }}
          onDelete={editingItem === "new" ? undefined : async () => {
            await onboardRequest("stock_item", { method: "DELETE", id: (editingItem as StockItem).id });
            setEditingItem(null); void load();
          }}
          deleteLabel="Delete item"
        />
      )}
      {editingReq && (
        <RequisitionEditor
          requisition={editingReq === "new" ? null : editingReq}
          lines={editingReq === "new" ? [] : lines.filter((l) => l.requisition_id === editingReq.id)}
          stock={items}
          defaultDept={dept === "all" ? "galley" : dept}
          onClose={() => setEditingReq(null)}
          onSaved={async (id) => { setEditingReq(null); await load(); setOpenReqId(id); }}
        />
      )}
      {openReq && !editingReq && (
        <RequisitionDetail
          requisition={openReq}
          lines={lines.filter((l) => l.requisition_id === openReq.id)}
          requestRef={openReq.captain_request_id ? requestRefs[openReq.captain_request_id] : undefined}
          canEdit={canEdit} canApprove={canApprove}
          onClose={() => setOpenReqId(null)}
          onEdit={() => setEditingReq(openReq)}
          onChanged={load}
          onOpenRequest={onOpenRequest}
        />
      )}
    </div>
  );
}

// ── Requisition editor ───────────────────────────────────────────────────────
type DraftLine = { key: string; description: string; quantity: string; unit: string; notes: string; stock_item_id: string | null };
let lineSeq = 0;
const newLine = (p: Partial<DraftLine> = {}): DraftLine =>
  ({ key: `l${++lineSeq}`, description: "", quantity: "1", unit: "", notes: "", stock_item_id: null, ...p });

const inputCls =
  "w-full rounded-xl border border-border bg-background/50 px-3 py-2.5 text-sm outline-none transition focus:border-primary/60";

function RequisitionEditor({ requisition, lines, stock, defaultDept, onClose, onSaved }: {
  requisition: Requisition | null; lines: ReqItem[]; stock: StockItem[]; defaultDept: string;
  onClose: () => void; onSaved: (id: string) => void;
}) {
  const [title, setTitle] = useState(requisition?.title ?? "");
  const [department, setDepartment] = useState(requisition?.department ?? defaultDept);
  const [neededBy, setNeededBy] = useState(requisition?.needed_by ?? "");
  const [notes, setNotes] = useState(requisition?.notes ?? "");
  const [draft, setDraft] = useState<DraftLine[]>(() => lines.length
    ? lines.map((l) => newLine({ description: l.description, quantity: qty(l.quantity), unit: l.unit ?? "", notes: l.notes ?? "", stock_item_id: l.stock_item_id }))
    : [newLine()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setLine = (key: string, patch: Partial<DraftLine>) => setDraft((d) => d.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const addFromStock = (id: string) => {
    const s = stock.find((x) => x.id === id);
    if (!s) return;
    setDraft((d) => [...d.filter((l) => l.description.trim()), newLine({
      description: s.name, quantity: String(suggestedOrder(s)), unit: s.unit ?? "", stock_item_id: s.id,
    })]);
  };
  const filled = draft.filter((l) => l.description.trim());

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    const body = {
      title, department, needed_by: neededBy || null, notes,
      items: filled.map((l) => ({
        description: l.description, quantity: Number(l.quantity), unit: l.unit || null, notes: l.notes || null, stock_item_id: l.stock_item_id,
      })),
    };
    try {
      const res = await reqRequest({ method: requisition ? "PATCH" : "POST", id: requisition?.id, body: JSON.stringify(body) });
      onSaved(requisition?.id ?? res.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center"
         onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form onSubmit={submit} className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl border border-border bg-card p-5 sm:rounded-3xl sm:p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">{requisition ? `Edit ${requisition.reference}` : "New requisition"}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label htmlFor="req-title" className="mb-1.5 block text-xs font-medium text-muted-foreground">Title <span className="text-primary">*</span></label>
            <input id="req-title" className={inputCls} required maxLength={160} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Galley top-up for Muscat passage" />
          </div>
          <div className="col-span-2 sm:col-span-1">
            <label htmlFor="req-dept" className="mb-1.5 block text-xs font-medium text-muted-foreground">Department</label>
            <select id="req-dept" className={inputCls} value={department} onChange={(e) => setDepartment(e.target.value)}>
              {STOCK_DEPARTMENTS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
          </div>
          <div className="col-span-2 sm:col-span-1">
            <label htmlFor="req-needed" className="mb-1.5 block text-xs font-medium text-muted-foreground">Needed by</label>
            <input id="req-needed" type="date" className={inputCls} value={neededBy} onChange={(e) => setNeededBy(e.target.value)} />
          </div>
        </div>

        <div className="mt-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">Items</h3>
            {stock.length > 0 && (
              <select aria-label="Add an item from stock" className="rounded-xl border border-border bg-background/50 px-3 py-2 text-xs outline-none"
                      value="" onChange={(e) => addFromStock(e.target.value)}>
                <option value="">+ Add from stock…</option>
                {stock.filter((s) => s.department === department).concat(stock.filter((s) => s.department !== department)).map((s) => (
                  <option key={s.id} value={s.id}>{s.name}{isLowStock(s) ? " (low)" : ""} — {deptLabel(s.department)}</option>
                ))}
              </select>
            )}
          </div>
          <div className="mt-2 space-y-2">
            {draft.map((l, idx) => (
              <div key={l.key} className="grid grid-cols-[minmax(0,1fr)_72px_92px_36px] items-center gap-2">
                <input aria-label={`Item ${idx + 1}`} className={inputCls} maxLength={300} value={l.description}
                       onChange={(e) => setLine(l.key, { description: e.target.value, stock_item_id: null })} placeholder="What you need" />
                <input aria-label={`Quantity for item ${idx + 1}`} className={cn(inputCls, "px-2 text-right tabular-nums")} type="number" min={0} step="any"
                       value={l.quantity} onChange={(e) => setLine(l.key, { quantity: e.target.value })} />
                <input aria-label={`Unit for item ${idx + 1}`} className={cn(inputCls, "px-2")} maxLength={40} value={l.unit}
                       onChange={(e) => setLine(l.key, { unit: e.target.value })} placeholder="unit" />
                <button type="button" onClick={() => setDraft((d) => (d.length > 1 ? d.filter((x) => x.key !== l.key) : [newLine()]))}
                        aria-label={`Remove item ${idx + 1}`}
                        className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-red-500/10 hover:text-red-300">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
          <button type="button" onClick={() => setDraft((d) => [...d, newLine()])}
                  className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline">
            <Plus className="h-3.5 w-3.5" /> Add a line
          </button>
        </div>

        <div className="mt-4">
          <label htmlFor="req-notes" className="mb-1.5 block text-xs font-medium text-muted-foreground">Notes for JLS</label>
          <textarea id="req-notes" className={cn(inputCls, "min-h-[72px]")} maxLength={4000} value={notes} onChange={(e) => setNotes(e.target.value)}
                    placeholder="Brands you prefer, delivery instructions, anything else" />
        </div>

        {error && <div className="mt-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-red-300">{error}</div>}
        <button type="submit" disabled={busy || !title.trim() || !filled.length || filled.some((l) => !(Number(l.quantity) > 0))}
                className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:brightness-110 disabled:opacity-50">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} {requisition ? "Save changes" : "Save as draft"}
        </button>
      </form>
    </div>
  );
}

// ── Requisition detail ───────────────────────────────────────────────────────
function RequisitionDetail({ requisition: r, lines, requestRef, canEdit, canApprove, onClose, onEdit, onChanged, onOpenRequest }: {
  requisition: Requisition; lines: ReqItem[]; requestRef?: string; canEdit: boolean; canApprove: boolean;
  onClose: () => void; onEdit: () => void; onChanged: () => Promise<void>; onOpenRequest: (requestId: string) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [receiving, setReceiving] = useState(false);
  const [received, setReceived] = useState<Record<string, string>>(() =>
    Object.fromEntries(lines.map((l) => [l.id, qty(l.quantity)])));

  const act = async (name: string, fn: () => Promise<unknown>) => {
    setBusy(name); setError(null);
    try { await fn(); await onChanged(); } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally { setBusy(null); }
  };
  const approveAndSend = () => act("send", async () => {
    await reqRequest({ method: "POST", id: r.id, action: "approve", body: "{}" });
    await reqRequest({ method: "POST", id: r.id, action: "send", body: "{}" });
  });
  const editable = canEdit && (r.status === "draft" || (r.status === "submitted" && canApprove));

  const steps: Array<[string, string | null, string | null]> = [
    ["Raised", r.raised_by_name, r.created_at],
    ["Submitted", null, r.submitted_at],
    ["Approved", r.approved_by_name, r.approved_at],
    ["Sent to JLS", r.sent_by_name, r.sent_at],
    ["Received", r.received_by_name, r.received_at],
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center"
         onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl border border-border bg-card p-5 sm:rounded-3xl sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs text-muted-foreground">{r.reference}</span>
              <StatusBadge label={REQUISITION_STATUS_LABEL[r.status] ?? r.status} tone={REQ_TONE[r.status] ?? "slate"} />
            </div>
            <h2 className="mt-1 text-lg font-bold">{r.title}</h2>
            <div className="mt-0.5 text-xs text-muted-foreground">
              {deptLabel(r.department)}{r.needed_by && ` · needed by ${fmtDate(r.needed_by)}`}
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Progress */}
        <ol className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-[11px]">
          {steps.filter(([label]) => r.status !== "cancelled" || label === "Raised").map(([label, who, when]) => (
            <li key={label} className={cn("flex items-center gap-1.5", when ? "text-foreground" : "text-muted-foreground/50")}>
              <span className={cn("h-2 w-2 rounded-full", when ? "bg-primary" : "border border-muted-foreground/40")} />
              {label}{when && <span className="text-muted-foreground">· {fmtDate(when)}{who ? ` · ${who}` : ""}</span>}
            </li>
          ))}
          {r.status === "cancelled" && <li className="flex items-center gap-1.5 text-red-300"><span className="h-2 w-2 rounded-full bg-red-400" />Cancelled</li>}
        </ol>

        {/* Lines */}
        <div className="mt-4 overflow-hidden rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-background/40 text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Item</th>
                <th className="px-3 py-2 text-right font-medium">Qty</th>
                {(receiving || r.status === "received") && <th className="px-3 py-2 text-right font-medium">Received</th>}
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.id} className="border-t border-border/60">
                  <td className="px-3 py-2">
                    <div>{l.description}</div>
                    {l.notes && <div className="text-xs text-muted-foreground">{l.notes}</div>}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{qty(l.quantity)}{l.unit ? ` ${l.unit}` : ""}</td>
                  {receiving && (
                    <td className="px-3 py-2 text-right">
                      <input aria-label={`Received quantity of ${l.description}`} type="number" min={0} step="any"
                             value={received[l.id] ?? ""} onChange={(e) => setReceived((m) => ({ ...m, [l.id]: e.target.value }))}
                             className="w-20 rounded-lg border border-border bg-background/50 px-2 py-1 text-right text-sm tabular-nums outline-none focus:border-primary/60" />
                    </td>
                  )}
                  {!receiving && r.status === "received" && (
                    <td className={cn("px-3 py-2 text-right tabular-nums", Number(l.received_quantity ?? 0) < Number(l.quantity) && "text-amber-400")}>
                      {qty(l.received_quantity)}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {r.notes && <p className="mt-3 whitespace-pre-line text-sm text-muted-foreground">{r.notes}</p>}

        {r.captain_request_id && (
          <button type="button" onClick={() => { onClose(); onOpenRequest(r.captain_request_id!); }}
                  className="mt-4 flex w-full items-center gap-3 rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 text-left text-sm transition hover:bg-primary/15">
            <Send className="h-4 w-4 shrink-0 text-primary" />
            <span className="flex-1">With JLS as <span className="font-semibold">{requestRef ?? "your request"}</span> — open it to see progress or message the team.</span>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
          </button>
        )}

        {r.status === "submitted" && !canApprove && (
          <p className="mt-4 text-sm text-muted-foreground">Waiting for the Captain to approve it. Once approved it goes to JLS.</p>
        )}

        {error && <div className="mt-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-red-300">{error}</div>}

        {canEdit && (
          <div className="mt-5 flex flex-wrap gap-2">
            {receiving ? (
              <>
                <button type="button" onClick={() => setReceiving(false)} className="min-h-11 rounded-xl border border-border px-5 text-sm font-medium text-muted-foreground hover:text-foreground">Back</button>
                <button type="button" disabled={!!busy}
                        onClick={() => void act("receive", () => reqRequest({
                          method: "POST", id: r.id, action: "receive",
                          body: JSON.stringify({ items: lines.map((l) => ({ id: l.id, received_quantity: Number(received[l.id] || 0) })) }),
                        }).then(() => setReceiving(false)))}
                        className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:brightness-110 disabled:opacity-50">
                  {busy === "receive" ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackageCheck className="h-4 w-4" />} Confirm received
                </button>
              </>
            ) : (
              <>
                {editable && (
                  <button type="button" onClick={onEdit} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-4 text-sm font-medium text-muted-foreground transition hover:text-foreground">
                    <Pencil className="h-4 w-4" /> Edit
                  </button>
                )}
                {r.status === "draft" && (
                  <button type="button" disabled={!!busy} onClick={() => { if (confirm(`Delete ${r.reference}?`)) void act("delete", () => reqRequest({ method: "DELETE", id: r.id }).then(onClose)); }}
                          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-4 text-sm font-medium text-muted-foreground transition hover:border-red-500/40 hover:text-red-300">
                    <Trash2 className="h-4 w-4" /> Delete
                  </button>
                )}
                {["submitted", "approved"].includes(r.status) && canApprove && (
                  <button type="button" disabled={!!busy} onClick={() => { if (confirm(`Cancel ${r.reference}?`)) void act("cancel", () => reqRequest({ method: "POST", id: r.id, action: "cancel", body: "{}" })); }}
                          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-4 text-sm font-medium text-muted-foreground transition hover:text-foreground">
                    Cancel requisition
                  </button>
                )}
                <div className="flex-1" />
                {r.status === "draft" && !canApprove && (
                  <PrimaryAction busy={busy === "submit"} onClick={() => void act("submit", () => reqRequest({ method: "POST", id: r.id, action: "submit", body: "{}" }))}
                                 icon={<Send className="h-4 w-4" />}>Send for approval</PrimaryAction>
                )}
                {["draft", "submitted"].includes(r.status) && canApprove && (
                  <PrimaryAction busy={busy === "send"} onClick={() => void approveAndSend()} icon={<Send className="h-4 w-4" />}>
                    Approve &amp; send to JLS
                  </PrimaryAction>
                )}
                {r.status === "approved" && canApprove && (
                  <PrimaryAction busy={busy === "send"} onClick={() => void act("send", () => reqRequest({ method: "POST", id: r.id, action: "send", body: "{}" }))}
                                 icon={<Send className="h-4 w-4" />}>Send to JLS</PrimaryAction>
                )}
                {["approved", "sent"].includes(r.status) && (
                  <button type="button" onClick={() => setReceiving(true)}
                          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-primary/40 px-4 text-sm font-semibold text-primary transition hover:bg-primary/10">
                    <PackageCheck className="h-4 w-4" /> Mark received
                  </button>
                )}
              </>
            )}
          </div>
        )}
        {receiving && (
          <p className="mt-2 text-xs text-muted-foreground">Lines linked to your stock list are added to the count on board.</p>
        )}
      </div>
    </div>
  );
}

function PrimaryAction({ busy, onClick, icon, children }: { busy: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} disabled={busy}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:brightness-110 disabled:opacity-50">
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : icon} {children}
    </button>
  );
}

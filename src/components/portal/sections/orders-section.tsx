/**
 * Orders (Agency with JLS) — order from JLS line by line: provisioning, fuel,
 * uniform, spares, chandlery. Each order is a Client Request the team sources
 * against; its status is shown here and the conversation is on the request.
 * Reads and writes through /api/portal/orders.
 */
import { useCallback, useEffect, useState } from "react";
import { portalFetch } from "@/lib/portal/portal-fetch";
import { cn } from "@/lib/utils";
import { ArrowRight, CheckCircle2, Copy, Loader2, Plus, ShoppingCart, Trash2, X } from "lucide-react";
import { ORDER_CATEGORIES, orderStatus } from "@/lib/portal/orders";
import { SectionCard, SectionEmpty, SectionHeader, SectionLoading, StatusBadge, fmtDate } from "./section-ui";

type OrderLine = { description: string; quantity: number; unit: string | null; notes: string | null };
type Order = {
  id: string; reference: string; category: string; title: string; lines: OrderLine[];
  needed_by: string | null; deliver_to: string | null; notes: string | null;
  ordered_by_name: string | null; captain_request_id: string | null; created_at: string;
  captain_requests: { reference: string; status: string } | null;
};

async function api(path: string, init: RequestInit = {}) {
  const res = await portalFetch(path, { ...init, headers: init.body ? { "Content-Type": "application/json" } : undefined });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error ?? "Something went wrong — please try again.");
  return body;
}
const qty = (n: number) => (Number.isInteger(Number(n)) ? String(Number(n)) : String(Number(Number(n).toFixed(3))));
const catLabel = (c: string) => ORDER_CATEGORIES.find((x) => x.value === c)?.label ?? c;

export function OrdersSection({ canEdit, onOpenRequest }: { canEdit: boolean; onOpenRequest: (requestId: string) => void }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [deliverTo, setDeliverTo] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState<{ from: Order | null } | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const body = await api("/api/portal/orders");
      setOrders(body.orders ?? []); setDeliverTo(body.defaultDeliverTo ?? null); setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load orders.");
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  if (loading) return <SectionLoading />;

  return (
    <div className="space-y-4">
      <SectionHeader title="Orders"
                     subtitle="Order from JLS item by item — we source it, quote where needed, and deliver to the boat."
                     action={canEdit && (
                       <button type="button" onClick={() => setForm({ from: null })}
                               className="inline-flex min-h-9 items-center gap-1.5 rounded-xl bg-primary px-4 text-xs font-semibold text-primary-foreground transition hover:brightness-110">
                         <Plus className="h-4 w-4" /> New order
                       </button>
                     )} />
      {notice && <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{notice}</div>}
      {error && <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-red-300">{error}</div>}

      {orders.length === 0 ? (
        <SectionEmpty icon={ShoppingCart} message={canEdit ? "No orders yet. Start one and list what you need — JLS takes it from there." : "No orders yet."} />
      ) : (
        <div className="space-y-2">
          {orders.map((o) => {
            const st = orderStatus(o.captain_requests?.status);
            const isOpen = open === o.id;
            return (
              <SectionCard key={o.id} className="p-0">
                <button type="button" onClick={() => setOpen(isOpen ? null : o.id)} aria-expanded={isOpen}
                        className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 p-4 text-left">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[11px] text-muted-foreground">{o.reference}</span>
                      <span className="font-medium">{o.title}</span>
                      <StatusBadge label={st.label} tone={st.tone} />
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {catLabel(o.category)} · {o.lines.length} item{o.lines.length === 1 ? "" : "s"} · ordered {fmtDate(o.created_at)}
                      {o.ordered_by_name ? ` by ${o.ordered_by_name}` : ""}{o.needed_by ? ` · needed by ${fmtDate(o.needed_by)}` : ""}
                    </div>
                  </div>
                  <ArrowRight className={cn("h-4 w-4 text-muted-foreground/60 transition", isOpen && "rotate-90")} />
                </button>
                {isOpen && (
                  <div className="space-y-3 border-t border-border/60 p-4">
                    <table className="w-full text-sm">
                      <tbody>
                        {o.lines.map((l, i) => (
                          <tr key={i} className="border-b border-border/40 last:border-0">
                            <td className="py-1.5 pr-3">{l.description}{l.notes && <span className="text-xs text-muted-foreground"> — {l.notes}</span>}</td>
                            <td className="whitespace-nowrap py-1.5 text-right tabular-nums">{qty(l.quantity)}{l.unit ? ` ${l.unit}` : ""}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {o.deliver_to && <div className="text-xs text-muted-foreground">Deliver to {o.deliver_to}</div>}
                    {o.notes && <p className="whitespace-pre-line text-sm text-muted-foreground">{o.notes}</p>}
                    <div className="flex flex-wrap gap-2">
                      {o.captain_request_id && (
                        <button type="button" onClick={() => onOpenRequest(o.captain_request_id!)}
                                className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-border px-3 text-xs font-medium text-muted-foreground transition hover:text-foreground">
                          Messages · {o.captain_requests?.reference ?? "request"} <ArrowRight className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {canEdit && (
                        <button type="button" onClick={() => setForm({ from: o })}
                                className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-border px-3 text-xs font-medium text-muted-foreground transition hover:text-foreground">
                          <Copy className="h-3.5 w-3.5" /> Order again
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </SectionCard>
            );
          })}
        </div>
      )}

      {form && (
        <OrderForm from={form.from} defaultDeliverTo={deliverTo} onClose={() => setForm(null)}
                   onPlaced={(ref, reqRef) => { setForm(null); setNotice(`Order ${ref} sent to JLS (${reqRef}). We'll confirm availability and any quotation.`); void load(); }} />
      )}
    </div>
  );
}

const inputCls =
  "w-full rounded-xl border border-border bg-background/50 px-3 py-2.5 text-sm outline-none transition focus:border-primary/60";
type DraftLine = { key: string; description: string; quantity: string; unit: string; notes: string };
let seq = 0;
const blank = (p: Partial<DraftLine> = {}): DraftLine => ({ key: `o${++seq}`, description: "", quantity: "1", unit: "", notes: "", ...p });

function OrderForm({ from, defaultDeliverTo, onClose, onPlaced }: {
  from: Order | null; defaultDeliverTo: string | null; onClose: () => void; onPlaced: (reference: string, requestReference: string) => void;
}) {
  const [category, setCategory] = useState(from?.category ?? "provisioning");
  const [title, setTitle] = useState(from?.title ?? "");
  const [lines, setLines] = useState<DraftLine[]>(() =>
    from?.lines.length ? from.lines.map((l) => blank({ description: l.description, quantity: qty(l.quantity), unit: l.unit ?? "", notes: l.notes ?? "" })) : [blank(), blank(), blank()]);
  const [neededBy, setNeededBy] = useState("");
  const [deliverTo, setDeliverTo] = useState(from?.deliver_to ?? defaultDeliverTo ?? "");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (key: string, patch: Partial<DraftLine>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const filled = lines.filter((l) => l.description.trim());

  const submit = async () => {
    setBusy(true); setError(null);
    try {
      const res = await api("/api/portal/orders", {
        method: "POST",
        body: JSON.stringify({
          category, title, needed_by: neededBy || null, deliver_to: deliverTo, notes,
          lines: filled.map((l) => ({ description: l.description, quantity: Number(l.quantity), unit: l.unit || null, notes: l.notes || null })),
        }),
      });
      onPlaced(res.reference, res.requestReference);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not place the order."); setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center"
         onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="max-h-[94vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl border border-border bg-card p-5 sm:rounded-3xl sm:p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">{from ? "Order again" : "New order"}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
        </div>

        <fieldset className="mt-4">
          <legend className="mb-2 text-xs font-medium text-muted-foreground">What are you ordering?</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {ORDER_CATEGORIES.map((c) => (
              <label key={c.value} title={c.blurb}
                     className={cn("flex cursor-pointer flex-col rounded-xl border px-3 py-2.5 text-sm transition",
                       category === c.value ? "border-primary/60 bg-primary/15" : "border-border hover:border-primary/30")}>
                <input type="radio" name="order-cat" value={c.value} checked={category === c.value} onChange={() => setCategory(c.value)} className="sr-only" />
                <span className="font-medium">{c.label}</span>
                <span className="text-[11px] text-muted-foreground">{c.blurb}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="ord-title" className="mb-1.5 block text-xs font-medium text-muted-foreground">Title <span className="text-primary">*</span></label>
            <input id="ord-title" className={inputCls} maxLength={160} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Weekend provisioning — 8 guests" />
          </div>
          <div>
            <label htmlFor="ord-needed" className="mb-1.5 block text-xs font-medium text-muted-foreground">Needed by</label>
            <input id="ord-needed" type="date" className={inputCls} min={new Date().toISOString().slice(0, 10)} value={neededBy} onChange={(e) => setNeededBy(e.target.value)} />
          </div>
          <div>
            <label htmlFor="ord-deliver" className="mb-1.5 block text-xs font-medium text-muted-foreground">Deliver to</label>
            <input id="ord-deliver" className={inputCls} maxLength={200} value={deliverTo} onChange={(e) => setDeliverTo(e.target.value)} placeholder="Marina and berth" />
          </div>
        </div>

        <div className="mt-5">
          <h3 className="text-sm font-semibold">Items <span className="text-primary">*</span></h3>
          <div className="mt-2 space-y-2">
            {lines.map((l, i) => (
              <div key={l.key} className="grid grid-cols-[minmax(0,1fr)_72px_92px_36px] items-center gap-2">
                <input aria-label={`Item ${i + 1}`} className={inputCls} maxLength={300} placeholder="Item, brand or part number" value={l.description} onChange={(e) => set(l.key, { description: e.target.value })} />
                <input aria-label={`Quantity for item ${i + 1}`} type="number" min={0} step="any" className={cn(inputCls, "px-2 text-right tabular-nums")} value={l.quantity} onChange={(e) => set(l.key, { quantity: e.target.value })} />
                <input aria-label={`Unit for item ${i + 1}`} className={cn(inputCls, "px-2")} maxLength={40} placeholder="unit" value={l.unit} onChange={(e) => set(l.key, { unit: e.target.value })} />
                <button type="button" onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((x) => x.key !== l.key) : [blank()]))} aria-label={`Remove item ${i + 1}`}
                        className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:text-red-300"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            ))}
          </div>
          <button type="button" onClick={() => setLines((ls) => [...ls, blank()])} className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline">
            <Plus className="h-3.5 w-3.5" /> Add a line
          </button>
        </div>

        <div className="mt-4">
          <label htmlFor="ord-notes" className="mb-1.5 block text-xs font-medium text-muted-foreground">Notes for JLS</label>
          <textarea id="ord-notes" className={cn(inputCls, "min-h-[64px]")} maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)}
                    placeholder="Preferred brands, substitutions OK?, delivery window…" />
        </div>

        {error && <div className="mt-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-red-300">{error}</div>}
        <button type="button" onClick={() => void submit()} disabled={busy || !title.trim() || !filled.length || filled.some((l) => !(Number(l.quantity) > 0))}
                className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:brightness-110 disabled:opacity-50">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Send order to JLS{filled.length ? ` · ${filled.length} item${filled.length === 1 ? "" : "s"}` : ""}
        </button>
      </div>
    </div>
  );
}

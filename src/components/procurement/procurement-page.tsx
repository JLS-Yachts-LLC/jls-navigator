import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ShoppingCart, Plus, Pencil, Trash2, Loader2, Search, X, Check,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type ProcurementItem = {
  id: string;
  request_no: string | null;
  yacht_name: string;
  vendor: string;
  description: string;
  category: string;
  quantity: number;
  unit_price: number | null;
  total_amount: number | null;
  currency: string;
  invoice_ref: string | null;
  status: string;
  requested_date: string;
  ordered_date: string | null;
  received_date: string | null;
  requested_by: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type FormState = Omit<ProcurementItem, "id" | "created_at" | "updated_at">;

type Yacht = { id: string; vessel_name: string };

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORIES = [
  { value: "electronics", label: "Electronics" },
  { value: "provisions", label: "Provisions" },
  { value: "maintenance", label: "Maintenance" },
  { value: "safety", label: "Safety" },
  { value: "cleaning", label: "Cleaning" },
  { value: "clothing", label: "Clothing" },
  { value: "other", label: "Other" },
];

const STATUSES = [
  { value: "requested", label: "Requested" },
  { value: "ordered", label: "Ordered" },
  { value: "received", label: "Received" },
  { value: "cancelled", label: "Cancelled" },
];

const CURRENCIES = [
  { value: "AED", label: "AED" },
  { value: "USD", label: "USD" },
  { value: "GBP", label: "GBP" },
  { value: "EUR", label: "EUR" },
  { value: "ZAR", label: "ZAR" },
];

const EMPTY_FORM: FormState = {
  request_no: null,
  yacht_name: "",
  vendor: "",
  description: "",
  category: "other",
  quantity: 1,
  unit_price: null,
  total_amount: null,
  currency: "AED",
  invoice_ref: null,
  status: "requested",
  requested_date: new Date().toISOString().slice(0, 10),
  ordered_date: null,
  received_date: null,
  requested_by: null,
  notes: null,
};

const STATUS_COLOR: Record<string, string> = {
  requested: "bg-blue-500/15 text-blue-400 border-blue-500/20",
  ordered: "bg-amber-500/15 text-amber-400 border-amber-500/20",
  received: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  cancelled: "bg-muted text-muted-foreground border-border",
};

const CAT_COLOR: Record<string, string> = {
  electronics: "bg-blue-500/15 text-blue-400",
  provisions: "bg-green-500/15 text-green-400",
  maintenance: "bg-orange-500/15 text-orange-400",
  safety: "bg-red-500/15 text-red-400",
  cleaning: "bg-sky-500/15 text-sky-400",
  clothing: "bg-purple-500/15 text-purple-400",
  other: "bg-muted text-muted-foreground",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "2-digit" });
}

function fmtNum(n: number | null | undefined) {
  if (n == null) return "—";
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function StatusBadge({ status }: { status: string }) {
  const label = STATUSES.find(s => s.value === status)?.label ?? status;
  return (
    <span className={cn("inline-flex items-center rounded-full border px-1.5 py-0 text-[10px] font-semibold uppercase tracking-wide", STATUS_COLOR[status] ?? STATUS_COLOR.cancelled)}>
      {label}
    </span>
  );
}

function CatBadge({ category }: { category: string }) {
  const label = CATEGORIES.find(c => c.value === category)?.label ?? category;
  return (
    <span className={cn("inline-flex items-center rounded-full px-1.5 py-0 text-[10px] font-medium", CAT_COLOR[category] ?? CAT_COLOR.other)}>
      {label}
    </span>
  );
}

// ─── Board primitives ─────────────────────────────────────────────────────────

function BoardCell({
  children, editing, onClick, className,
}: { children: React.ReactNode; editing?: boolean; onClick: () => void; className?: string }) {
  return (
    <td
      onClick={onClick}
      className={cn(
        "border-r border-border/40 px-2 py-1 text-xs cursor-pointer",
        editing ? "bg-primary/5 ring-1 ring-inset ring-primary/40" : "hover:bg-accent/30",
        className,
      )}
    >
      {children}
    </td>
  );
}

function InlineSelect<T extends string>({
  value, options, onChange, onDone,
}: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; onDone: () => void }) {
  return (
    <select
      autoFocus
      value={value}
      onChange={e => { onChange(e.target.value as T); onDone(); }}
      onBlur={onDone}
      className="h-6 w-full rounded border border-border bg-card text-xs focus:outline-none focus:ring-1 focus:ring-primary px-1"
    >
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

// ─── Board Row ────────────────────────────────────────────────────────────────

type ActiveCell = { row: string; field: string } | null;

function BoardRow({
  item, yachts, active, onActivate, onSave, onDelete, onEdit,
}: {
  item: ProcurementItem;
  yachts: Yacht[];
  active: ActiveCell;
  onActivate: (field: string) => void;
  onSave: (id: string, patch: Partial<ProcurementItem>) => Promise<void>;
  onDelete: (item: ProcurementItem) => void;
  onEdit: (item: ProcurementItem) => void;
}) {
  const is = (f: string) => active?.row === item.id && active.field === f;

  return (
    <tr className="border-b border-border/40 group hover:bg-muted/10 transition-colors h-8">

      {/* Ref */}
      <BoardCell editing={is("request_no")} onClick={() => onActivate("request_no")} className="w-24">
        {is("request_no") ? (
          <input autoFocus defaultValue={item.request_no ?? ""}
            onBlur={e => onSave(item.id, { request_no: e.target.value || null })}
            onKeyDown={e => { if (e.key === "Enter") { onSave(item.id, { request_no: (e.target as HTMLInputElement).value || null }); onActivate(""); } }}
            className="h-5 w-full rounded border border-border bg-card text-xs px-1 focus:outline-none focus:ring-1 focus:ring-primary font-mono"
          />
        ) : (
          <span className="text-muted-foreground font-mono">{item.request_no ?? "—"}</span>
        )}
      </BoardCell>

      {/* Yacht */}
      <BoardCell editing={is("yacht_name")} onClick={() => onActivate("yacht_name")} className="w-32">
        {is("yacht_name") ? (
          <InlineSelect
            value={item.yacht_name}
            options={[{ value: item.yacht_name, label: item.yacht_name }, ...yachts.filter(y => y.vessel_name !== item.yacht_name).map(y => ({ value: y.vessel_name, label: y.vessel_name }))]}
            onChange={v => onSave(item.id, { yacht_name: v })}
            onDone={() => onActivate("")}
          />
        ) : (
          <span className="font-medium">{item.yacht_name || "—"}</span>
        )}
      </BoardCell>

      {/* Vendor */}
      <BoardCell editing={is("vendor")} onClick={() => onActivate("vendor")} className="w-28">
        {is("vendor") ? (
          <input autoFocus defaultValue={item.vendor}
            onBlur={e => onSave(item.id, { vendor: e.target.value })}
            onKeyDown={e => { if (e.key === "Enter") { onSave(item.id, { vendor: (e.target as HTMLInputElement).value }); onActivate(""); } }}
            className="h-5 w-full rounded border border-border bg-card text-xs px-1 focus:outline-none focus:ring-1 focus:ring-primary"
          />
        ) : (
          <span className="text-muted-foreground">{item.vendor || "—"}</span>
        )}
      </BoardCell>

      {/* Description */}
      <BoardCell editing={is("description")} onClick={() => onActivate("description")} className="min-w-[180px]">
        {is("description") ? (
          <input autoFocus defaultValue={item.description}
            onBlur={e => onSave(item.id, { description: e.target.value })}
            onKeyDown={e => { if (e.key === "Enter") { onSave(item.id, { description: (e.target as HTMLInputElement).value }); onActivate(""); } }}
            className="h-5 w-full rounded border border-border bg-card text-xs px-1 focus:outline-none focus:ring-1 focus:ring-primary"
          />
        ) : (
          <span className="truncate block max-w-[220px]" title={item.description}>{item.description || "—"}</span>
        )}
      </BoardCell>

      {/* Category */}
      <BoardCell editing={is("category")} onClick={() => onActivate("category")} className="w-24">
        {is("category") ? (
          <InlineSelect
            value={item.category as any}
            options={CATEGORIES as any}
            onChange={v => onSave(item.id, { category: v })}
            onDone={() => onActivate("")}
          />
        ) : (
          <CatBadge category={item.category} />
        )}
      </BoardCell>

      {/* Qty */}
      <BoardCell editing={is("quantity")} onClick={() => onActivate("quantity")} className="w-12 text-center">
        {is("quantity") ? (
          <input autoFocus type="number" min="1" defaultValue={item.quantity}
            onBlur={e => {
              const qty = parseFloat(e.target.value) || 1;
              const total = item.unit_price != null ? qty * item.unit_price : item.total_amount;
              onSave(item.id, { quantity: qty, total_amount: total });
            }}
            onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
            className="h-5 w-full rounded border border-border bg-card text-xs px-1 text-center focus:outline-none focus:ring-1 focus:ring-primary"
          />
        ) : (
          <span className="tabular-nums">{item.quantity}</span>
        )}
      </BoardCell>

      {/* Currency */}
      <BoardCell editing={is("currency")} onClick={() => onActivate("currency")} className="w-14">
        {is("currency") ? (
          <InlineSelect
            value={(item.currency || "AED") as any}
            options={CURRENCIES as any}
            onChange={v => onSave(item.id, { currency: v })}
            onDone={() => onActivate("")}
          />
        ) : (
          <span className="text-muted-foreground text-[10px] font-mono">{item.currency || "AED"}</span>
        )}
      </BoardCell>

      {/* Unit Price */}
      <BoardCell editing={is("unit_price")} onClick={() => onActivate("unit_price")} className="w-24 text-right">
        {is("unit_price") ? (
          <input autoFocus type="number" min="0" step="0.01" defaultValue={item.unit_price ?? ""}
            onBlur={e => {
              const price = e.target.value ? parseFloat(e.target.value) : null;
              const total = price != null ? item.quantity * price : null;
              onSave(item.id, { unit_price: price, total_amount: total });
            }}
            onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
            className="h-5 w-full rounded border border-border bg-card text-xs px-1 text-right focus:outline-none focus:ring-1 focus:ring-primary"
          />
        ) : (
          <span className="tabular-nums">{fmtNum(item.unit_price)}</span>
        )}
      </BoardCell>

      {/* Total */}
      <BoardCell editing={is("total_amount")} onClick={() => onActivate("total_amount")} className="w-28 text-right">
        {is("total_amount") ? (
          <input autoFocus type="number" min="0" step="0.01" defaultValue={item.total_amount ?? ""}
            onBlur={e => onSave(item.id, { total_amount: e.target.value ? parseFloat(e.target.value) : null })}
            onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
            className="h-5 w-full rounded border border-border bg-card text-xs px-1 text-right focus:outline-none focus:ring-1 focus:ring-primary"
          />
        ) : (
          <span className="tabular-nums font-medium">{fmtNum(item.total_amount)}</span>
        )}
      </BoardCell>

      {/* Invoice Ref */}
      <BoardCell editing={is("invoice_ref")} onClick={() => onActivate("invoice_ref")} className="w-24">
        {is("invoice_ref") ? (
          <input autoFocus defaultValue={item.invoice_ref ?? ""}
            onBlur={e => onSave(item.id, { invoice_ref: e.target.value || null })}
            onKeyDown={e => { if (e.key === "Enter") { onSave(item.id, { invoice_ref: (e.target as HTMLInputElement).value || null }); onActivate(""); } }}
            className="h-5 w-full rounded border border-border bg-card text-xs px-1 focus:outline-none focus:ring-1 focus:ring-primary font-mono"
          />
        ) : (
          <span className="text-muted-foreground font-mono text-[10px]">{item.invoice_ref ?? "—"}</span>
        )}
      </BoardCell>

      {/* Status */}
      <BoardCell editing={is("status")} onClick={() => onActivate("status")} className="w-24">
        {is("status") ? (
          <InlineSelect
            value={item.status as any}
            options={STATUSES as any}
            onChange={v => onSave(item.id, { status: v })}
            onDone={() => onActivate("")}
          />
        ) : (
          <StatusBadge status={item.status} />
        )}
      </BoardCell>

      {/* Requested Date */}
      <BoardCell editing={is("requested_date")} onClick={() => onActivate("requested_date")} className="w-24">
        {is("requested_date") ? (
          <input autoFocus type="date" defaultValue={item.requested_date}
            onBlur={e => { onSave(item.id, { requested_date: e.target.value || item.requested_date }); onActivate(""); }}
            className="h-5 w-full rounded border border-border bg-card text-xs px-1 focus:outline-none focus:ring-1 focus:ring-primary"
          />
        ) : (
          <span className="text-muted-foreground whitespace-nowrap">{fmtDate(item.requested_date)}</span>
        )}
      </BoardCell>

      {/* Actions */}
      <td className="w-16 px-2 py-1 last:border-r-0">
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity justify-end">
          <button onClick={e => { e.stopPropagation(); onEdit(item); }} title="Edit full form"
            className="rounded p-1 hover:bg-muted transition">
            <Pencil className="h-3 w-3 text-muted-foreground" />
          </button>
          <button onClick={e => { e.stopPropagation(); onDelete(item); }} title="Delete"
            className="rounded p-1 hover:bg-destructive/10 transition">
            <Trash2 className="h-3 w-3 text-destructive/60" />
          </button>
        </div>
      </td>
    </tr>
  );
}

// ─── Add Row ──────────────────────────────────────────────────────────────────

function BoardAddRow({ yachts, onAdd }: { yachts: Yacht[]; onAdd: (f: Partial<ProcurementItem>) => Promise<void> }) {
  const [active, setActive] = useState(false);
  const [form, setForm] = useState({
    request_no: "", yacht_name: "__none", vendor: "", description: "",
    category: "other", quantity: 1, currency: "AED", unit_price: "" as string | number,
    status: "requested", requested_date: new Date().toISOString().slice(0, 10),
  });
  const [saving, setSaving] = useState(false);

  async function commit() {
    if (!form.description.trim() || form.yacht_name === "__none") return;
    setSaving(true);
    const price = form.unit_price !== "" ? parseFloat(form.unit_price as string) : null;
    await onAdd({
      request_no: form.request_no || null,
      yacht_name: form.yacht_name,
      vendor: form.vendor || "—",
      description: form.description,
      category: form.category,
      quantity: form.quantity,
      currency: form.currency,
      unit_price: price,
      total_amount: price != null ? form.quantity * price : null,
      status: form.status,
      requested_date: form.requested_date,
    });
    setForm({ request_no: "", yacht_name: "__none", vendor: "", description: "", category: "other", quantity: 1, currency: "AED", unit_price: "", status: "requested", requested_date: new Date().toISOString().slice(0, 10) });
    setActive(false);
    setSaving(false);
  }

  if (!active) {
    return (
      <tr className="border-b border-border/40">
        <td colSpan={13} className="px-3 py-1.5">
          <button onClick={() => setActive(true)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition">
            <Plus className="h-3 w-3" /> Add item
          </button>
        </td>
      </tr>
    );
  }

  const cell = "border-r border-border/40 px-2 py-1";
  const inp = "h-6 w-full rounded border border-border bg-card text-xs px-1 focus:outline-none focus:ring-1 focus:ring-primary";

  return (
    <tr className="border-b border-border/40 bg-primary/5">
      {/* Ref */}
      <td className={cell}><input placeholder="PO-001" value={form.request_no} onChange={e => setForm(f => ({ ...f, request_no: e.target.value }))} className={cn(inp, "font-mono")} /></td>
      {/* Yacht */}
      <td className={cell}>
        <select value={form.yacht_name} onChange={e => setForm(f => ({ ...f, yacht_name: e.target.value }))} className={inp}>
          <option value="__none">— Yacht —</option>
          {yachts.map(y => <option key={y.id} value={y.vessel_name}>{y.vessel_name}</option>)}
        </select>
      </td>
      {/* Vendor */}
      <td className={cell}><input autoFocus placeholder="Vendor" value={form.vendor} onChange={e => setForm(f => ({ ...f, vendor: e.target.value }))} className={inp} /></td>
      {/* Description */}
      <td className={cell}><input placeholder="Description *" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} onKeyDown={e => { if (e.key === "Enter") commit(); }} className={inp} /></td>
      {/* Category */}
      <td className={cell}>
        <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} className={inp}>
          {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
      </td>
      {/* Qty */}
      <td className={cell}><input type="number" min="1" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: parseInt(e.target.value) || 1 }))} className={cn(inp, "text-center")} /></td>
      {/* Currency */}
      <td className={cell}>
        <select value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))} className={inp}>
          {CURRENCIES.map(c => <option key={c.value} value={c.value}>{c.value}</option>)}
        </select>
      </td>
      {/* Unit Price */}
      <td className={cell}><input type="number" min="0" step="0.01" placeholder="0.00" value={form.unit_price} onChange={e => setForm(f => ({ ...f, unit_price: e.target.value }))} className={cn(inp, "text-right")} /></td>
      {/* Total (auto-calc preview) */}
      <td className={cn(cell, "text-right text-xs text-muted-foreground tabular-nums")}>
        {form.unit_price !== "" && form.quantity ? fmtNum(form.quantity * parseFloat(form.unit_price as string)) : "—"}
      </td>
      {/* Invoice Ref — blank */}
      <td className={cell}></td>
      {/* Status */}
      <td className={cell}>
        <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} className={inp}>
          {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </td>
      {/* Date */}
      <td className={cell}><input type="date" value={form.requested_date} onChange={e => setForm(f => ({ ...f, requested_date: e.target.value }))} className={inp} /></td>
      {/* Commit/cancel */}
      <td className="px-2 py-1">
        <div className="flex items-center gap-1">
          <button onClick={commit} disabled={saving || !form.description || form.yacht_name === "__none"} className="rounded p-1 hover:bg-emerald-500/15 text-emerald-400 transition disabled:opacity-30">
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
          </button>
          <button onClick={() => setActive(false)} className="rounded p-1 hover:bg-muted text-muted-foreground transition">
            <X className="h-3 w-3" />
          </button>
        </div>
      </td>
    </tr>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function ProcurementPage() {
  const [items, setItems] = useState<ProcurementItem[]>([]);
  const [yachts, setYachts] = useState<Yacht[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [yachtFilter, setYachtFilter] = useState("all");
  const [vendorFilter, setVendorFilter] = useState("all");
  const [yearFilter, setYearFilter] = useState("all");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ProcurementItem | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ProcurementItem | null>(null);
  const [boardActive, setBoardActive] = useState<{ row: string; field: string } | null>(null);

  useEffect(() => { void load(); }, []);

  async function load() {
    setLoading(true);
    const [itemsRes, yachtsRes] = await Promise.all([
      (supabase as any).from("procurement_items").select("*").order("requested_date", { ascending: false }),
      (supabase as any).from("yachts").select("id,vessel_name").order("vessel_name"),
    ]);
    if (itemsRes.error) toast.error(itemsRes.error.message);
    else setItems(itemsRes.data as ProcurementItem[]);
    if (!yachtsRes.error) setYachts(yachtsRes.data as Yacht[]);
    setLoading(false);
  }

  // ── Derived filter options ────────────────────────────────────────────────

  const yachtOptions = useMemo(() => [...new Set(items.map(i => i.yacht_name))].sort(), [items]);
  const vendorOptions = useMemo(() => [...new Set(items.map(i => i.vendor))].sort(), [items]);
  const yearOptions = useMemo(() => [...new Set(items.map(i => i.requested_date?.slice(0, 4)).filter(Boolean))].sort().reverse() as string[], [items]);

  const filtered = useMemo(() => {
    let list = items;
    if (statusFilter !== "all") list = list.filter(i => i.status === statusFilter);
    if (categoryFilter !== "all") list = list.filter(i => i.category === categoryFilter);
    if (yachtFilter !== "all") list = list.filter(i => i.yacht_name === yachtFilter);
    if (vendorFilter !== "all") list = list.filter(i => i.vendor === vendorFilter);
    if (yearFilter !== "all") list = list.filter(i => i.requested_date?.startsWith(yearFilter));
    if (search.trim()) {
      const s = search.toLowerCase();
      list = list.filter(i =>
        i.yacht_name.toLowerCase().includes(s) ||
        i.vendor.toLowerCase().includes(s) ||
        i.description.toLowerCase().includes(s) ||
        (i.request_no ?? "").toLowerCase().includes(s) ||
        (i.invoice_ref ?? "").toLowerCase().includes(s),
      );
    }
    return list;
  }, [items, statusFilter, categoryFilter, yachtFilter, vendorFilter, yearFilter, search]);

  const stats = useMemo(() => ({
    total: items.length,
    requested: items.filter(i => i.status === "requested").length,
    ordered: items.filter(i => i.status === "ordered").length,
    received: items.filter(i => i.status === "received").length,
    totalValue: items.reduce((s, i) => s + (i.total_amount ?? 0), 0),
  }), [items]);

  const hasFilters = statusFilter !== "all" || categoryFilter !== "all" || yachtFilter !== "all" || vendorFilter !== "all" || yearFilter !== "all" || search.trim() !== "";

  function clearFilters() {
    setStatusFilter("all"); setCategoryFilter("all"); setYachtFilter("all");
    setVendorFilter("all"); setYearFilter("all"); setSearch("");
  }

  // ── Form dialog ───────────────────────────────────────────────────────────

  function openNew() { setEditing(null); setForm({ ...EMPTY_FORM }); setOpen(true); }

  function openEdit(item: ProcurementItem) {
    setEditing(item);
    const { id, created_at, updated_at, ...rest } = item;
    setForm(rest);
    setOpen(true);
  }

  function setF<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm(prev => {
      const next = { ...prev, [key]: value };
      if (key === "quantity" || key === "unit_price") {
        const qty = key === "quantity" ? (value as number) : prev.quantity;
        const price = key === "unit_price" ? (value as number | null) : prev.unit_price;
        next.total_amount = qty != null && price != null ? qty * price : null;
      }
      return next;
    });
  }

  async function handleSave() {
    if (!form.yacht_name.trim()) { toast.error("Yacht name is required"); return; }
    if (!form.vendor.trim()) { toast.error("Vendor is required"); return; }
    if (!form.description.trim()) { toast.error("Description is required"); return; }
    setBusy(true);
    try {
      const payload = {
        request_no: form.request_no?.trim() || null,
        yacht_name: form.yacht_name.trim(),
        vendor: form.vendor.trim(),
        description: form.description.trim(),
        category: form.category,
        quantity: form.quantity,
        unit_price: form.unit_price,
        total_amount: form.total_amount,
        currency: form.currency || "AED",
        invoice_ref: form.invoice_ref?.trim() || null,
        status: form.status,
        requested_date: form.requested_date,
        ordered_date: form.ordered_date || null,
        received_date: form.received_date || null,
        requested_by: form.requested_by?.trim() || null,
        notes: form.notes?.trim() || null,
        updated_at: new Date().toISOString(),
      };
      if (editing) {
        const { error } = await (supabase as any).from("procurement_items").update(payload).eq("id", editing.id);
        if (error) throw error;
        toast.success("Item updated");
      } else {
        const { error } = await (supabase as any).from("procurement_items").insert([payload]);
        if (error) throw error;
        toast.success("Request created");
      }
      setOpen(false);
      await load();
    } catch (e: any) { toast.error(e.message ?? "Save failed"); }
    finally { setBusy(false); }
  }

  // ── Board save ────────────────────────────────────────────────────────────

  async function boardSave(id: string, patch: Partial<ProcurementItem>) {
    const { error } = await (supabase as any).from("procurement_items").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    setItems(prev => prev.map(i => i.id === id ? { ...i, ...patch } : i));
    setBoardActive(null);
  }

  async function boardAdd(partial: Partial<ProcurementItem>) {
    const payload = { ...EMPTY_FORM, ...partial };
    const { error } = await (supabase as any).from("procurement_items").insert([payload]);
    if (error) { toast.error(error.message); return; }
    await load();
    toast.success("Item added");
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const { error } = await (supabase as any).from("procurement_items").delete().eq("id", deleteTarget.id);
    if (error) toast.error(error.message);
    else { toast.success("Request deleted"); await load(); }
    setDeleteTarget(null);
  }

  const HEADERS = ["Ref", "Yacht", "Vendor", "Description", "Category", "Qty", "Cur", "Unit Price", "Total", "Inv Ref", "Status", "Requested", ""];

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <header className="border-b border-border bg-card/40 px-5 py-3 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShoppingCart className="h-4 w-4 text-primary" />
            <h1 className="font-display text-base font-semibold">Procurement</h1>
            <span className="text-xs text-muted-foreground">({items.length})</span>
          </div>
          <Button onClick={openNew} size="sm" className="h-7 gap-1.5 text-xs px-3">
            <Plus className="h-3.5 w-3.5" /> New Request
          </Button>
        </div>

        {/* Stats strip */}
        <div className="grid grid-cols-5 gap-2">
          {[
            { label: "Total", value: stats.total, color: "text-primary", isNum: false },
            { label: "Requested", value: stats.requested, color: "text-blue-400", isNum: false },
            { label: "Ordered", value: stats.ordered, color: "text-amber-400", isNum: false },
            { label: "Received", value: stats.received, color: "text-emerald-400", isNum: false },
            { label: "Total Value", value: fmtNum(stats.totalValue), color: "text-foreground", isNum: true },
          ].map(s => (
            <div key={s.label} className="rounded-lg border border-border bg-card px-3 py-2">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{s.label}</div>
              <div className={cn("font-display font-bold tabular-nums", s.isNum ? "text-sm" : "text-lg", s.color)}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…" className="h-7 w-40 pl-8 text-xs" />
          </div>
          <Select value={yachtFilter} onValueChange={setYachtFilter}>
            <SelectTrigger className="h-7 w-36 text-xs"><SelectValue placeholder="All Yachts" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Yachts</SelectItem>
              {yachtOptions.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={vendorFilter} onValueChange={setVendorFilter}>
            <SelectTrigger className="h-7 w-32 text-xs"><SelectValue placeholder="All Vendors" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Vendors</SelectItem>
              {vendorOptions.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-7 w-28 text-xs"><SelectValue placeholder="All Statuses" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="h-7 w-32 text-xs"><SelectValue placeholder="All Categories" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={yearFilter} onValueChange={setYearFilter}>
            <SelectTrigger className="h-7 w-20 text-xs"><SelectValue placeholder="Year" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Years</SelectItem>
              {yearOptions.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
          {hasFilters && (
            <button onClick={clearFilters} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition">
              <X className="h-3 w-3" /> Clear
            </button>
          )}
        </div>
      </header>

      {/* Board */}
      <div className="flex-1 overflow-auto p-4">
        {loading ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="rounded-lg border border-border overflow-x-auto bg-card">
            {/* Hint bar */}
            <div className="px-3 py-1.5 border-b border-border/60 flex items-center gap-2 bg-muted/20">
              <span className="text-[10px] text-muted-foreground">
                Click any cell to edit inline · Enter to confirm · Add rows at the bottom
              </span>
              {filtered.length === 0 && (
                <span className="ml-auto text-[10px] text-muted-foreground italic">
                  {hasFilters ? "No items match filters" : "No items yet — add one below ↓"}
                </span>
              )}
            </div>
            <table className="w-full min-w-[1200px]">
              <thead className="bg-muted/20 border-b border-border/60">
                <tr>
                  {HEADERS.map(h => (
                    <th key={h} className="px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap border-r border-border/40 last:border-r-0">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(item => (
                  <BoardRow
                    key={item.id}
                    item={item}
                    yachts={yachts}
                    active={boardActive?.row === item.id ? boardActive : null}
                    onActivate={field => field ? setBoardActive({ row: item.id, field }) : setBoardActive(null)}
                    onSave={boardSave}
                    onDelete={i => setDeleteTarget(i)}
                    onEdit={openEdit}
                  />
                ))}
                <BoardAddRow yachts={yachts} onAdd={boardAdd} />
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Full Form Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm">
              <ShoppingCart className="h-4 w-4 text-primary" />
              {editing ? `Edit — ${editing.description.slice(0, 40)}` : "New Procurement Request"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Request No.</Label>
                <Input value={form.request_no ?? ""} onChange={e => setF("request_no", e.target.value || null)} placeholder="PO-2026-001" />
              </div>
              <div className="space-y-1.5">
                <Label>Requested Date</Label>
                <Input type="date" value={form.requested_date} onChange={e => setF("requested_date", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Yacht <span className="text-destructive">*</span></Label>
                <Select value={form.yacht_name || "__none"} onValueChange={v => setF("yacht_name", v === "__none" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="Select yacht…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">— Select —</SelectItem>
                    {yachts.map(y => <SelectItem key={y.id} value={y.vessel_name}>{y.vessel_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Vendor <span className="text-destructive">*</span></Label>
                <Input value={form.vendor} onChange={e => setF("vendor", e.target.value)} placeholder="e.g. Amazon, Carrefour" />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>Description <span className="text-destructive">*</span></Label>
                <Input value={form.description} onChange={e => setF("description", e.target.value)} placeholder="What was ordered…" />
              </div>
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Select value={form.category} onValueChange={v => setF("category", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={v => setF("status", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Quantity</Label>
                <Input type="number" min="1" value={form.quantity} onChange={e => setF("quantity", parseInt(e.target.value) || 1)} />
              </div>
              <div className="space-y-1.5">
                <Label>Currency</Label>
                <Select value={form.currency} onValueChange={v => setF("currency", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CURRENCIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label} — {c.value === "AED" ? "UAE Dirham" : c.value === "USD" ? "US Dollar" : c.value === "GBP" ? "British Pound" : c.value === "EUR" ? "Euro" : "S. African Rand"}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Unit Price ({form.currency || "AED"})</Label>
                <Input type="number" min="0" step="0.01" value={form.unit_price ?? ""} onChange={e => setF("unit_price", e.target.value ? parseFloat(e.target.value) : null)} placeholder="0.00" />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>Total Amount ({form.currency || "AED"})</Label>
                <Input type="number" min="0" step="0.01" value={form.total_amount ?? ""} onChange={e => setF("total_amount", e.target.value ? parseFloat(e.target.value) : null)} placeholder="Auto-calculated from Qty × Unit Price" />
                <p className="text-[10px] text-muted-foreground">Auto-calculated. Override manually if needed.</p>
              </div>
              <div className="space-y-1.5">
                <Label>Invoice Ref</Label>
                <Input value={form.invoice_ref ?? ""} onChange={e => setF("invoice_ref", e.target.value || null)} placeholder="INV-2026-042" />
              </div>
              <div className="space-y-1.5">
                <Label>Requested By</Label>
                <Input value={form.requested_by ?? ""} onChange={e => setF("requested_by", e.target.value || null)} placeholder="Name or team" />
              </div>
              <div className="space-y-1.5">
                <Label>Ordered Date</Label>
                <Input type="date" value={form.ordered_date ?? ""} onChange={e => setF("ordered_date", e.target.value || null)} />
              </div>
              <div className="space-y-1.5">
                <Label>Received Date</Label>
                <Input type="date" value={form.received_date ?? ""} onChange={e => setF("received_date", e.target.value || null)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea rows={2} value={form.notes ?? ""} onChange={e => setF("notes", e.target.value || null)} placeholder="Any additional notes…" />
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button variant="outline" onClick={() => setOpen(false)} disabled={busy} size="sm">Cancel</Button>
              <Button onClick={handleSave} disabled={busy} size="sm" className="gap-1.5">
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                {editing ? "Save Changes" : "Create Request"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={o => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete request?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.request_no && <><strong>{deleteTarget.request_no}</strong> — </>}
              <strong>{deleteTarget?.description?.slice(0, 60)}</strong> for <strong>{deleteTarget?.yacht_name}</strong> will be permanently removed. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

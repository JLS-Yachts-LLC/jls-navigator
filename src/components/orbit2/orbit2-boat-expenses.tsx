/**
 * Orbit 2 — a managed boat's Expenses tab (client request, 12 Oct 2026).
 *
 * Every cost spent on the boat, logged by the team so the owner can see exactly
 * what was spent and why: the area of the boat (Engine Room / Interior /
 * Exterior / Bridge), the part, the date, the cost and what it was for, with
 * receipts attached and, where it belongs to one, the Job Ref of the job.
 *
 * Rows live in orbit2_boat_expenses; receipts in orbit2_boat_expense_files
 * (migration 20261012090000). The board loads its own data — nothing else on
 * the boat page needs it.
 */
import { useEffect, useMemo, useState } from "react";
import { Download, Loader2, Paperclip, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { errorMessage } from "@/lib/error-message";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { SignedAnchor } from "@/components/ui/signed-file";
import { suggestionsFor, type Orbit2Boat, type Orbit2BoatTask } from "./orbit2-data";
import { Field, inputCls, Typeahead, FileSlot, type UploadedFile } from "./orbit2-fields";

const sb = supabase as any;

export const BOAT_EXPENSE_CATEGORIES = ["Engine Room", "Interior", "Exterior", "Bridge"] as const;
export type BoatExpenseCategory = (typeof BOAT_EXPENSE_CATEGORIES)[number];
const CURRENCIES = ["AED", "USD", "EUR", "GBP"] as const;
/** The client's column order (12 Oct 2026 design); the last is the edit / delete buttons. */
const EXPENSE_COLUMNS = ["Category", "Part Type", "Date", "Cost", "Details", "Document", "Job Ref", ""];

export type Orbit2BoatExpense = {
  id: string;
  boat_id: string;
  category: BoatExpenseCategory;
  part_type: string | null;
  expense_date: string;
  cost: number;
  currency: string;
  details: string | null;
  boat_task_id: string | null;
  created_at: string;
  updated_at: string;
};
type ExpenseFile = UploadedFile & { expense_id: string };

const money = (n: number, currency: string) =>
  `${currency} ${Number(n).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const ukDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB");

/** Totals per currency — mixed currencies are never added together. */
function totals(rows: Orbit2BoatExpense[]): string {
  const by = new Map<string, number>();
  for (const r of rows) by.set(r.currency, (by.get(r.currency) ?? 0) + Number(r.cost));
  return [...by].map(([c, n]) => money(n, c)).join(" · ") || money(0, "AED");
}

export function BoatExpensesBoard({ boat, tasks }: { boat: Orbit2Boat; tasks: Orbit2BoatTask[] }) {
  const [expenses, setExpenses] = useState<Orbit2BoatExpense[]>([]);
  const [files, setFiles] = useState<ExpenseFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<BoatExpenseCategory | "all">("all");
  // null = closed · "new" = adding · a row = viewing / editing that expense
  const [editor, setEditor] = useState<null | "new" | Orbit2BoatExpense>(null);

  async function load() {
    const { data, error } = await sb.from("orbit2_boat_expenses").select("*")
      .eq("boat_id", boat.id).order("expense_date", { ascending: false }).order("created_at", { ascending: false });
    if (error) { toast.error(errorMessage(error, "Could not load expenses")); setLoading(false); return; }
    const rows = (data ?? []) as Orbit2BoatExpense[];
    const ids = rows.map((r) => r.id);
    const f = ids.length
      ? await sb.from("orbit2_boat_expense_files").select("id, expense_id, file_name, storage_ref").in("expense_id", ids).order("created_at")
      : { data: [] };
    setExpenses(rows);
    setFiles((f.data ?? []) as ExpenseFile[]);
    setLoading(false);
  }
  useEffect(() => { setLoading(true); void load(); }, [boat.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const jobNo = useMemo(() => new Map(tasks.map((t) => [t.id, t.job_no ?? ""])), [tasks]);
  const filesFor = (id: string) => files.filter((f) => f.expense_id === id);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return expenses.filter((e) => {
      if (category !== "all" && e.category !== category) return false;
      if (!q) return true;
      return [e.category, e.part_type, e.details, jobNo.get(e.boat_task_id ?? ""), String(e.cost), ukDate(e.expense_date)]
        .some((v) => (v ?? "").toLowerCase().includes(q));
    });
  }, [expenses, category, query, jobNo]);

  async function remove(row: Orbit2BoatExpense) {
    if (!confirm(`Delete this ${row.category} expense of ${money(row.cost, row.currency)}? Its receipts go with it.`)) return;
    const { error } = await sb.from("orbit2_boat_expenses").delete().eq("id", row.id);
    if (error) { toast.error(errorMessage(error, "Could not delete")); return; }
    toast.success("Expense deleted");
    await load();
  }

  /** The owner-ready spreadsheet: every expense shown, with its Job Ref and receipt names. */
  function download() {
    const head = ["Category", "Part Type", "Date", "Currency", "Cost", "Details", "Job Ref", "Documents"];
    const rows = shown.map((e) => [
      e.category, e.part_type ?? "", ukDate(e.expense_date), e.currency, Number(e.cost).toFixed(2),
      e.details ?? "", jobNo.get(e.boat_task_id ?? "") ?? "", filesFor(e.id).map((f) => f.file_name).join("; "),
    ]);
    const csv = [head, ...rows]
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${boat.name.replace(/[^\w-]+/g, "_")}-expenses-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
        <span className="text-[15px] text-muted-foreground">
          {shown.length} expense{shown.length === 1 ? "" : "s"} · <span className="font-semibold text-foreground">{totals(shown)}</span>
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search" aria-label="Search expenses"
              className="h-9 w-40 rounded-md border border-border bg-background pl-8 pr-2 text-[14px] outline-none focus:border-primary" />
          </div>
          <button onClick={download} disabled={!shown.length} title="Download these expenses as a spreadsheet"
            className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-[15px] font-medium hover:bg-accent disabled:opacity-50">
            <Download className="h-4 w-4" /> Download
          </button>
          <button onClick={() => setEditor("new")}
            className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-[15px] font-medium text-primary-foreground hover:opacity-90">
            <Plus className="h-4 w-4" /> Add
          </button>
        </div>
      </div>

      {/* Category filter, each with its running total. */}
      <div className="flex flex-wrap gap-1 px-4 pb-2.5">
        {(["all", ...BOAT_EXPENSE_CATEGORIES] as const).map((c) => {
          const rows = c === "all" ? expenses : expenses.filter((e) => e.category === c);
          return (
            <button key={c} onClick={() => setCategory(c)}
              className={cn("rounded-full border px-3 py-1 text-[14px] font-medium transition",
                category === c ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground hover:bg-accent")}>
              {c === "all" ? "All" : c}{rows.length ? ` · ${totals(rows)}` : ""}
            </button>
          );
        })}
      </div>

      {/* The column headings always show, as in the client's design — even
          before the first expense is logged. */}
      <div className="overflow-x-auto">
          <table className="w-full text-[14px]">
            <thead>
              <tr className="border-y border-border/60 bg-muted/10">
                {EXPENSE_COLUMNS.map((c) => (
                  <th key={c} className={cn("whitespace-nowrap px-3 py-2 text-left font-semibold text-muted-foreground", c === "Cost" && "text-right")}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {(loading || shown.length === 0) && (
                <tr>
                  <td colSpan={EXPENSE_COLUMNS.length} className="px-4 py-8 text-center text-[15px] text-muted-foreground">
                    {loading
                      ? <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                      : expenses.length ? "No expenses match." : "No expenses logged yet — press Add to log the first one."}
                  </td>
                </tr>
              )}
              {!loading && shown.map((e) => {
                const docs = filesFor(e.id);
                return (
                  <tr key={e.id} className="hover:bg-muted/10">
                    <td className="whitespace-nowrap px-3 py-1.5">
                      <button onClick={() => setEditor(e)} className="text-left font-medium text-primary hover:underline">{e.category}</button>
                    </td>
                    <td className="px-3 py-1.5 text-muted-foreground">{e.part_type || "—"}</td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-muted-foreground">{ukDate(e.expense_date)}</td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-right font-medium tabular-nums">{money(e.cost, e.currency)}</td>
                    <td className="max-w-[14rem] px-3 py-1.5 text-muted-foreground"><span className="line-clamp-2">{e.details || "—"}</span></td>
                    <td className="px-3 py-1.5">
                      {docs.length === 0 ? (
                        <button onClick={() => setEditor(e)} className="text-[13px] text-primary hover:underline">Attach</button>
                      ) : (
                        <div className="flex flex-col gap-0.5">
                          {docs.map((d) => (
                            <SignedAnchor key={d.id} stored={d.storage_ref} title={d.file_name}
                              className="flex max-w-[10rem] items-center gap-1 truncate text-[13px] text-primary hover:underline">
                              <Paperclip className="h-3 w-3 shrink-0" /> <span className="truncate">{d.file_name}</span>
                            </SignedAnchor>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-muted-foreground">{jobNo.get(e.boat_task_id ?? "") || "—"}</td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-right">
                      <button onClick={() => setEditor(e)} title="View / edit" className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => void remove(e)} title="Delete" className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
      </div>

      {editor && (
        <ExpenseEditor boat={boat} tasks={tasks} existing={editor === "new" ? null : editor}
          existingFiles={editor === "new" ? [] : filesFor(editor.id)}
          partTypes={suggestionsFor(expenses.map((e) => e.part_type))}
          onClose={() => setEditor(null)} reload={load} />
      )}
    </div>
  );
}

// ── One expense — add, view, edit ────────────────────────────────────────────

type ExpenseForm = {
  category: BoatExpenseCategory; part_type: string; date: string; cost: string; currency: string; details: string; task: string;
};
const today = () => new Date().toISOString().slice(0, 10);

function ExpenseEditor({ boat, tasks, existing, existingFiles, partTypes, onClose, reload }: {
  boat: Orbit2Boat;
  tasks: Orbit2BoatTask[];
  existing: Orbit2BoatExpense | null;
  existingFiles: ExpenseFile[];
  partTypes: string[];
  onClose: () => void;
  reload: () => Promise<void>;
}) {
  const { user } = useAuth();
  const [form, setForm] = useState<ExpenseForm>(existing ? {
    category: existing.category, part_type: existing.part_type ?? "", date: existing.expense_date,
    cost: String(existing.cost), currency: existing.currency, details: existing.details ?? "", task: existing.boat_task_id ?? "",
  } : { category: "Engine Room", part_type: "", date: today(), cost: "", currency: "AED", details: "", task: "" });
  // Receipts: for an existing expense they save as they're attached; for a new
  // one they're held here (already uploaded) and recorded once the expense exists.
  const [docs, setDocs] = useState<UploadedFile[]>(existingFiles);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof ExpenseForm>(k: K, v: ExpenseForm[K]) => setForm((f) => ({ ...f, [k]: v }));

  const jobs = useMemo(() => tasks.filter((t) => t.job_no).sort((a, b) => (b.job_no ?? "").localeCompare(a.job_no ?? "")), [tasks]);

  async function attach(file: File, ref: string) {
    if (!existing) { setDocs((d) => [...d, { id: `new-${crypto.randomUUID()}`, file_name: file.name, storage_ref: ref }]); return; }
    const { data, error } = await sb.from("orbit2_boat_expense_files")
      .insert({ expense_id: existing.id, file_name: file.name, storage_ref: ref, uploaded_by: user?.id ?? null })
      .select("id, file_name, storage_ref").single();
    if (error) { toast.error(errorMessage(error, "Could not attach")); return; }
    setDocs((d) => [...d, data as UploadedFile]);
    await reload();
  }

  async function detach(f: UploadedFile) {
    if (f.id.startsWith("new-")) { setDocs((d) => d.filter((x) => x.id !== f.id)); return; }
    const { error } = await sb.from("orbit2_boat_expense_files").delete().eq("id", f.id);
    if (error) { toast.error(errorMessage(error, "Could not remove")); return; }
    setDocs((d) => d.filter((x) => x.id !== f.id));
    await reload();
  }

  async function save() {
    const cost = Number(form.cost.replace(/,/g, ""));
    if (form.cost.trim() === "" || !Number.isFinite(cost) || cost < 0) { toast.error("Enter the cost."); return; }
    if (!form.date) { toast.error("Enter the date."); return; }
    setSaving(true);
    try {
      const values = {
        category: form.category, part_type: form.part_type.trim() || null, expense_date: form.date,
        cost: Math.round(cost * 100) / 100, currency: form.currency, details: form.details.trim() || null,
        boat_task_id: form.task || null,
      };
      if (existing) {
        const { error } = await sb.from("orbit2_boat_expenses").update(values).eq("id", existing.id);
        if (error) throw error;
      } else {
        const { data, error } = await sb.from("orbit2_boat_expenses")
          .insert({ ...values, boat_id: boat.id, created_by: user?.id ?? null }).select("id").single();
        if (error) throw error;
        if (docs.length) {
          const { error: fe } = await sb.from("orbit2_boat_expense_files").insert(docs.map((d) => ({
            expense_id: data.id, file_name: d.file_name, storage_ref: d.storage_ref, uploaded_by: user?.id ?? null,
          })));
          if (fe) toast.error(errorMessage(fe, "The expense saved, but its documents did not — attach them again"));
        }
      }
      toast.success(`${form.category} expense ${existing ? "saved" : "added"} — ${money(values.cost, values.currency)}`);
      await reload();
      onClose();
    } catch (e) {
      toast.error(errorMessage(e, "Could not save the expense"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-xl border border-border bg-card shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <span className="text-[15px] font-semibold text-muted-foreground">{existing ? "Expense" : "New Expense"} — {boat.name}</span>
          <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-accent"><X className="h-4 w-4" /></button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-auto p-5">
          <Field label="Category">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {BOAT_EXPENSE_CATEGORIES.map((c) => (
                <button key={c} type="button" onClick={() => set("category", c)}
                  className={cn("rounded-md border px-2 py-2 text-[15px] font-medium",
                    form.category === c ? "border-primary bg-primary/15 text-primary" : "border-border hover:bg-accent")}>
                  {c}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Part Type" hint="e.g. Impeller, Fuel filter, Upholstery, Navigation light">
            <Typeahead value={form.part_type} onChange={(v) => set("part_type", v)} options={partTypes} />
          </Field>
          <div className="grid grid-cols-2 gap-2.5">
            <Field label="Date"><input className={inputCls} type="date" value={form.date} onChange={(e) => set("date", e.target.value)} /></Field>
            <Field label="Cost">
              <div className="flex gap-1.5">
                <select className={cn(inputCls, "w-[5.5rem] shrink-0 px-2")} value={form.currency} onChange={(e) => set("currency", e.target.value)} aria-label="Currency">
                  {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <input className={inputCls} inputMode="decimal" placeholder="0.00" value={form.cost} onChange={(e) => set("cost", e.target.value)} />
              </div>
            </Field>
          </div>
          <Field label="Details" hint="What it was for — this is what the owner reads">
            <textarea className={cn(inputCls, "min-h-[72px] resize-y")} value={form.details} onChange={(e) => set("details", e.target.value)} />
          </Field>
          <Field label="Job Ref">
            <select className={inputCls} value={form.task} onChange={(e) => set("task", e.target.value)}>
              <option value="">Not linked to a job</option>
              {jobs.map((t) => <option key={t.id} value={t.id}>{t.job_no} — {t.title.slice(0, 60)}</option>)}
            </select>
          </Field>
          <FileSlot label="Receipts / Documents" files={docs} onUpload={attach} onRemove={(f) => void detach(f)} />
        </div>

        <div className="flex justify-between gap-2 border-t border-border px-5 py-3">
          <span />
          <div className="flex gap-2">
            <button onClick={onClose} disabled={saving} className="rounded-md bg-[#E05252] px-5 py-2 text-[15px] font-semibold text-white hover:opacity-90 disabled:opacity-50">Cancel</button>
            <button onClick={() => void save()} disabled={saving}
              className="flex items-center gap-1.5 rounded-md bg-[#3FA76A] px-5 py-2 text-[15px] font-semibold text-white hover:opacity-90 disabled:opacity-50">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} {existing ? "Save" : "Submit"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

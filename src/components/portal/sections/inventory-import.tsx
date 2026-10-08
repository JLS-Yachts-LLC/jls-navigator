/**
 * Inventory import — a CSV file, or rows pasted from Excel, into the register.
 *
 *   1. Get the template (or export the register), fill it in Excel
 *   2. Choose the file / paste the rows
 *   3. Preview: every row with its problems marked, then add them — or update
 *      the items already on the register (same serial, or same name + place)
 *
 * The server checks every row again and saves nothing if one is wrong, so rows
 * with problems are left out here before sending.
 */
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { AlertTriangle, CheckCircle2, Download, FileUp, Loader2, X } from "lucide-react";
import { portalFetch } from "@/lib/portal/portal-fetch";
import { INV_COLUMNS, downloadText, sheetToItems, templateCsv, type ImportRow } from "@/lib/portal/inventory";

export function InventoryImportDialog({ initialRows, showValue, onClose, onDone }: {
  /** Rows already read (pasted into the grid); otherwise start at choosing a file. */
  initialRows?: ImportRow[] | null;
  showValue: boolean;
  onClose: () => void;
  onDone: (result: { added: number; updated: number }) => void;
}) {
  const [rows, setRows] = useState<ImportRow[] | null>(initialRows ?? null);
  const [unknown, setUnknown] = useState<string[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [pasted, setPasted] = useState("");
  const [mode, setMode] = useState<"add" | "update">("add");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cols = useMemo(() => INV_COLUMNS.filter((c) => showValue || !c.money), [showValue]);

  const read = (text: string, name: string | null) => {
    const { rows: r, unknown: u } = sheetToItems(text);
    if (!r.length) { setError("No rows found — the first row should be the headings, with one item per row under it."); return; }
    if (!r.some((x) => x.values.name)) { setError("Couldn't find an Item column. Use the template's headings (Item, Category, Department…)."); return; }
    setRows(r); setUnknown(u); setFileName(name); setError(null);
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (/\.xlsx?$/i.test(f.name)) { setError("That's an Excel workbook — in Excel choose File › Save As › CSV, then import the CSV. (Or copy the rows and paste them below.)"); return; }
    if (f.size > 5 * 1024 * 1024) { setError("That file is too big — import up to 2,000 items at a time."); return; }
    read(await f.text(), f.name);
  };

  const good = rows?.filter((r) => !r.errors.length) ?? [];
  const bad = rows?.filter((r) => r.errors.length) ?? [];
  const usedCols = useMemo(() => cols.filter((c) => rows?.some((r) => r.values[c.key] != null)), [cols, rows]);

  const submit = async () => {
    if (!good.length) return;
    setBusy(true); setError(null);
    try {
      const payload = good.map((r) => {
        const v: Record<string, unknown> = { ...r.values, _line: r.line };
        if (!showValue) { delete v.purchase_price; delete v.currency; }
        return v;
      });
      // Straight through portalFetch so row-level errors come back too.
      const res = await portalFetch(`/api/portal/onboard?kind=inventory_item&action=bulk`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: payload, mode }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const lines = Array.isArray(body?.errors) ? body.errors.slice(0, 5).map((e: any) => `Row ${e.row}: ${e.error}`).join(" · ") : "";
        throw new Error([body?.error ?? "Could not import.", lines].filter(Boolean).join(" — "));
      }
      onDone({ added: body.added ?? 0, updated: body.updated ?? 0 });
    } catch (e) { setError(e instanceof Error ? e.message : "Could not import."); }
    finally { setBusy(false); }
  };

  const cell = (r: ImportRow, key: string) => {
    const c = INV_COLUMNS.find((x) => x.key === key)!;
    const v = r.values[c.key];
    if (v == null) return "";
    if (c.type === "select") return c.options?.find(([k]) => k === v)?.[1] ?? String(v);
    return String(v);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center"
         onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="flex max-h-[94vh] w-full max-w-4xl flex-col rounded-t-3xl border border-border bg-card sm:rounded-3xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4 sm:px-6">
          <div>
            <h2 className="text-lg font-bold">Import inventory</h2>
            <p className="text-xs text-muted-foreground">{rows ? `${fileName ?? "Pasted rows"} · ${rows.length} row${rows.length === 1 ? "" : "s"}` : "From a CSV file, or rows copied from Excel"}</p>
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close" className="flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 sm:px-6">
          {!rows ? (
            <div className="space-y-5">
              <ol className="grid gap-3 sm:grid-cols-3">
                <li className="rounded-2xl border border-border bg-background/30 p-4">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-primary">1 · Template</div>
                  <p className="mt-1 text-sm text-muted-foreground">One item per row. Only <b className="text-foreground">Item</b> is required — leave any column blank.</p>
                  <button type="button" onClick={() => downloadText("Inventory import template.csv", templateCsv(showValue))}
                          className="mt-3 inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-border px-3 text-xs font-medium transition hover:border-primary/50">
                    <Download className="h-3.5 w-3.5" /> Download template
                  </button>
                </li>
                <li className="rounded-2xl border border-border bg-background/30 p-4">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-primary">2 · Fill it in</div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    In Excel or Google Sheets. Department: {INV_COLUMNS.find((c) => c.key === "department")!.options!.map(([, l]) => l).join(", ")}.
                    Condition: New, Good, Fair, Poor, Damaged, Missing. Dates like 14/03/2025.
                  </p>
                </li>
                <li className="rounded-2xl border border-border bg-background/30 p-4">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-primary">3 · Import</div>
                  <p className="mt-1 text-sm text-muted-foreground">Save as CSV and choose it. You'll see every row before anything is added.</p>
                  <label className="mt-3 inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-xl bg-primary px-3 text-xs font-semibold text-primary-foreground">
                    <FileUp className="h-3.5 w-3.5" /> Choose CSV file
                    <input type="file" accept=".csv,.tsv,.txt,text/csv,.xls,.xlsx" className="sr-only" onChange={(e) => void onFile(e)} />
                  </label>
                </li>
              </ol>
              <div>
                <label htmlFor="inv-paste" className="mb-1.5 block text-xs font-medium text-muted-foreground">…or paste rows straight from a spreadsheet (include the heading row)</label>
                <textarea id="inv-paste" value={pasted} onChange={(e) => setPasted(e.target.value)} rows={6}
                          placeholder={cols.slice(0, 6).map((c) => c.label).join("\t") + "\n" + cols.slice(0, 6).map((c) => c.example).join("\t")}
                          className="w-full rounded-xl border border-border bg-background/50 px-3 py-2 font-mono text-xs outline-none focus:border-primary/60" />
                <button type="button" disabled={!pasted.trim()} onClick={() => read(pasted, null)}
                        className="mt-2 inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-border px-3 text-xs font-medium transition hover:border-primary/50 disabled:opacity-50">
                  Preview pasted rows
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-3 py-1 text-emerald-300"><CheckCircle2 className="h-3.5 w-3.5" /> {good.length} ready</span>
                {bad.length > 0 && <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/15 px-3 py-1 text-red-300"><AlertTriangle className="h-3.5 w-3.5" /> {bad.length} with problems — left out</span>}
                <button type="button" onClick={() => { setRows(null); setFileName(null); setUnknown([]); }} className="ml-auto text-xs text-muted-foreground hover:text-foreground">Choose another file</button>
              </div>
              {unknown.length > 0 && (
                <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                  Not imported — columns not recognised: {unknown.join(", ")}. Rename them to the template's headings if they should be.
                </p>
              )}
              <div className="max-h-[42vh] overflow-auto rounded-xl border border-border">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-card text-left text-[10px] uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="border-b border-border px-2 py-2">Row</th>
                      {usedCols.map((c) => <th key={c.key} className="whitespace-nowrap border-b border-border px-2 py-2">{c.label}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 500).map((r) => (
                      <tr key={r.line} className={cn("border-b border-border/40", r.errors.length && "bg-red-500/10")}>
                        <td className="whitespace-nowrap px-2 py-1.5 text-muted-foreground">{r.line}</td>
                        {usedCols.map((c) => <td key={c.key} className="max-w-[200px] truncate px-2 py-1.5">{cell(r, c.key)}</td>)}
                        {r.errors.length > 0 && <td className="whitespace-nowrap px-2 py-1.5 text-red-300">{r.errors.join(" · ")}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {rows.length > 500 && <div className="px-3 py-2 text-[11px] text-muted-foreground">Showing the first 500 of {rows.length} rows — all of them will be imported.</div>}
              </div>
              <fieldset className="space-y-2 text-sm">
                <label className="flex items-start gap-2">
                  <input type="radio" name="inv-mode" checked={mode === "add"} onChange={() => setMode("add")} className="mt-1" />
                  <span><b>Add as new items</b><span className="block text-xs text-muted-foreground">Every row becomes a new item on the register.</span></span>
                </label>
                <label className="flex items-start gap-2">
                  <input type="radio" name="inv-mode" checked={mode === "update"} onChange={() => setMode("update")} className="mt-1" />
                  <span><b>Update what's already there, add the rest</b><span className="block text-xs text-muted-foreground">A row with the same serial number — or the same item name and location — updates that item; blank cells leave its values alone. Use this after exporting, editing in Excel and importing back.</span></span>
                </label>
              </fieldset>
            </div>
          )}
          {error && <div className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-red-300">{error}</div>}
        </div>

        {rows && (
          <div className="flex gap-2 border-t border-border px-5 py-4 sm:px-6">
            <button type="button" onClick={onClose} disabled={busy} className="min-h-11 rounded-xl border border-border px-4 text-sm font-medium">Cancel</button>
            <button type="button" onClick={() => void submit()} disabled={busy || !good.length}
                    className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:brightness-110 disabled:opacity-50">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              {mode === "add" ? `Add ${good.length} item${good.length === 1 ? "" : "s"}` : `Import ${good.length} row${good.length === 1 ? "" : "s"}`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

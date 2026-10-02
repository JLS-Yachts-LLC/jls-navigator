/**
 * SIM Cards — "Import from Excel". Drop the provider's sheet (or our template),
 * see every row checked before anything is written, then import the good ones.
 * Duplicates of SIMs already in the register are skipped by default; rows with
 * blocking problems are listed with the reason so the sheet can be fixed and
 * dropped again.
 */
import { useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Loader2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/error-message";
import {
  SIM_COLUMNS, buildTemplateXlsx, mapHeaders, readSpreadsheet, validateRows,
  type ExistingSim, type ParsedSimRow, type SheetGrid, type YachtOpt,
} from "@/lib/yacht-it/sim-import";

const db = supabase as any;

export function SimImportDialog({ yachts, existing, onClose, onImported }: {
  yachts: YachtOpt[]; existing: ExistingSim[]; onClose: () => void; onImported: (count: number) => void;
}) {
  const [grid, setGrid] = useState<SheetGrid | null>(null);
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<ParsedSimRow[]>([]);
  const [unknown, setUnknown] = useState<string[]>([]);
  const [missing, setMissing] = useState<string[]>([]);
  const [includeDupes, setIncludeDupes] = useState(false);
  const [busy, setBusy] = useState<"read" | "import" | "template" | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function pick(file: File | undefined) {
    if (!file) return;
    setBusy("read");
    try {
      const g = await readSpreadsheet(file);
      const { map, unknown, missing } = mapHeaders(g.headers);
      if (map.size === 0) throw new Error("None of the column headers were recognised — download the template to see the expected names.");
      setGrid(g); setFileName(file.name); setUnknown(unknown); setMissing(missing);
      setRows(validateRows(g, map, yachts, existing));
    } catch (e) {
      toast.error(errorMessage(e, "Could not read the file"));
    } finally {
      setBusy(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const summary = useMemo(() => {
    const ok = rows.filter((r) => r.record && !r.duplicateOf);
    const dupes = rows.filter((r) => r.record && r.duplicateOf);
    const bad = rows.filter((r) => !r.record);
    const warned = rows.filter((r) => r.record && r.warnings.length);
    return { ok, dupes, bad, warned, toImport: includeDupes ? [...ok, ...dupes] : ok };
  }, [rows, includeDupes]);

  async function importRows() {
    if (!summary.toImport.length) return;
    setBusy("import");
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const payload = summary.toImport.map((r) => ({ ...r.record!, created_by: user?.id ?? null }));
      // Chunked so a 500-row sheet does not go up in one request.
      let done = 0;
      for (let i = 0; i < payload.length; i += 100) {
        const { error } = await db.from("sim_cards").insert(payload.slice(i, i + 100));
        if (error) throw new Error(error.message);
        done += Math.min(100, payload.length - i);
      }
      toast.success(`${done} SIM${done === 1 ? "" : "s"} imported`);
      onImported(done);
    } catch (e) {
      toast.error(errorMessage(e, "Import failed"));
    } finally {
      setBusy(null);
    }
  }

  async function downloadTemplate() {
    setBusy("template");
    try {
      const blob = await buildTemplateXlsx();
      const url = URL.createObjectURL(blob);
      const a = Object.assign(document.createElement("a"), { href: url, download: "SIM Cards import template.xlsx" });
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e) {
      toast.error(errorMessage(e, "Could not build the template"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col rounded-2xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <div>
            <h3 className="font-semibold">Import SIM cards from Excel</h3>
            <p className="text-xs text-muted-foreground">Excel (.xlsx) or CSV · first worksheet · one SIM per row</p>
          </div>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
          {/* Step 1 — the file */}
          <div
            onDragEnter={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragOver={(e) => e.preventDefault()}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); void pick(e.dataTransfer.files?.[0]); }}
            className={cn("flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed px-4 py-3 transition",
              dragOver ? "border-primary bg-primary/10" : "border-border bg-background/40")}>
            <div className="flex items-center gap-3">
              <FileSpreadsheet className="h-6 w-6 text-muted-foreground" />
              <div>
                <div className="text-sm font-medium">{fileName || "Drop the spreadsheet here, or choose a file"}</div>
                <div className="text-xs text-muted-foreground">
                  {grid ? `${rows.length} row${rows.length === 1 ? "" : "s"}${grid.sheetName ? ` · sheet "${grid.sheetName}"` : ""}` : "Columns are matched by their header names — the provider's own export usually works as-is."}
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => void downloadTemplate()} disabled={busy !== null}>
                {busy === "template" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />} Template
              </Button>
              <Button size="sm" className="gap-1.5" onClick={() => inputRef.current?.click()} disabled={busy !== null}>
                {busy === "read" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />} {grid ? "Choose another" : "Choose file"}
              </Button>
              <input ref={inputRef} type="file" className="hidden"
                accept=".xlsx,.xlsm,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                onChange={(e) => void pick(e.target.files?.[0])} />
            </div>
          </div>

          {!grid && (
            <div className="rounded-xl border border-border bg-background/30 p-4 text-sm">
              <div className="mb-2 font-medium">Columns we read</div>
              <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
                {SIM_COLUMNS.map((c) => (
                  <div key={c.key} className="flex items-baseline justify-between gap-2 text-xs">
                    <span className={cn("font-medium", c.required && "text-foreground")}>{c.label}{c.required && <span className="text-destructive"> *</span>}</span>
                    <span className="truncate text-muted-foreground">{c.hint}</span>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                A row needs a Provider and either a Phone Number or an ICCID. Yachts are matched by their exact vessel name in Polaris;
                anything else is left unassigned with the name kept in the notes. SIMs already in the register (same number or ICCID) are skipped.
              </p>
            </div>
          )}

          {grid && (
            <>
              {/* Header issues */}
              {(missing.length > 0 || unknown.length > 0) && (
                <div className="space-y-1 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs">
                  {missing.length > 0 && <div className="flex items-center gap-1.5 font-medium text-warning"><AlertTriangle className="h-3.5 w-3.5" /> Missing column{missing.length > 1 ? "s" : ""}: {missing.join(", ")}</div>}
                  {unknown.length > 0 && <div className="text-muted-foreground">Ignored column{unknown.length > 1 ? "s" : ""} (not recognised): {unknown.join(", ")}</div>}
                </div>
              )}

              {/* Summary */}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Stat label="Ready to import" value={summary.ok.length} tone="text-success" />
                <Stat label="Already in register" value={summary.dupes.length} tone={summary.dupes.length ? "text-warning" : undefined} />
                <Stat label="With warnings" value={summary.warned.length} tone={summary.warned.length ? "text-warning" : undefined} />
                <Stat label="Cannot import" value={summary.bad.length} tone={summary.bad.length ? "text-destructive" : undefined} />
              </div>
              {summary.dupes.length > 0 && (
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={includeDupes} onChange={(e) => setIncludeDupes(e.target.checked)} className="h-4 w-4 accent-primary" />
                  Import the {summary.dupes.length} duplicate{summary.dupes.length > 1 ? "s" : ""} anyway (creates a second record for the same SIM)
                </label>
              )}

              {/* Preview */}
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="data-table">
                  <thead>
                    <tr><th>Row</th><th>Result</th><th>Provider</th><th>Number</th><th>ICCID</th><th>Plan</th><th>Yacht</th><th>Cost</th><th>Billed</th><th>Renewal</th><th>Status</th></tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const y = r.record?.yacht_id ? yachts.find((x) => x.id === r.record!.yacht_id)?.vessel_name : r.raw.yacht || "—";
                      const skip = !r.record || (r.duplicateOf && !includeDupes);
                      return (
                        <tr key={r.line} className={cn(skip && "opacity-60")}>
                          <td className="tabular-nums text-muted-foreground">{r.line}</td>
                          <td className="max-w-[18rem]">
                            {!r.record ? (
                              <span className="flex items-start gap-1 text-destructive"><X className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>{r.errors.join(" · ")}</span></span>
                            ) : r.duplicateOf ? (
                              <span className="flex items-start gap-1 text-warning"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>Already in register ({r.duplicateOf}){includeDupes ? " — importing anyway" : " — skipped"}</span></span>
                            ) : r.warnings.length ? (
                              <span className="flex items-start gap-1 text-warning"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>{r.warnings.join(" · ")}</span></span>
                            ) : (
                              <span className="flex items-center gap-1 text-success"><CheckCircle2 className="h-3.5 w-3.5" /> OK</span>
                            )}
                            {r.record && r.duplicateOf && r.warnings.length > 0 && <div className="mt-0.5 text-xs text-muted-foreground">{r.warnings.join(" · ")}</div>}
                          </td>
                          <td className="capitalize">{r.record?.provider ?? r.raw.provider ?? "—"}</td>
                          <td className="tabular-nums">{r.raw.phone_number || "—"}</td>
                          <td className="tabular-nums text-xs">{r.raw.iccid || "—"}</td>
                          <td>{r.raw.plan_name || "—"}</td>
                          <td className={cn(r.raw.yacht && !r.record?.yacht_id && "text-warning")}>{y}</td>
                          <td className="tabular-nums">{r.record?.monthly_cost != null ? `${r.record.cost_currency} ${r.record.monthly_cost}` : r.raw.monthly_cost || "—"}</td>
                          <td className="tabular-nums">{r.record?.sell_price != null ? `${r.record.sell_currency} ${r.record.sell_price}` : r.raw.sell_price || "—"}</td>
                          <td className="tabular-nums">{r.record?.renewal_date ?? r.raw.renewal_date ?? "—"}</td>
                          <td>{r.record?.status ?? r.raw.status ?? "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-border px-5 py-3">
          <span className="text-xs text-muted-foreground">
            {grid ? `${summary.toImport.length} of ${rows.length} row${rows.length === 1 ? "" : "s"} will be imported.` : "Nothing is written until you press Import."}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose} disabled={busy === "import"}>Cancel</Button>
            <Button size="sm" className="gap-1.5" onClick={() => void importRows()} disabled={!summary.toImport.length || busy !== null}>
              {busy === "import" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              Import {summary.toImport.length ? `${summary.toImport.length} SIM${summary.toImport.length === 1 ? "" : "s"}` : ""}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-lg border border-border bg-background/40 px-3 py-2">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn("font-display text-lg font-bold tabular-nums", tone)}>{value}</div>
    </div>
  );
}

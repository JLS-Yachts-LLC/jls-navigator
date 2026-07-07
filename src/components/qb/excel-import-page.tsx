import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { FileSpreadsheet, Loader2, Upload, Check, X, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

type Kind = "estimate" | "invoice";
type Result = { sheet: string; ok: boolean; docNumber?: string; id?: string; error?: string };

export function QbExcelImportPage() {
  const [kind, setKind] = useState<Kind>("estimate");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Result[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function upload() {
    if (!file) return;
    setBusy(true); setResults(null); setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch(`/api/qb/excel-import?kind=${kind}`, {
        method: "POST",
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
        body: fd,
      });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.error ?? `Failed (${r.status})`);
      setResults(j.results as Result[]);
    } catch (e: any) {
      setError(e?.message ?? "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  const label = kind === "estimate" ? "Quotation / Estimate" : "Invoice";
  const created = results?.filter((r) => r.ok).length ?? 0;

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-border/70 bg-card/30 px-6 py-3.5">
        <div className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground/60">Polaris / QuickBooks</div>
        <h1 className="mt-0.5 flex items-center gap-2 font-display text-[1.25rem] font-semibold tracking-tight">
          <FileSpreadsheet className="h-5 w-5 text-primary" /> Excel Import
        </h1>
      </header>

      <div className="flex-1 overflow-auto px-6 py-5">
        <div className="mx-auto max-w-2xl space-y-5">
          <p className="text-sm text-muted-foreground">
            Upload a filled-in Excel workbook to create QuickBooks documents — one per worksheet. Missing items are created
            automatically, the customer is matched by name, and the next number is allocated
            (<span className="font-mono text-xs">Q26-#####</span> for quotations, <span className="font-mono text-xs">JLS26-#####</span> for invoices).
            The branded PDF is attached automatically once the document lands in QuickBooks.
          </p>

          {/* Type toggle */}
          <div className="flex gap-2">
            {(["estimate", "invoice"] as Kind[]).map((k) => (
              <button
                key={k}
                onClick={() => { setKind(k); setResults(null); }}
                className={cn(
                  "flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold transition",
                  kind === k ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-accent",
                )}
              >
                <FileText className="h-3.5 w-3.5" /> {k === "estimate" ? "Quotation / Estimate" : "Invoice"}
              </button>
            ))}
          </div>

          {/* Dropzone */}
          <div
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) { setFile(f); setResults(null); } }}
            className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border p-8 text-center transition hover:border-primary/50 hover:bg-accent/20"
          >
            <Upload className="h-7 w-7 text-muted-foreground/50" />
            {file ? (
              <div className="text-sm font-medium">{file.name}</div>
            ) : (
              <div className="text-sm text-muted-foreground">Click or drop an <span className="font-medium">.xlsx</span> workbook here</div>
            )}
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) { setFile(f); setResults(null); } }}
            />
          </div>

          <div className="flex items-center gap-3">
            <Button onClick={upload} disabled={!file || busy} className="gap-2">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Create {label}{results ? "s" : ""} in QuickBooks
            </Button>
            {file && !busy && <button onClick={() => { setFile(null); setResults(null); }} className="text-xs text-muted-foreground hover:text-foreground">Clear</button>}
          </div>

          {error && <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>}

          {results && (
            <div className="rounded-xl border border-border overflow-hidden">
              <div className="flex items-center justify-between border-b border-border bg-muted/30 px-4 py-2.5">
                <span className="text-sm font-semibold">Results</span>
                <span className="text-xs text-muted-foreground">{created} of {results.length} created</span>
              </div>
              <div className="divide-y divide-border/50">
                {results.map((r, i) => (
                  <div key={i} className="flex items-start gap-3 px-4 py-2.5 text-sm">
                    {r.ok
                      ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                      : <X className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />}
                    <div className="min-w-0">
                      <div className="font-medium">{r.sheet}</div>
                      {r.ok
                        ? <div className="text-xs text-emerald-600 dark:text-emerald-400">Created {r.docNumber}</div>
                        : <div className="text-xs text-destructive">{r.error}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { FileSpreadsheet, Loader2, Upload, Check, X, FileText, Link2, Copy } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Kind = "estimate" | "invoice";
type Result = { sheet: string; ok: boolean; docNumber?: string; id?: string; error?: string };
type ShareLinks = { enabled: boolean; estimate: string | null; invoice: string | null };

/**
 * The CURRENT login-free /qb-upload links, ready to copy. Before this the link
 * tokens lived only in integration_settings, so the team passed round URLs by
 * hand and an old or mistyped one just showed "not valid or has been replaced".
 */
function ShareableLinks() {
  const [links, setLinks] = useState<ShareLinks | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const r = await fetch("/api/qb/excel-import?links=1", {
          headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
        });
        const j = await r.json();
        if (r.ok && j.ok) setLinks(j as ShareLinks);
        else setFailed(true);
      } catch {
        setFailed(true);
      }
    })();
  }, []);

  async function copy(url: string, what: string) {
    try {
      await navigator.clipboard.writeText(url);
      toast.success(`${what} upload link copied`);
    } catch {
      toast.error("Couldn't copy — select the link and copy it manually");
    }
  }

  if (failed) return null;

  return (
    <div className="rounded-xl border border-border bg-card/30 p-4 space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Link2 className="h-4 w-4 text-primary" /> Shareable upload links (no login)
      </div>
      <p className="text-xs text-muted-foreground">
        Always copy the link from here — older links stop working when they're replaced.
        The quotation link can only create quotations, the invoice link only invoices.
      </p>
      {!links ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : !links.enabled ? (
        <div className="text-xs text-destructive">The shareable links are switched off.</div>
      ) : (
        <div className="space-y-2">
          {([["Quotation / Estimate", links.estimate], ["Invoice", links.invoice]] as const).map(([what, url]) => (
            <div key={what} className="flex items-center gap-2">
              <span className="w-36 shrink-0 text-xs font-medium">{what}</span>
              {url ? (
                <>
                  <input readOnly value={url} onFocus={(e) => e.currentTarget.select()}
                    className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 font-mono text-[11px] text-muted-foreground" />
                  <Button size="sm" variant="outline" className="gap-1.5" onClick={() => copy(url, what)}>
                    <Copy className="h-3.5 w-3.5" /> Copy
                  </Button>
                </>
              ) : (
                <span className="text-xs text-muted-foreground">Not set up</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function QbExcelImportPage({ embedded = false }: { embedded?: boolean } = {}) {
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

  const body = (
        <div className={cn("mx-auto max-w-2xl space-y-5", !embedded && "px-6 py-5")}>
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

          <ShareableLinks />
        </div>
  );

  if (embedded) return body;

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-border/70 bg-card/30 px-6 py-3.5">
        <div className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground/60">Polaris / QuickBooks</div>
        <h1 className="mt-0.5 flex items-center gap-2 font-display text-[1.25rem] font-semibold tracking-tight">
          <FileSpreadsheet className="h-5 w-5 text-primary" /> Excel Import
        </h1>
      </header>
      <div className="flex-1 overflow-auto">{body}</div>
    </div>
  );
}

/**
 * Public Excel → QuickBooks upload — /qb-upload/$token
 *
 * The login-free replacement for the n8n "QB (Quotation/Estimate) Excel Input"
 * form link. Deliberately OUTSIDE the /_app shell (same pattern as e-Sign's
 * /sign/$token and the Forms Library's /forms/fill/$token) so nothing behind the
 * login is exposed. The token IS the authorisation and fixes the document kind —
 * the quotation link cannot create invoices and vice versa. Rotating the token
 * (integration_settings → qb_excel_links) kills a shared URL instantly.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { FileSpreadsheet, Loader2, Upload, Check, X, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/qb-upload/$token")({
  component: PublicExcelUpload,
  head: () => ({ meta: [{ title: "Excel Upload — JLS Yachts" }] }),
});

type Kind = "estimate" | "invoice";
type Result = { sheet: string; ok: boolean; docNumber?: string; id?: string; error?: string };

const KIND_LABEL: Record<Kind, string> = { estimate: "Quotation / Estimate", invoice: "Invoice" };

function PublicExcelUpload() {
  const { token } = Route.useParams();
  const [kind, setKind] = useState<Kind | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Result[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Validate the link and learn which document kind it creates.
  useEffect(() => {
    void (async () => {
      try {
        const r = await fetch(`/api/qb/excel-import?token=${encodeURIComponent(token)}`);
        const j = await r.json();
        if (r.ok && j.ok) setKind(j.kind as Kind);
        else setInvalid(true);
      } catch {
        setInvalid(true);
      }
    })();
  }, [token]);

  async function upload() {
    if (!file || !kind) return;
    setBusy(true); setResults(null); setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch(`/api/qb/excel-import?token=${encodeURIComponent(token)}`, { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.error ?? `Failed (${r.status})`);
      setResults(j.results as Result[]);
      setFile(null);
    } catch (e: any) {
      setError(e?.message ?? "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  const created = results?.filter((r) => r.ok).length ?? 0;

  return (
    <div className="dark flex min-h-screen items-start justify-center bg-background px-4 py-10">
      <div className="w-full max-w-2xl space-y-6">
        <header className="space-y-1 text-center">
          <p className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-primary">JLS Yachts</p>
          <h1 className="font-display text-2xl font-bold text-foreground">
            {invalid ? "Upload link" : kind ? `${KIND_LABEL[kind]} — Excel Upload` : "Excel Upload"}
          </h1>
        </header>

        {invalid ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-5 py-6 text-center text-sm text-destructive">
            This upload link is not valid or has been replaced. Please ask our Port &amp; Agency Team for the current link.
          </div>
        ) : !kind ? (
          <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <>
            <p className="text-center text-sm text-muted-foreground">
              Upload a filled-in Excel workbook to create QuickBooks {kind === "invoice" ? "invoices" : "quotations"} —
              one per worksheet. Missing items are created automatically, the customer is matched by name, and the next
              document number is allocated. The branded PDF is attached automatically.
            </p>

            <button
              onClick={() => inputRef.current?.click()}
              className={cn(
                "flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-12 transition",
                file ? "border-primary/50 bg-primary/5" : "border-border hover:border-primary/40 hover:bg-accent/30",
              )}
            >
              {file ? <FileSpreadsheet className="h-8 w-8 text-primary" /> : <Upload className="h-8 w-8 text-muted-foreground" />}
              <span className="text-sm text-foreground">{file ? file.name : "Click to choose the .xlsx workbook"}</span>
              {file && <span className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(0)} KB — click Upload below</span>}
            </button>
            <input
              ref={inputRef} type="file" className="hidden"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(e) => { setFile(e.target.files?.[0] ?? null); setResults(null); setError(null); }}
            />

            <Button className="w-full gap-2" disabled={!file || busy} onClick={upload}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {busy ? "Creating documents…" : `Create ${KIND_LABEL[kind]} in QuickBooks`}
            </Button>

            {error && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>
            )}

            {results && (
              <div className="overflow-hidden rounded-xl border border-border">
                <div className="border-b border-border bg-muted/30 px-4 py-2.5 text-sm font-medium">
                  {created} of {results.length} sheet{results.length === 1 ? "" : "s"} created
                </div>
                <ul className="divide-y divide-border/60">
                  {results.map((r) => (
                    <li key={r.sheet} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                      {r.ok ? <Check className="h-4 w-4 shrink-0 text-emerald-400" /> : <X className="h-4 w-4 shrink-0 text-destructive" />}
                      <span className="font-medium">{r.sheet}</span>
                      <span className="ml-auto text-xs text-muted-foreground">
                        {r.ok ? <span className="font-mono">{r.docNumber}</span> : r.error}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground/70">
              <ShieldCheck className="h-3.5 w-3.5" />
              Private link for the JLS team — please don't forward it outside the company.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

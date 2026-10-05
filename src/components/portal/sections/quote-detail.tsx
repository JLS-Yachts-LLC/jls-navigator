/**
 * One JLS quotation, in full — lines, VAT, total, terms — with Approve /
 * Decline / Ask a question. Reads and writes through /api/portal/quotes, which
 * checks the quotation belongs to the vessel's QuickBooks customer. A decision
 * goes to the team as a Client Request; the team then accepts it in
 * QuickBooks (that's what raises the pro-forma), so nothing here changes the
 * quotation in QuickBooks itself.
 */
import { useCallback, useEffect, useState } from "react";
import { portalFetch } from "@/lib/portal/portal-fetch";
import { cn } from "@/lib/utils";
import { ArrowRight, CheckCircle2, FileText, HelpCircle, Loader2, X, XCircle } from "lucide-react";
import { StatusBadge, fmtDate } from "./section-ui";

type QuoteItem = {
  qty: number | string; description: string; unitRate: number; amount: number;
  vatPercent: string; vatValue: number; totalAmount: number; isDescriptionOnly: boolean;
};
type Decision = {
  id: string; decision: "approved" | "declined" | "query"; note: string | null;
  decided_by_name: string | null; created_at: string; captain_request_id: string | null;
};
type Quote = {
  id: string; docNumber: string | null; date: string | null; expiryDate: string | null; qboStatus: string;
  currency: string; displayCurrency: string; yachtPO: string | null; requestedBy: string | null; memo: string | null;
  items: QuoteItem[];
  totals: { amount: number; vat: number; total: number; converted: number | null; convertedCurrency: string | null };
  decisions: Decision[]; canApprove: boolean;
};

const n2 = (n: number) => Number(n || 0).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const DECISION_LABEL = { approved: "Approved", declined: "Declined", query: "Question sent" } as const;

async function api(path: string, init: RequestInit = {}) {
  const res = await portalFetch(path, { ...init, headers: init.body ? { "Content-Type": "application/json" } : undefined });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error ?? "Something went wrong — please try again.");
  return body;
}

export function QuoteDetail({ id, onClose, onDecided, onOpenRequest }: {
  id: string; onClose: () => void; onDecided: () => void; onOpenRequest: (requestId: string) => void;
}) {
  const [q, setQ] = useState<Quote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<null | "declined" | "query">(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setQ(await api(`/api/portal/quotes?id=${encodeURIComponent(id)}`)); setError(null); } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the quotation.");
    }
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  const openPdf = async () => {
    setBusy("pdf");
    try {
      const res = await portalFetch(`/api/portal/quotes?pdf=${encodeURIComponent(id)}`);
      if (!res.ok) throw new Error("Could not open the PDF.");
      window.open(URL.createObjectURL(await res.blob()), "_blank");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open the PDF.");
    } finally { setBusy(null); }
  };

  const decide = async (decision: "approved" | "declined" | "query") => {
    if (decision === "approved" && !confirm(`Approve quotation ${q?.docNumber ?? ""} for ${q?.currency} ${n2(q?.totals.total ?? 0)}?`)) return;
    setBusy(decision); setError(null);
    try {
      const res = await api("/api/portal/quotes", { method: "POST", body: JSON.stringify({ id, decision, note: note.trim() || null }) });
      setSent(decision === "approved"
        ? `Approved — JLS has been told to proceed (${res.requestReference}).`
        : decision === "declined" ? `Declined — JLS has been told (${res.requestReference}).`
        : `Question sent to JLS (${res.requestReference}).`);
      setMode(null); setNote("");
      await load(); onDecided();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send.");
    } finally { setBusy(null); }
  };

  const final = q?.decisions.find((d) => d.decision !== "query");
  const open = q && q.qboStatus === "pending" && !final;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center"
         onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="max-h-[94vh] w-full max-w-3xl overflow-y-auto rounded-t-3xl border border-border bg-card p-5 sm:rounded-3xl sm:p-7">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">Quotation</div>
            <h2 className="mt-1 text-xl font-bold">{q ? `No. ${q.docNumber ?? q.id}` : "…"}</h2>
            {q && (
              <div className="mt-1 text-sm text-muted-foreground">
                Dated {fmtDate(q.date)}{q.expiryDate && ` · valid to ${fmtDate(q.expiryDate)}`}
                {q.yachtPO && ` · your PO ${q.yachtPO}`}{q.requestedBy && ` · requested by ${q.requestedBy}`}
              </div>
            )}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
        </div>

        {!q && !error && <div className="flex h-40 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>}
        {sent && <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{sent}</div>}
        {error && <div className="mt-4 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-red-300">{error}</div>}

        {q && (
          <>
            <div className="mt-5 overflow-x-auto rounded-xl border border-border">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="bg-background/40 text-[11px] uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2.5 text-left font-medium">Item</th>
                    <th className="px-3 py-2.5 text-right font-medium">Qty</th>
                    <th className="px-3 py-2.5 text-right font-medium">Rate</th>
                    <th className="px-3 py-2.5 text-right font-medium">VAT</th>
                    <th className="px-3 py-2.5 text-right font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {q.items.map((it, i) => it.isDescriptionOnly ? (
                    <tr key={i} className="border-t border-border/60">
                      <td colSpan={5} className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{it.description}</td>
                    </tr>
                  ) : (
                    <tr key={i} className="border-t border-border/60">
                      <td className="px-3 py-2.5">{it.description}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{it.qty === "" ? "—" : it.qty}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{n2(it.unitRate)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{it.vatPercent}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{n2(it.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3 flex justify-end">
              <dl className="w-full max-w-xs space-y-1.5 text-sm">
                <div className="flex justify-between"><dt className="text-muted-foreground">Subtotal</dt><dd className="tabular-nums">{n2(q.totals.amount)}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">VAT</dt><dd className="tabular-nums">{n2(q.totals.vat)}</dd></div>
                <div className="flex items-baseline justify-between border-t border-border pt-2">
                  <dt className="font-semibold">Total</dt>
                  <dd className="text-lg font-bold tabular-nums">{q.currency} {n2(q.totals.total)}</dd>
                </div>
                {q.totals.converted != null && q.totals.convertedCurrency && (
                  <div className="flex justify-between text-xs text-muted-foreground"><dt>In {q.totals.convertedCurrency}</dt><dd className="tabular-nums">{n2(q.totals.converted)}</dd></div>
                )}
              </dl>
            </div>
            {q.memo && <p className="mt-4 whitespace-pre-line rounded-xl border border-border bg-background/30 p-3 text-sm text-muted-foreground">{q.memo}</p>}

            {q.decisions.length > 0 && (
              <div className="mt-5 space-y-1.5">
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Your responses</div>
                {q.decisions.map((d) => (
                  <button key={d.id} type="button" disabled={!d.captain_request_id}
                          onClick={() => { if (d.captain_request_id) { onClose(); onOpenRequest(d.captain_request_id); } }}
                          className="flex w-full items-center gap-3 rounded-xl border border-border bg-background/30 px-3 py-2 text-left text-sm transition enabled:hover:border-primary/50">
                    <StatusBadge label={DECISION_LABEL[d.decision]} tone={d.decision === "approved" ? "green" : d.decision === "declined" ? "red" : "sky"} />
                    <span className="min-w-0 flex-1 truncate text-muted-foreground">
                      {d.decided_by_name ?? "You"} · {fmtDate(d.created_at)}{d.note ? ` — ${d.note}` : ""}
                    </span>
                    {d.captain_request_id && <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground/60" />}
                  </button>
                ))}
              </div>
            )}

            {mode && (
              <div className="mt-5">
                <label htmlFor="quote-note" className="mb-1.5 block text-xs font-medium text-muted-foreground">
                  {mode === "query" ? "Your question" : "Reason (optional)"}
                </label>
                <textarea id="quote-note" autoFocus maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)}
                          className="min-h-[84px] w-full rounded-xl border border-border bg-background/50 px-3 py-2.5 text-sm outline-none focus:border-primary/60"
                          placeholder={mode === "query" ? "e.g. Could you quote the Wednesday evening slot instead?" : "e.g. Found it locally"} />
              </div>
            )}

            <div className="mt-6 flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => void openPdf()} disabled={!!busy}
                      className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-4 text-sm font-medium text-muted-foreground transition hover:text-foreground disabled:opacity-50">
                {busy === "pdf" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />} Quotation PDF
              </button>
              <div className="flex-1" />
              {mode ? (
                <>
                  <button type="button" onClick={() => { setMode(null); setNote(""); }} className="min-h-11 rounded-xl border border-border px-4 text-sm font-medium text-muted-foreground hover:text-foreground">Back</button>
                  <button type="button" onClick={() => void decide(mode)} disabled={!!busy || (mode === "query" && !note.trim())}
                          className={cn("inline-flex min-h-11 items-center gap-2 rounded-xl px-5 text-sm font-semibold transition disabled:opacity-50",
                            mode === "declined" ? "bg-red-500/90 text-white hover:bg-red-500" : "bg-primary text-primary-foreground hover:brightness-110")}>
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : mode === "declined" ? <XCircle className="h-4 w-4" /> : <HelpCircle className="h-4 w-4" />}
                    {mode === "declined" ? "Decline quotation" : "Send question"}
                  </button>
                </>
              ) : (
                <>
                  <button type="button" onClick={() => setMode("query")}
                          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-4 text-sm font-medium text-muted-foreground transition hover:text-foreground">
                    <HelpCircle className="h-4 w-4" /> Ask a question
                  </button>
                  {open && q.canApprove && (
                    <>
                      <button type="button" onClick={() => setMode("declined")}
                              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-4 text-sm font-medium text-muted-foreground transition hover:border-red-500/40 hover:text-red-300">
                        <XCircle className="h-4 w-4" /> Decline
                      </button>
                      <button type="button" onClick={() => void decide("approved")} disabled={!!busy}
                              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:brightness-110 disabled:opacity-50">
                        {busy === "approved" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Approve
                      </button>
                    </>
                  )}
                </>
              )}
            </div>
            {open && !q.canApprove && (
              <p className="mt-3 text-xs text-muted-foreground">The Captain, Owner or Purser approves quotations — you can still ask JLS a question.</p>
            )}
            {!open && !final && q.qboStatus !== "pending" && (
              <p className="mt-3 text-xs text-muted-foreground">This quotation is {q.qboStatus} in JLS's accounts.</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

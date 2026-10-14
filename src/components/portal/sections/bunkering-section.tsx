/**
 * Bunkering — the vessel's own bunkering enquiries, read-only: what was requested, the Captain's / Chief Engineer's confirmation,
 * the quotations JLS has shared, the approval and the delivery. (What the vessel may see is decided on the server.)
 */
import { useCallback, useEffect, useState } from "react";
import { Fuel, Loader2 } from "lucide-react";
import { portalFetch } from "@/lib/portal/portal-fetch";
import { STATUS_ORDER, STATUS_LABEL, GUIDANCE, type EnquiryStatus } from "@/lib/bunkering/model";
import type { VesselEnquiry } from "@/lib/portal/bunkering";
import { cn } from "@/lib/utils";
import { openPdf } from "@/lib/bunkering/open-pdf";

const day = (d: string | null) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—");
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-GB", { timeZone: "Asia/Dubai", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");
const money = (n: number | null, c: string) => (n == null ? "—" : `${c} ${n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

/** What clients should know about bunkering in the UAE — VAT, the 10 ppm fuel standard and the 48-hour rule — as given by JLS's Port Operations & Agency team. */
function GoodToKnow() {
  return (
    <details className="rounded-xl border border-border bg-card" open>
      <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">Good to know before you bunker in the UAE</summary>
      <div className="space-y-4 border-t border-border px-4 py-4 text-sm">
        {GUIDANCE.map((g) => (
          <section key={g.title} className="space-y-1.5">
            <h4 className="font-semibold">{g.title}</h4>
            <ul className="list-disc space-y-1 pl-5 text-muted-foreground">{g.points.map((p, i) => <li key={i}>{p}</li>)}</ul>
            {g.link && <a className="text-primary hover:underline" href={g.link.url} target="_blank" rel="noreferrer">{g.link.label}</a>}
          </section>
        ))}
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => void openPdf(() => portalFetch("/api/portal/bunkering/master-declaration")).catch((e) => window.alert(e instanceof Error ? e.message : "Could not open the declaration"))}
            className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:border-primary">Download the Master's declaration (blank)</button>
          <span className="text-xs text-muted-foreground">For zero-rating: the Master completes, signs and stamps it, and it is returned to the supplier with the bunker delivery receipt.</span>
        </div>
        <p className="text-xs text-muted-foreground">Your JLS agent will confirm how this applies to your vessel.</p>
      </div>
    </details>
  );
}

export function BunkeringSection() {
  const [rows, setRows] = useState<VesselEnquiry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [canAct, setCanAct] = useState(false);
  const [roles, setRoles] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [ticked, setTicked] = useState<Record<string, boolean>>({});

  const load = useCallback(async (first = false) => {
    const res = await portalFetch("/api/portal/bunkering");
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j.error ?? "Could not load bunkering");
    setRows(j.enquiries ?? []);
    setCanAct(!!j.canAct);
    setRoles(j.roles ?? []);
    if (first && (j.enquiries ?? []).length === 1) setOpen(j.enquiries[0].id);
  }, []);

  useEffect(() => { void load(true).catch((e) => setError(e instanceof Error ? e.message : "Could not load bunkering")); }, [load]);

  /** An action on the vessel's own enquiry. The server checks who you are and what you may do; this only shows the result. */
  async function act(send: () => Promise<Response>, done: string) {
    setBusy(true); setNote(null);
    try {
      const res = await send();
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? "That did not work — please try again.");
      await load();
      setNote(done);
    } catch (e) { setNote(e instanceof Error ? e.message : "That did not work — please try again."); }
    finally { setBusy(false); }
  }
  const post = (body: unknown) => portalFetch("/api/portal/bunkering/action", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const upload = (enquiryId: string, file: File) => { const f = new FormData(); f.set("enquiryId", enquiryId); f.set("file", file); return portalFetch("/api/portal/bunkering/declaration-upload", { method: "POST", body: f }); };

  if (error) return <p className="rounded-xl border border-border px-4 py-6 text-sm text-muted-foreground">{error}</p>;
  if (rows === null) return <div className="flex h-32 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  if (rows.length === 0) return (
    <div className="space-y-3">
      <GoodToKnow />
      <div className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
        <Fuel className="mx-auto mb-2 h-6 w-6 opacity-50" />
        No bunkering enquiries yet. When you ask JLS for a bunkering quotation, you'll follow it here — from the request to the quotation, your approval and the delivery.
      </div>
    </div>
  );

  return (
    <div className="space-y-3">
      <GoodToKnow />
      {note && <p className="rounded-lg border border-primary/40 bg-primary/5 px-3 py-2 text-sm" role="status">{note}</p>}
      {rows.map((r) => {
        const at = STATUS_ORDER.indexOf(r.status as EnquiryStatus);
        const isOpen = open === r.id;
        return (
          <div key={r.id} className="rounded-xl border border-border bg-card">
            <button type="button" onClick={() => setOpen(isOpen ? null : r.id)} className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-left">
              <Fuel className="h-5 w-5 text-muted-foreground" />
              <span className="font-mono text-sm font-semibold text-primary">{r.number}</span>
              <span className={cn("rounded-full border px-2 py-0.5 text-xs font-semibold", r.status === "approved" ? "border-emerald-500/40 text-emerald-400" : r.status === "cancelled" ? "border-border text-muted-foreground" : "border-primary/40 text-primary")}>{r.statusLabel}</span>
              <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{[r.fuel, r.quantity ? `${r.quantity} ${r.unit}` : null, r.port].filter(Boolean).join(" · ")}</span>
              <span className="text-sm text-muted-foreground">{day(r.preferredDate)}</span>
            </button>

            {isOpen && (
              <div className="space-y-4 border-t border-border px-4 py-4 text-sm">
                {r.status !== "cancelled" && (
                  <ol className="flex flex-wrap gap-1.5 text-xs">
                    {STATUS_ORDER.map((s, i) => (
                      <li key={s} className={cn("rounded-full border px-2 py-0.5", i < at ? "border-emerald-500/40 text-emerald-400" : i === at ? "border-primary bg-primary/10 font-semibold" : "border-border text-muted-foreground")}>{STATUS_LABEL[s]}</li>
                    ))}
                  </ol>
                )}

                <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
                  <div><dt className="text-muted-foreground">Port / berth</dt><dd>{[r.port, r.berth].filter(Boolean).join(" — ") || "—"}</dd></div>
                  <div><dt className="text-muted-foreground">Preferred date and time</dt><dd>{day(r.preferredDate)}{r.preferredTime ? ` at ${r.preferredTime.slice(0, 5)}` : ""}</dd></div>
                  <div><dt className="text-muted-foreground">Fuel and quantity</dt><dd>{r.fuel ?? "—"} · {r.quantity ?? "—"} {r.unit}</dd></div>
                  <div><dt className="text-muted-foreground">Delivery method</dt><dd>{r.deliveryMethod ?? "—"}</dd></div>
                  {r.specNotes && <div className="sm:col-span-2"><dt className="text-muted-foreground">Specification / sulphur limit</dt><dd>{r.specNotes}</dd></div>}
                  {r.specialRequirements && <div className="sm:col-span-2"><dt className="text-muted-foreground">Special requirements</dt><dd>{r.specialRequirements}</dd></div>}
                </dl>

                <div className="space-y-2">
                  <div className={cn("rounded-lg border px-3 py-2", r.vat.rate === null ? "border-border text-muted-foreground" : "border-primary/40 bg-primary/5")}>
                    <strong>VAT:</strong> {r.vat.text}
                    {r.vat.rate !== 5 && (
                      <div className="mt-1.5 flex flex-wrap items-center gap-3">
                        {r.declarationReceived
                          ? <span className="text-emerald-500">The Master's signed declaration has been received.</span>
                          : <>
                              <span className="text-muted-foreground">The Master's declaration is still needed for zero-rating.</span>
                              {canAct && (
                                <label className="cursor-pointer rounded-lg bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground">
                                  {busy ? "Uploading…" : "Upload the signed declaration"}
                                  <input type="file" accept="application/pdf,image/*" className="hidden" disabled={busy}
                                    onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void act(() => upload(r.id, f), "Thank you — the signed declaration has been received."); }} />
                                </label>
                              )}
                              <button type="button" onClick={() => void openPdf(() => portalFetch(`/api/portal/bunkering/master-declaration?id=${encodeURIComponent(r.id)}`)).catch((e) => window.alert(e instanceof Error ? e.message : "Could not open the declaration"))}
                                className="rounded-lg border border-border px-2.5 py-1 text-xs font-medium hover:border-primary">Download it, pre-filled for this vessel</button>
                            </>}
                      </div>
                    )}
                  </div>
                  {r.fuelRule && <div className={cn("rounded-lg border px-3 py-2", r.fuelRule.level === "warn" ? "border-amber-500/50 bg-amber-500/10 text-amber-500" : "border-emerald-500/40 text-emerald-500")}><strong>Fuel:</strong> {r.fuelRule.text}</div>}
                </div>

                <div className={cn("space-y-2 rounded-lg border px-3 py-2", r.confirmation ? "border-emerald-500/40" : "border-border")}>
                  {r.confirmation
                    ? <>Requirements confirmed by <strong>{r.confirmation.by}</strong> ({r.confirmation.role}) on {when(r.confirmation.at)}{r.confirmation.method ? ` — ${r.confirmation.method}` : ""}.</>
                    : "JLS is waiting for the Captain or Chief Engineer to confirm the fuel type, specification and quantity."}
                  {!r.confirmation && canAct && !["approved", "delivered", "cancelled"].includes(r.status) && (
                    <div className="space-y-2 border-t border-border pt-2">
                      <label className="flex items-start gap-2"><input type="checkbox" className="mt-1" checked={!!ticked[r.id]} onChange={(e) => setTicked({ ...ticked, [r.id]: e.target.checked })} />
                        <span>I confirm that the information above is accurate and that the requested <strong>fuel type, specification and quantity</strong> have been checked against the vessel's requirements.</span></label>
                      <button type="button" disabled={busy || !ticked[r.id]} onClick={() => void act(() => post({ action: "confirm", enquiryId: r.id, role: roles[0] }), "Thank you — your confirmation has been recorded.")}
                        className="rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">Confirm as {roles[0]}</button>
                    </div>
                  )}
                </div>

                {r.quotations.length > 0 && (
                  <div className="space-y-1.5">
                    <h4 className="font-semibold">Quotations</h4>
                    <div className="overflow-x-auto rounded-lg border border-border">
                      <table className="w-full">
                        <thead><tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                          <th className="px-3 py-2">Supplier</th><th className="px-3 py-2">Quantity</th><th className="px-3 py-2">Price</th><th className="px-3 py-2">Total</th><th className="px-3 py-2">Valid until</th><th className="px-3 py-2" />
                        </tr></thead>
                        <tbody className="divide-y divide-border/60">
                          {r.quotations.map((q, i) => (
                            <tr key={i} className={cn(q.approved && "bg-emerald-500/5")}>
                              <td className="px-3 py-2"><div className="font-medium">{q.supplier}</div>{q.quoteRef && <div className="text-xs text-muted-foreground">Ref {q.quoteRef}</div>}</td>
                              <td className="px-3 py-2">{q.quantity ?? "—"} {q.unit} {q.fuel ?? ""}</td>
                              <td className="px-3 py-2 whitespace-nowrap">{q.unitPrice == null ? "—" : `${q.currency} ${q.unitPrice} ${q.priceUnit ?? ""}`}</td>
                              <td className="px-3 py-2 whitespace-nowrap font-medium">{money(q.total, q.currency)}</td>
                              <td className="px-3 py-2 whitespace-nowrap">{day(q.validUntil)}</td>
                              <td className="px-3 py-2 text-xs">
                                {q.approved ? <span className="text-emerald-500">Approved</span> : q.status === "rejected" ? <span className="text-muted-foreground">Not chosen</span> : q.status === "expired" ? <span className="text-muted-foreground">Expired</span>
                                  : canAct && r.status === "awaiting_vessel" && q.status === "received" ? (
                                    <button type="button" disabled={busy} className="rounded-lg bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground disabled:opacity-50"
                                      onClick={() => { if (window.confirm(`Approve the quotation from ${q.supplier} — ${q.quantity ?? ""} ${q.unit} ${q.fuel ?? ""}${q.total != null ? ` — ${money(q.total, q.currency)}` : ""}?\n\nThis is recorded as approved by you (${roles[0]}) and cannot be undone here.`)) void act(() => post({ action: "approve", enquiryId: r.id, quoteId: q.id, role: roles[0] }), "Thank you — your approval has been recorded and JLS has been told."); }}>Approve</button>
                                  ) : ""}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {r.approval && <p className="rounded-lg border border-emerald-500/40 px-3 py-2">Approved by <strong>{r.approval.by}</strong> ({r.approval.role}) on {when(r.approval.at)}{r.approval.method ? ` — ${r.approval.method}` : ""}.</p>}
                {r.delivery && <p className="rounded-lg border border-border px-3 py-2"><strong>Delivered</strong> {day(r.delivery.date)}: {r.delivery.quantity} {r.delivery.unit}{r.delivery.bdn ? ` · BDN ${r.delivery.bdn}` : ""}.</p>}
                {r.documents.length > 0 && <ul className="space-y-1">{r.documents.map((d, i) => <li key={i}><a className="text-primary hover:underline" href={d.url} target="_blank" rel="noreferrer">{d.name}</a></li>)}</ul>}

                {r.timeline.length > 0 && (
                  <ul className="space-y-0.5 text-xs text-muted-foreground">{r.timeline.map((t, i) => <li key={i}>{when(t.at)} — {t.label}</li>)}</ul>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

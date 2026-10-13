/**
 * One bunkering enquiry: what the vessel asked for, its confirmation of the requirements, the supplier quotations, the vessel's
 * approval of one of them, the delivery, and a log of everything — so what was requested, quoted and approved is on record.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Pencil, Plus, Send, FileText, Image as ImageIcon, Check, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SignedAnchor, SignedImage } from "@/components/ui/signed-file";
import { cn } from "@/lib/utils";
import { errorMessage } from "@/lib/error-message";
import {
  STATUS_LABEL, STATUS_ORDER, QUOTE_STATUS_LABEL, ROLES, CONFIRM_METHODS, UNITS, PRICE_UNITS, CURRENCIES, FUEL_TYPES, DOC_TYPES,
  allowedMoves, canSendToSuppliers, quantityDifference, quoteTotal, priceUnitFor, unitLabel, money, emptyQuote,
  type EnquiryStatus, type QuoteForm, type QuoteStatus, type EnquiryForm,
} from "@/lib/bunkering/model";
import {
  loadEnquiryDetail, saveQuote, deleteQuote, setEnquiryStatus, approveQuote, markDelivered, recordDeclaration, addEnquiryComment,
  addEnquiryFiles, updateEnquiry, toEnquiryForm, type EnquiryDetail, type BunkerQuote,
} from "@/lib/bunkering/data";
import type { PendingFile } from "@/lib/warehouse/requests";
import { FilePicker } from "@/components/shipsync/warehouse/request-form";
import { EnquiryFormView, DeclarationBox, type DeclarationHandle, type YachtOption } from "./enquiry-form";

export const STATUS_STYLE: Record<EnquiryStatus, string> = {
  new: "border-sky-500/40 bg-sky-500/10 text-sky-400",
  quotes_requested: "border-indigo-500/40 bg-indigo-500/10 text-indigo-300",
  quotes_received: "border-amber-500/40 bg-amber-500/10 text-amber-400",
  awaiting_vessel: "border-orange-500/50 bg-orange-500/10 text-orange-400",
  approved: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400",
  delivered: "border-border bg-muted/40 text-muted-foreground",
  cancelled: "border-border bg-muted/40 text-muted-foreground line-through",
};
export const StatusBadge = ({ status }: { status: EnquiryStatus }) => (
  <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold", STATUS_STYLE[status])}>{STATUS_LABEL[status]}</span>
);

const selectCls = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm";
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-GB", { timeZone: "Asia/Dubai", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");
const day = (d: string | null) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—");
const MOVE_LABEL: Partial<Record<EnquiryStatus, string>> = {
  new: "Back to new", quotes_requested: "Enquiries sent to suppliers", quotes_received: "Quotes received", awaiting_vessel: "Sent to the vessel to approve", cancelled: "Cancel enquiry…",
};

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return <div className="flex gap-3 py-1 text-sm"><div className="w-48 shrink-0 text-muted-foreground">{k}</div><div className="min-w-0 flex-1 break-words">{v || "—"}</div></div>;
}
function F({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return <div className={cn("space-y-1", className)}><Label className="text-sm">{label}</Label>{children}</div>;
}

export function EnquiryDetailView({ id, isAgency, myId, onChanged, yachts = [] }: { id: string; isAgency: boolean; myId: string | null; onChanged: () => void; yachts?: YachtOption[] }) {
  const [d, setD] = useState<EnquiryDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [quote, setQuote] = useState<{ id?: string; form: QuoteForm } | null>(null);
  const [approving, setApproving] = useState<BunkerQuote | null>(null);
  const [ap, setAp] = useState({ role: "", name: "", method: "", note: "" });
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");
  const [editing, setEditing] = useState<EnquiryForm | null>(null);
  const [editReason, setEditReason] = useState("");
  const [declaring, setDeclaring] = useState(false);
  const decl = useRef<DeclarationHandle>(null);
  const [delivery, setDelivery] = useState({ date: "", quantity: "", unit: "MT", bdn: "", note: "" });
  const [comment, setComment] = useState("");
  const [newFiles, setNewFiles] = useState<PendingFile[]>([]);

  const load = useCallback(async () => { setD(await loadEnquiryDetail(id)); }, [id]);
  useEffect(() => { void load().catch((e) => toast.error(errorMessage(e, "Could not load the enquiry"))); }, [load]);

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    try { await fn(); toast.success(ok); await load(); onChanged(); }
    catch (e) { toast.error(errorMessage(e, "That did not work")); }
    finally { setBusy(false); }
  }

  if (!d) return <div className="flex h-40 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  const e = d.enquiry;
  const me = { isAgency, isCreator: !!myId && e.created_by === myId };
  const final = e.status === "delivered" || e.status === "cancelled";
  const confirmed = canSendToSuppliers({ role: e.declared_by_role, name: e.declared_by_name });
  const moves = allowedMoves(e.status, me);
  const fuel = e.fuel_type === "Other" ? e.fuel_other : e.fuel_type;
  const approvedQuote = d.quotes.find((q) => q.id === e.approved_quote_id) ?? null;

  function pickMove(s: EnquiryStatus) {
    if (s === "cancelled") { setCancelling(true); return; }
    void run(() => setEnquiryStatus(id, s), STATUS_LABEL[s]);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={e.status} />
        <span className="text-sm text-muted-foreground">{fuel} · {e.quantity} {unitLabel(e.quantity_unit)} · {e.port ?? "no port"}</span>
      </div>
      {!final && (
        <ol className="flex flex-wrap gap-1.5 text-xs">
          {STATUS_ORDER.map((s, i) => {
            const at = STATUS_ORDER.indexOf(e.status);
            return <li key={s} className={cn("rounded-full border px-2 py-0.5", i < at ? "border-emerald-500/40 text-emerald-400" : i === at ? "border-primary bg-primary/10 font-semibold" : "border-border text-muted-foreground")}>{i + 1}. {STATUS_LABEL[s]}</li>;
          })}
        </ol>
      )}
      {e.status === "cancelled" && e.cancel_reason && <div className="rounded-lg border border-border px-3 py-2 text-sm"><strong>Cancelled:</strong> {e.cancel_reason}</div>}

      <div className="rounded-lg border border-border px-3 py-2">
        <Row k="Client Portal" v={e.yacht_id ? <span className="text-emerald-500">Linked — the vessel can see this enquiry{d.quotes.some((q) => q.shared_with_vessel) ? " and the quotations marked as shared" : ""}.</span> : <span className="text-amber-500">Not linked to a Polaris yacht, so the vessel cannot see it. Use "Change the details" to choose the yacht.</span>} />
        <Row k="Yacht" v={`${e.yacht_name}${e.flag ? ` (${e.flag})` : ""}${e.loa_m ? ` · ${e.loa_m} m` : ""}${e.imo_no ? ` · IMO ${e.imo_no}` : ""}`} />
        <Row k="Captain / Chief Engineer" v={[e.captain_name, e.chief_engineer_name].filter(Boolean).join(" / ")} />
        <Row k="Contact" v={[e.contact_number, e.contact_email].filter(Boolean).join(" · ")} />
        <Row k="Port / berth" v={[e.port, e.berth].filter(Boolean).join(" — ")} />
        <Row k="Preferred date and time" v={`${day(e.preferred_date)}${e.preferred_time ? ` at ${e.preferred_time.slice(0, 5)}` : ""}`} />
        <Row k="Fuel and quantity" v={`${fuel ?? "—"} · ${e.quantity ?? "—"} ${unitLabel(e.quantity_unit)}`} />
        <Row k="Specification / sulphur limit" v={e.spec_notes} />
        <Row k="Delivery method" v={e.delivery_method} />
        <Row k="Fuel remaining / tank capacity" v={[e.fuel_remaining, e.tank_capacity].filter(Boolean).join(" / ")} />
        <Row k="Special requirements" v={e.special_requirements} />
        {e.notes && <Row k="Internal notes" v={<span className="whitespace-pre-wrap">{e.notes}</span>} />}
        <Row k="Logged by" v={`${e.created_by_name ?? "—"} · ${when(e.created_at)}`} />
        <Row k="Enquiry sent to suppliers" v={day(e.date_enquiry_sent)} />
        {(me.isAgency || me.isCreator) && !final && (
          <div className="pt-2"><Button size="sm" variant="outline" className="gap-1.5" disabled={busy} onClick={() => { setEditing(toEnquiryForm(e)); setEditReason(""); }}><Pencil className="h-4 w-4" /> Change the details</Button></div>
        )}
      </div>

      {editing && (
        <div className="space-y-3 rounded-lg border border-primary/40 bg-primary/5 p-3">
          <EnquiryFormView value={editing} onChange={setEditing} yachts={yachts} />
          <F label="What changed, and why? (kept in the log)"><Textarea rows={2} value={editReason} onChange={(ev) => setEditReason(ev.target.value)} /></F>
          <div className="flex gap-2">
            <Button size="sm" disabled={busy || !editReason.trim()} onClick={() => void run(async () => { await updateEnquiry(id, editing, editReason); setEditing(null); }, "Details changed")}>Save the change</Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
          </div>
        </div>
      )}

      {/* the vessel's confirmation of requirements */}
      <div className={cn("space-y-2 rounded-lg border p-3", confirmed ? "border-emerald-500/40" : "border-orange-500/50")}>
        <h4 className="text-sm font-semibold">Vessel's confirmation of the requirements</h4>
        {confirmed ? (
          <p className="text-sm">Confirmed by <strong>{e.declared_by_name}</strong> ({e.declared_by_role}) on {when(e.declared_at)} — {e.declaration_method}.</p>
        ) : (
          <p className="text-sm text-orange-400">Not confirmed yet. The Captain or Chief Engineer must confirm the fuel type, specification and quantity before enquiries go to suppliers.</p>
        )}
        {e.declaration_signature_url && <SignedImage stored={e.declaration_signature_url} alt="Signature" className="h-16 rounded border border-border bg-white" />}
        {!final && (me.isAgency || me.isCreator) && (
          declaring ? (
            <div className="space-y-2">
              <DeclarationBox ref={decl} defaultName={e.captain_name ?? ""} />
              <div className="flex gap-2">
                <Button size="sm" disabled={busy} onClick={() => void run(async () => { const v = await decl.current?.read(); if (!v) throw new Error("Fill in the confirmation first."); await recordDeclaration(id, v); setDeclaring(false); }, "Confirmation recorded")}>Record the confirmation</Button>
                <Button size="sm" variant="ghost" onClick={() => setDeclaring(false)}>Cancel</Button>
              </div>
            </div>
          ) : <Button size="sm" variant="outline" onClick={() => setDeclaring(true)}>{confirmed ? "Record it again" : "Record the vessel's confirmation"}</Button>
        )}
      </div>

      {/* quotations */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold">Quotations</h4>
          {me.isAgency && !final && e.status !== "approved" && <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setQuote({ form: emptyQuote({ fuelType: e.fuel_type ?? "", unit: e.quantity_unit ?? "MT", priceUnit: priceUnitFor(e.quantity_unit) || "per MT", quantity: e.quantity == null ? "" : String(e.quantity), dateRequested: e.date_enquiry_sent ?? "" }) })}><Plus className="h-4 w-4" /> Add a quotation</Button>}
        </div>
        {d.quotes.length === 0 ? <p className="text-sm text-muted-foreground">No quotations yet.</p> : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2">Supplier</th><th className="px-3 py-2">Ref</th><th className="px-3 py-2">Quoted</th><th className="px-3 py-2">Price</th><th className="px-3 py-2">Total</th><th className="px-3 py-2">Valid until</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Vessel sees</th><th className="px-3 py-2" />
              </tr></thead>
              <tbody className="divide-y divide-border/60">
                {d.quotes.map((q) => {
                  const diff = quantityDifference(e.quantity, e.quantity_unit, q.quantity, q.quantity_unit);
                  return (
                    <tr key={q.id} className={cn(q.status === "approved" && "bg-emerald-500/5")}>
                      <td className="px-3 py-2"><div className="font-medium">{q.supplier}</div><div className="text-xs text-muted-foreground">{[q.supplier_contact, q.supplier_phone, q.supplier_email].filter(Boolean).join(" · ")}</div></td>
                      <td className="px-3 py-2">{q.quote_ref ?? "—"}</td>
                      <td className="px-3 py-2">{q.quantity ?? "—"} {q.quantity_unit ?? ""} {q.fuel_type ?? ""}{diff && <div className="text-xs text-amber-500">{diff}</div>}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{q.unit_price == null ? "—" : `${q.currency} ${q.unit_price} ${q.price_unit ?? ""}`}</td>
                      <td className="px-3 py-2 whitespace-nowrap font-medium">{money(q.total, q.currency)}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{day(q.valid_until)}</td>
                      <td className="px-3 py-2"><span className={cn("rounded-full border px-2 py-0.5 text-xs", q.status === "approved" ? "border-emerald-500/40 text-emerald-400" : "border-border text-muted-foreground")}>{QUOTE_STATUS_LABEL[q.status]}</span></td>
                      <td className="px-3 py-2 text-xs">{q.shared_with_vessel ? <span className="text-emerald-500">Shared</span> : <span className="text-muted-foreground">Not shared</span>}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-right">
                        {me.isAgency && !final && e.status !== "approved" && <>
                          {q.status === "received" && <Button size="sm" className="mr-1 gap-1" onClick={() => { setApproving(q); setAp({ role: "", name: "", method: "", note: "" }); }}><Check className="h-4 w-4" /> Approve</Button>}
                          <button type="button" aria-label="Edit quotation" className="rounded p-1 text-muted-foreground hover:bg-accent" onClick={() => setQuote({ id: q.id, form: quoteToForm(q) })}><Pencil className="h-4 w-4" /></button>
                          <button type="button" aria-label="Remove quotation" className="rounded p-1 text-muted-foreground hover:text-destructive" onClick={() => { if (window.confirm(`Remove the quotation from ${q.supplier}?`)) void run(() => deleteQuote(id, q), "Removed"); }}><Trash2 className="h-4 w-4" /></button>
                        </>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {quote && <QuoteEditor value={quote.form} onChange={(f) => setQuote({ ...quote, form: f })} busy={busy}
          onSave={() => void run(async () => { await saveQuote(id, quote.form, quote.id); setQuote(null); }, "Quotation saved")} onCancel={() => setQuote(null)} />}
      </div>

      {approving && (
        <div className="space-y-3 rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-3">
          <h4 className="text-sm font-semibold">Record the vessel's approval — {approving.supplier}, {money(approving.total, approving.currency)}</h4>
          {quantityDifference(e.quantity, e.quantity_unit, approving.quantity, approving.quantity_unit) && <p className="text-sm text-amber-500">{quantityDifference(e.quantity, e.quantity_unit, approving.quantity, approving.quantity_unit)} — make sure the vessel has agreed to this quantity.</p>}
          <div className="grid gap-3 sm:grid-cols-2">
            <F label="Approved by"><select className={selectCls} value={ap.role} onChange={(ev) => setAp({ ...ap, role: ev.target.value })}><option value="">Choose…</option>{ROLES.map((r) => <option key={r}>{r}</option>)}</select></F>
            <F label="Name"><Input value={ap.name} onChange={(ev) => setAp({ ...ap, name: ev.target.value })} /></F>
            <F label="How it was confirmed" className="sm:col-span-2"><select className={selectCls} value={ap.method} onChange={(ev) => setAp({ ...ap, method: ev.target.value })}><option value="">Choose…</option>{CONFIRM_METHODS.filter((m) => m !== "Signed on screen").map((m) => <option key={m}>{m}</option>)}</select></F>
          </div>
          <p className="text-sm text-muted-foreground">Attach the signed form, email or WhatsApp confirmation under Documents and photos.</p>
          <F label="Note (optional)"><Textarea rows={2} value={ap.note} onChange={(ev) => setAp({ ...ap, note: ev.target.value })} /></F>
          <div className="flex gap-2">
            <Button size="sm" disabled={busy} onClick={() => void run(async () => { await approveQuote(id, approving, ap); setApproving(null); }, "Approval recorded")}>Record the approval</Button>
            <Button size="sm" variant="ghost" onClick={() => setApproving(null)}>Cancel</Button>
          </div>
        </div>
      )}

      {e.status === "approved" || e.status === "delivered" ? (
        <div className="space-y-2 rounded-lg border border-emerald-500/40 p-3">
          <h4 className="text-sm font-semibold">Approval</h4>
          <p className="text-sm">{approvedQuote ? <><strong>{approvedQuote.supplier}</strong> — {approvedQuote.quantity} {approvedQuote.quantity_unit} at {approvedQuote.currency} {approvedQuote.unit_price} {approvedQuote.price_unit} = <strong>{money(approvedQuote.total, approvedQuote.currency)}</strong>. </> : null}Approved by <strong>{e.approved_by_name}</strong> ({e.approved_by_role}) on {when(e.approved_at)} — {e.approval_method}.{e.approval_note ? ` Note: ${e.approval_note}` : ""}</p>
          {e.status === "delivered" && <p className="text-sm"><strong>Delivered</strong> {day(e.delivered_date)}: {e.delivered_quantity} {unitLabel(e.delivered_unit)}{e.bdn_number ? ` · BDN ${e.bdn_number}` : ""}.</p>}
          {e.status === "approved" && me.isAgency && (
            <div className="space-y-2 border-t border-border pt-2">
              <h5 className="text-sm font-medium">Record the delivery</h5>
              <div className="grid gap-2 sm:grid-cols-4">
                <F label="Date"><Input type="date" value={delivery.date} onChange={(ev) => setDelivery({ ...delivery, date: ev.target.value })} /></F>
                <F label="Quantity delivered"><Input type="number" inputMode="decimal" value={delivery.quantity} onChange={(ev) => setDelivery({ ...delivery, quantity: ev.target.value })} /></F>
                <F label="Unit"><select className={selectCls} value={delivery.unit} onChange={(ev) => setDelivery({ ...delivery, unit: ev.target.value })}>{UNITS.map((u) => <option key={u.code} value={u.code}>{u.label}</option>)}</select></F>
                <F label="BDN number"><Input value={delivery.bdn} onChange={(ev) => setDelivery({ ...delivery, bdn: ev.target.value })} /></F>
              </div>
              <Button size="sm" disabled={busy || !delivery.date || !(Number(delivery.quantity) > 0)} onClick={() => void run(() => markDelivered(id, { date: delivery.date, quantity: Number(delivery.quantity), unit: delivery.unit, bdn: delivery.bdn, note: delivery.note }), "Marked delivered")}>Mark delivered</Button>
            </div>
          )}
        </div>
      ) : null}

      {moves.length > 0 && (
        <div className="space-y-2 rounded-lg border border-border p-3">
          <div className="flex flex-wrap gap-2">
            {moves.map((s) => {
              const blocked = s === "quotes_requested" && !confirmed;
              return <Button key={s} size="sm" variant={s === "cancelled" ? "outline" : "default"} disabled={busy || blocked} title={blocked ? "The vessel must confirm the requirements first" : undefined} onClick={() => pickMove(s)}>{MOVE_LABEL[s]}</Button>;
            })}
          </div>
          {!confirmed && me.isAgency && <p className="text-sm text-muted-foreground">"Enquiries sent to suppliers" unlocks once the vessel's confirmation is recorded.</p>}
          {cancelling && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Why is it being cancelled? (kept in the log)</p>
              <Textarea rows={2} value={reason} onChange={(ev) => setReason(ev.target.value)} />
              <div className="flex gap-2"><Button size="sm" disabled={busy || !reason.trim()} onClick={() => void run(async () => { await setEnquiryStatus(id, "cancelled", reason); setCancelling(false); }, "Cancelled")}>Cancel the enquiry</Button><Button size="sm" variant="ghost" onClick={() => setCancelling(false)}>Back</Button></div>
            </div>
          )}
        </div>
      )}

      <div className="space-y-2">
        <h4 className="text-sm font-semibold">Documents and photos</h4>
        {d.files.length === 0 ? <p className="text-sm text-muted-foreground">Nothing attached yet.</p> : (
          <ul className="space-y-1">{d.files.map((f) => (
            <li key={f.id} className="text-sm"><SignedAnchor stored={f.url} className="inline-flex items-center gap-1.5 text-primary hover:underline">{f.kind === "photo" ? <ImageIcon className="h-4 w-4" /> : <FileText className="h-4 w-4" />} {f.name}</SignedAnchor>{f.doc_type && <span className="ml-2 text-xs text-muted-foreground">{f.doc_type}</span>}</li>
          ))}</ul>
        )}
        {!final && (me.isAgency || me.isCreator) && (
          <div className="space-y-2 rounded-lg border border-dashed border-border p-3">
            <FilePicker files={newFiles} onChange={setNewFiles} docTypes={DOC_TYPES} hint="Quotations, the vessel's signed form or email / WhatsApp confirmation, the bunker delivery note." />
            {newFiles.length > 0 && <Button size="sm" disabled={busy} onClick={() => void run(async () => { await addEnquiryFiles(id, newFiles); setNewFiles([]); }, "Added")}>Upload {newFiles.length} file{newFiles.length === 1 ? "" : "s"}</Button>}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <h4 className="text-sm font-semibold">Log</h4>
        <ul className="space-y-2">{d.events.map((ev) => (
          <li key={ev.id} className="rounded-lg border border-border/60 px-3 py-2 text-sm">
            <div className="flex flex-wrap items-baseline gap-2"><strong>{ev.actor_name ?? "Someone"}</strong>
              <span className="text-muted-foreground">{ev.kind === "created" ? "logged the enquiry" : ev.kind === "status" ? `moved it to ${STATUS_LABEL[(ev.to_status ?? "new") as EnquiryStatus]?.toLowerCase()}` : ev.kind === "approved" ? "recorded the approval" : ev.kind === "delivered" ? "recorded the delivery" : ev.kind === "quote" ? "quotation" : ev.kind === "file" ? "files" : ev.kind === "edited" ? "changed" : "commented"}</span>
              <span className="ml-auto text-xs text-muted-foreground">{when(ev.created_at)}</span></div>
            {ev.body && <p className="mt-1 whitespace-pre-wrap">{ev.body}</p>}
          </li>
        ))}</ul>
        <div className="flex gap-2">
          <Textarea rows={2} placeholder="Add a comment or follow-up note" value={comment} onChange={(ev) => setComment(ev.target.value)} />
          <Button className="self-end gap-1.5" disabled={busy || !comment.trim()} onClick={() => void run(async () => { await addEnquiryComment(id, comment); setComment(""); }, "Added")}><Send className="h-4 w-4" /> Add</Button>
        </div>
      </div>
    </div>
  );
}

function quoteToForm(q: BunkerQuote): QuoteForm {
  const s = (v: string | number | null | undefined) => (v == null ? "" : String(v));
  return {
    supplier: q.supplier, contact: s(q.supplier_contact), phone: s(q.supplier_phone), email: s(q.supplier_email), quoteRef: s(q.quote_ref),
    dateRequested: s(q.date_requested), dateReceived: s(q.date_received), fuelType: s(q.fuel_type), quantity: s(q.quantity), unit: q.quantity_unit ?? "MT",
    unitPrice: s(q.unit_price), priceUnit: q.price_unit ?? priceUnitFor(q.quantity_unit), currency: q.currency, total: s(q.total), validUntil: s(q.valid_until),
    deliveryTerms: s(q.delivery_terms), status: q.status, notes: s(q.notes), sharedWithVessel: q.shared_with_vessel,
  };
}

function QuoteEditor({ value: q, onChange, onSave, onCancel, busy }: { value: QuoteForm; onChange: (q: QuoteForm) => void; onSave: () => void; onCancel: () => void; busy: boolean }) {
  const set = <K extends keyof QuoteForm>(k: K, v: QuoteForm[K]) => onChange({ ...q, [k]: v });
  const worked = quoteTotal(q.quantity, q.unit, q.unitPrice, q.priceUnit);
  return (
    <div className="space-y-3 rounded-lg border border-primary/40 bg-primary/5 p-3">
      <h5 className="text-sm font-semibold">Quotation</h5>
      <div className="grid gap-3 sm:grid-cols-3">
        <F label="Supplier"><Input value={q.supplier} onChange={(ev) => set("supplier", ev.target.value)} /></F>
        <F label="Contact"><Input value={q.contact} onChange={(ev) => set("contact", ev.target.value)} /></F>
        <F label="Contact number"><Input value={q.phone} onChange={(ev) => set("phone", ev.target.value)} /></F>
        <F label="Email"><Input type="email" value={q.email} onChange={(ev) => set("email", ev.target.value)} /></F>
        <F label="Quotation reference"><Input value={q.quoteRef} onChange={(ev) => set("quoteRef", ev.target.value)} /></F>
        <F label="Status"><select className={selectCls} value={q.status} onChange={(ev) => set("status", ev.target.value as QuoteStatus)}>{(["requested", "received", "rejected", "expired"] as QuoteStatus[]).map((s) => <option key={s} value={s}>{QUOTE_STATUS_LABEL[s]}</option>)}</select></F>
        <F label="Date requested"><Input type="date" value={q.dateRequested} onChange={(ev) => set("dateRequested", ev.target.value)} /></F>
        <F label="Date received"><Input type="date" value={q.dateReceived} onChange={(ev) => set("dateReceived", ev.target.value)} /></F>
        <F label="Valid until"><Input type="date" value={q.validUntil} onChange={(ev) => set("validUntil", ev.target.value)} /></F>
        <F label="Fuel"><select className={selectCls} value={q.fuelType} onChange={(ev) => set("fuelType", ev.target.value)}><option value="">—</option>{FUEL_TYPES.map((f) => <option key={f}>{f}</option>)}</select></F>
        <F label="Quantity quoted"><Input type="number" inputMode="decimal" value={q.quantity} onChange={(ev) => set("quantity", ev.target.value)} /></F>
        <F label="Unit"><select className={selectCls} value={q.unit} onChange={(ev) => onChange({ ...q, unit: ev.target.value, priceUnit: q.priceUnit === "lump sum" ? q.priceUnit : priceUnitFor(ev.target.value) })}>{UNITS.map((u) => <option key={u.code} value={u.code}>{u.label}</option>)}</select></F>
        <F label="Price"><Input type="number" inputMode="decimal" value={q.unitPrice} onChange={(ev) => set("unitPrice", ev.target.value)} /></F>
        <F label="Price basis"><select className={selectCls} value={q.priceUnit} onChange={(ev) => set("priceUnit", ev.target.value)}>{PRICE_UNITS.map((u) => <option key={u}>{u}</option>)}</select></F>
        <F label="Currency"><select className={selectCls} value={q.currency} onChange={(ev) => set("currency", ev.target.value)}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select></F>
        <F label={worked == null ? "Total quoted" : "Total (worked out)"}><Input type="number" inputMode="decimal" value={q.total} placeholder={worked == null ? "" : String(worked)} onChange={(ev) => set("total", ev.target.value)} /></F>
        <F label="Delivery terms" className="sm:col-span-2"><Input value={q.deliveryTerms} onChange={(ev) => set("deliveryTerms", ev.target.value)} /></F>
      </div>
      <F label="Notes (JLS only)"><Textarea rows={2} value={q.notes} onChange={(ev) => set("notes", ev.target.value)} /></F>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={q.sharedWithVessel} onChange={(ev) => set("sharedWithVessel", ev.target.checked)} />
        <span>Show this quotation to the vessel in the Client Portal <span className="text-muted-foreground">(supplier, quantity, price and total — not the notes). Share only the quotation you want the vessel to approve.</span></span></label>
      <div className="flex gap-2"><Button size="sm" disabled={busy} onClick={onSave}>Save the quotation</Button><Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button></div>
    </div>
  );
}

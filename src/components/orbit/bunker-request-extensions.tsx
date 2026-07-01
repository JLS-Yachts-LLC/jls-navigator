/**
 * BunkerRequestExtensions — rendered inside orbit-request-detail-page.tsx
 * only when req.category === 'FUEL_BUNKERING'. Adds: RFQ quotation-stage
 * details (read-only summary), execution details (Section 2, editable
 * post-assignment), documents/approvals checklists, and entry points into
 * the BDN and Master's Declaration forms. Every other category's rendering
 * in the parent page is untouched.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Check, X, Upload, FileText, ClipboardCheck } from "lucide-react";
import { toast } from "sonner";
import { BunkerDeliveryNoteForm } from "./bunker-delivery-note-form";
import { MastersDeclarationForm } from "./masters-declaration-form";

const db = () => supabase as any;
const BUNKERING_SIDES = ["port", "starboard", "either"];

const DOCUMENT_LABELS: Record<string, string> = {
  masters_declaration: "Master's Declaration",
  fuel_analysis_request: "Fuel Analysis Request",
  safety_checklist: "Safety Checklist",
  delivery_receipt: "Delivery Receipt",
};
const APPROVAL_LABELS: Record<string, string> = {
  captain: "Captain",
  chief_engineer: "Chief Engineer",
  owner_representative: "Owner Representative",
  marina: "Marina",
  port_authority: "Port Authority",
  operations_manager: "Operations Manager",
};

export function BunkerRequestExtensions({ requestId, yachtId }: { requestId: string; yachtId: string | null }) {
  const { user } = useAuth();
  const [view, setView] = useState<"summary" | "bdn" | "declaration">("summary");
  const [rfqDetails, setRfqDetails] = useState<any>(null);
  const [execDetails, setExecDetails] = useState<Record<string, string>>({});
  const [suppliers, setSuppliers] = useState<{ org_id: string; name: string }[]>([]);
  const [documents, setDocuments] = useState<any[]>([]);
  const [approvals, setApprovals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => { void load(); }, [requestId]);
  async function load() {
    setLoading(true);
    const [rfq, exec, sup, docs, appr] = await Promise.all([
      db().from("bunker_rfq_details").select("*").eq("request_id", requestId).maybeSingle(),
      db().from("bunker_execution_details").select("*").eq("request_id", requestId).maybeSingle(),
      db().from("organisations").select("org_id, name").eq("type", "supplier").order("name"),
      db().from("orbit_documents").select("*").eq("request_id", requestId).order("document_type"),
      db().from("orbit_approvals").select("*").eq("request_id", requestId).order("approver_role"),
    ]);
    setRfqDetails(rfq.data ?? null);
    setExecDetails(exec.data ?? {});
    setSuppliers(sup.data ?? []);
    setDocuments(docs.data ?? []);
    setApprovals(appr.data ?? []);
    setLoading(false);
  }

  function setExec(k: string, v: string) { setExecDetails((s) => ({ ...s, [k]: v })); }

  async function saveExecutionDetails() {
    setBusy(true);
    const { error } = await db().rpc("upsert_bunker_execution_details", {
      p_request_id: requestId,
      p_supplier_org_id: execDetails.supplier_org_id || null,
      p_delivery_restrictions: execDetails.delivery_restrictions || null,
      p_hose_connection: execDetails.hose_connection || null,
      p_bunkering_side: execDetails.bunkering_side || null,
      p_site_contact_name: execDetails.site_contact_name || null,
      p_site_contact_phone: execDetails.site_contact_phone || null,
      p_emergency_stop_location: execDetails.emergency_stop_location || null,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Execution details saved");
    await load();
  }

  async function uploadDocument(documentType: string, file: File) {
    setBusy(true);
    const path = `${requestId}/${documentType}-${Date.now()}-${file.name}`;
    const { error: upErr } = await db().storage.from("orbit-documents").upload(path, file);
    if (upErr) { toast.error(upErr.message); setBusy(false); return; }
    const { error } = await db().rpc("add_orbit_document", { p_request_id: requestId, p_document_type: documentType, p_file_path: path });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Document uploaded");
    await load();
  }

  async function reviewApproval(approverRole: string, status: "approved" | "rejected") {
    setBusy(true);
    const { error } = await db().rpc("record_orbit_approval", {
      p_request_id: requestId, p_approver_role: approverRole, p_status: status, p_approved_by_name: user?.email ?? null,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    await load();
  }

  if (view === "bdn") return <BunkerDeliveryNoteForm requestId={requestId} yachtId={yachtId} suppliers={suppliers} onBack={() => { setView("summary"); void load(); }} />;
  if (view === "declaration") return <MastersDeclarationForm requestId={requestId} yachtId={yachtId} onBack={() => { setView("summary"); void load(); }} />;

  if (loading) return <div className="py-6 text-center text-sm text-muted-foreground">Loading bunkering details…</div>;

  return (
    <div className="space-y-5">
      {rfqDetails && (
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="mb-3 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Bunkering — Quotation Info</p>
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
            <div><div className="text-[10px] uppercase text-muted-foreground/60">Location</div>{rfqDetails.location}</div>
            <div><div className="text-[10px] uppercase text-muted-foreground/60">Fuel Grade</div>{rfqDetails.fuel_grade}</div>
            <div><div className="text-[10px] uppercase text-muted-foreground/60">Quantity</div>{rfqDetails.min_quantity ?? "—"}–{rfqDetails.max_quantity ?? "—"} {rfqDetails.quantity_uom}</div>
            <div><div className="text-[10px] uppercase text-muted-foreground/60">Delivery Date</div>{rfqDetails.delivery_date ?? "—"}</div>
            <div><div className="text-[10px] uppercase text-muted-foreground/60">Billing Entity</div>{rfqDetails.billing_entity ?? "—"}</div>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-border bg-card p-4">
        <p className="mb-3 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Execution Details (Section 2)</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="space-y-1.5"><Label className="text-xs">Supplier</Label>
            <Select value={execDetails.supplier_org_id ?? "__none"} onValueChange={(v) => setExec("supplier_org_id", v === "__none" ? "" : v)}>
              <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select…" /></SelectTrigger>
              <SelectContent><SelectItem value="__none">— None —</SelectItem>{suppliers.map((s) => <SelectItem key={s.org_id} value={s.org_id}>{s.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label className="text-xs">Hose Connection</Label><Input value={execDetails.hose_connection ?? ""} onChange={(e) => setExec("hose_connection", e.target.value)} className="h-8" /></div>
          <div className="space-y-1.5"><Label className="text-xs">Bunkering Side</Label>
            <Select value={execDetails.bunkering_side ?? ""} onValueChange={(v) => setExec("bunkering_side", v)}>
              <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select…" /></SelectTrigger>
              <SelectContent>{BUNKERING_SIDES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label className="text-xs">Site Contact Name</Label><Input value={execDetails.site_contact_name ?? ""} onChange={(e) => setExec("site_contact_name", e.target.value)} className="h-8" /></div>
          <div className="space-y-1.5"><Label className="text-xs">Site Contact Phone</Label><Input value={execDetails.site_contact_phone ?? ""} onChange={(e) => setExec("site_contact_phone", e.target.value)} className="h-8" /></div>
          <div className="space-y-1.5"><Label className="text-xs">Emergency Stop Location</Label><Input value={execDetails.emergency_stop_location ?? ""} onChange={(e) => setExec("emergency_stop_location", e.target.value)} className="h-8" /></div>
          <div className="space-y-1.5 sm:col-span-3"><Label className="text-xs">Delivery Restrictions</Label><Input value={execDetails.delivery_restrictions ?? ""} onChange={(e) => setExec("delivery_restrictions", e.target.value)} className="h-8" /></div>
        </div>
        <Button size="sm" className="mt-3" onClick={saveExecutionDetails} disabled={busy}>Save Execution Details</Button>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="mb-3 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Supporting Documents</p>
          <div className="space-y-2">
            {documents.map((d) => (
              <div key={d.id} className="flex items-center justify-between text-sm">
                <span>{DOCUMENT_LABELS[d.document_type] ?? d.document_type}{d.is_required && <span className="ml-1 text-destructive">*</span>}</span>
                {d.file_path ? (
                  <span className="text-xs text-emerald-600">Uploaded</span>
                ) : (
                  <label className="cursor-pointer text-xs text-primary hover:underline">
                    <Upload className="mr-1 inline h-3 w-3" />Upload
                    <input type="file" className="hidden" onChange={(e) => e.target.files?.[0] && uploadDocument(d.document_type, e.target.files[0])} />
                  </label>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-4">
          <p className="mb-3 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Approvals</p>
          <div className="space-y-2">
            {approvals.map((a) => (
              <div key={a.id} className="flex items-center justify-between text-sm">
                <span>{APPROVAL_LABELS[a.approver_role] ?? a.approver_role}</span>
                {a.status === "pending" ? (
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" className="h-6 gap-1 px-2 text-[10px] text-emerald-600" disabled={busy} onClick={() => reviewApproval(a.approver_role, "approved")}><Check className="h-3 w-3" /> Approve</Button>
                    <Button size="sm" variant="outline" className="h-6 gap-1 px-2 text-[10px] text-destructive" disabled={busy} onClick={() => reviewApproval(a.approver_role, "rejected")}><X className="h-3 w-3" /> Reject</Button>
                  </div>
                ) : (
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${a.status === "approved" ? "bg-emerald-500/15 text-emerald-600" : "bg-red-500/15 text-red-500"}`}>{a.status}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex gap-3">
        <Button variant="outline" className="gap-1.5" onClick={() => setView("bdn")}><FileText className="h-4 w-4" /> Bunker Delivery Note</Button>
        <Button variant="outline" className="gap-1.5" onClick={() => setView("declaration")}><ClipboardCheck className="h-4 w-4" /> Master's Declaration</Button>
      </div>
    </div>
  );
}

export default BunkerRequestExtensions;

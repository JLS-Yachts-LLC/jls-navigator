import { useState, useEffect } from "react";
import { useParams, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { DateInputDMY } from "@/components/ui/date-input-dmy";
import { SignedAnchor } from "@/components/ui/signed-file";
import { ArrowLeft, Loader2, Pencil, Trash2, ExternalLink, Upload, IdCard, FileCheck2 } from "lucide-react";
import { toast } from "sonner";
import { cn, toDMY } from "@/lib/utils";
import { fileToBase64 } from "@/lib/file-to-base64";
import { uploadCrewDocToSharePoint } from "@/lib/visa-sharepoint.server";

type Visa = Record<string, any>;

const STATUS_META: Record<string, { label: string; cls: string }> = {
  draft:        { label: "Draft",       cls: "bg-slate-500/15 text-slate-400" },
  pending_docs: { label: "Pending Docs",cls: "bg-amber-500/15 text-amber-400" },
  submitted:    { label: "Submitted",   cls: "bg-blue-500/15 text-blue-400" },
  in_review:    { label: "In Review",   cls: "bg-amber-500/15 text-amber-400" },
  processing:   { label: "Processing",  cls: "bg-violet-500/15 text-violet-400" },
  approved:     { label: "Approved",    cls: "bg-emerald-500/15 text-emerald-400" },
  completed:    { label: "Completed",   cls: "bg-teal-500/15 text-teal-400" },
  rejected:     { label: "Rejected",    cls: "bg-red-500/15 text-red-400" },
  cancelled:    { label: "Cancelled",   cls: "bg-slate-500/15 text-slate-300" },
};
const STATUSES = ["draft", "submitted", "in_review", "processing", "approved", "completed", "cancelled", "rejected"];

// dd/mm/yyyy to match the UAE immigration portal.
function fmt(d: string | null) {
  return toDMY(d);
}

export function VisaDetailPage() {
  const { id } = useParams({ from: "/_app/crew-immigration/visas/$id" });
  const navigate = useNavigate();
  const [visa, setVisa] = useState<Visa | null>(null);
  const [vesselName, setVesselName] = useState<string>("—");
  const [yachtNames, setYachtNames] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState<Visa>({});
  const [busy, setBusy] = useState(false);
  const [del, setDel] = useState(false);
  const [attaching, setAttaching] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  // Cross-linked data: latest sign-on/off from crew_signon_events + passport documents.
  const [signOn, setSignOn] = useState<string | null>(null);
  const [signOff, setSignOff] = useState<string | null>(null);
  const [docs, setDocs] = useState<Record<string, string | null> | null>(null);

  // Attach the issued visa: store it, mark the application Approved, and file the
  // document into the SharePoint crew folder automatically (best-effort).
  async function attachVisaFile(file: File | null) {
    if (!file) return;
    setAttaching(true);
    try {
      const db = supabase as any;
      const ext = file.name.split(".").pop() || "pdf";
      const path = `visa/${id}/visa-document.${ext}`;
      const { error: upErr } = await supabase.storage.from("permit-documents").upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const url = supabase.storage.from("permit-documents").getPublicUrl(path).data.publicUrl;
      const base64 = await fileToBase64(file);
      const patch: any = { visa_document_url: url, status: "approved", approved_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      // OCR the visa to auto-fill its number, issuance, expiry and entry deadline.
      try {
        const r = await fetch("/api/visa/passport-ocr", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageBase64: base64, mediaType: file.type, docType: "visa" }),
        });
        const j = await r.json();
        if (j.ok && j.data) {
          const d = j.data;
          // Safety: confirm the visa's holder name matches this crew member, so the
          // wrong visa isn't filed against someone.
          const crewFull = [visa?.given_name, visa?.surname].filter(Boolean).join(" ").trim().toLowerCase();
          const visaFull = (d.holder_name || [d.given_names, d.surname].filter(Boolean).join(" ")).trim().toLowerCase();
          if (crewFull && visaFull) {
            const toks = (s: string) => new Set(s.split(/\s+/).filter((t: string) => t.length > 1));
            const a = toks(crewFull); const b = toks(visaFull);
            const overlap = [...a].filter((t) => b.has(t)).length;
            if (overlap === 0) {
              const ok = window.confirm(`⚠ Name mismatch\n\nThis visa appears to be for "${d.holder_name ?? visaFull}", but the crew member is "${[visa?.given_name, visa?.surname].filter(Boolean).join(" ")}".\n\nUpload anyway?`);
              if (!ok) { toast.error("Upload cancelled — visa name did not match the crew member"); setAttaching(false); return; }
            }
          }
          if (d.visa_number) patch.visa_number = d.visa_number;
          if (d.issue_date) patch.visa_issuance_date = d.issue_date;
          if (d.expiry_date) patch.visa_expiry = d.expiry_date;
          if (d.first_entry_expiry) patch.first_entry_expiry = d.first_entry_expiry;
          if (d.visa_type && !visa?.visa_type) patch.visa_type = d.visa_type;
          toast.success("Visa scanned — details auto-filled");
        }
      } catch { /* OCR is best-effort */ }
      const { error } = await db.from("visa_applications").update(patch).eq("id", id);
      if (error) throw error;
      setVisa(v => ({ ...v!, ...patch }));
      toast.success("Visa attached — application moved to Approved");
      // File into SharePoint: Shared Documents / Yacht / {vessel} / Crew Documents / {crew}.
      try {
        const crewName = [visa?.given_name, visa?.surname].filter(Boolean).join(" ") || "Unknown Crew";
        await (uploadCrewDocToSharePoint as any)({
          data: { vesselName: visa?.vessel_name ?? (vesselName !== "—" ? vesselName : null), crewName, fileName: `Visa - ${file.name}`, contentType: file.type, base64 },
        });
        toast.success("Filed in the SharePoint crew folder");
      } catch (spErr) {
        toast.warning(`Saved, but SharePoint filing failed: ${spErr instanceof Error ? spErr.message : "unknown error"}`);
      }
      pushExcel();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not attach the visa");
    } finally {
      setAttaching(false);
    }
  }

  async function deleteVisaFile() {
    if (!window.confirm("Remove the attached visa document? The application will revert to Submitted.")) return;
    const { error } = await (supabase as any).from("visa_applications")
      .update({ visa_document_url: null, status: "submitted", updated_at: new Date().toISOString() }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    setVisa(v => ({ ...v!, visa_document_url: null, status: "submitted" }));
    toast.success("Visa document removed");
  }

  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [id]);

  async function load() {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("visa_applications")
      .select("*, yachts(vessel_name)")
      .eq("id", id)
      .maybeSingle();
    if (error || !data) { toast.error("Application not found"); navigate({ to: "/crew-immigration/visas" }); return; }
    setVisa(data);
    setVesselName(data.vessel_name ?? data.yachts?.vessel_name ?? "—");
    setLoading(false);

    // Cross-link: pull the latest sign-on/sign-off and the passport documents so
    // this page reflects data entered elsewhere (no double-handling).
    const crewId = (data as any).crew_member_id;
    if (crewId) {
      const db2 = supabase as any;
      const [{ data: events }, { data: pp }] = await Promise.all([
        db2.from("crew_signon_events").select("event_type, event_date").eq("crew_member_id", crewId).order("event_date", { ascending: false, nullsFirst: false }),
        (data as any).selected_passport_id
          ? db2.from("crew_passports").select("document_url, cover_url, headshot_url, seamans_book_url, crew_verification_letter_url").eq("id", (data as any).selected_passport_id).maybeSingle()
          : db2.from("crew_passports").select("document_url, cover_url, headshot_url, seamans_book_url, crew_verification_letter_url").eq("crew_id", crewId).order("is_primary", { ascending: false }).limit(1).maybeSingle(),
      ]);
      setSignOn((events ?? []).find((e: any) => e.event_type === "sign_on")?.event_date ?? null);
      setSignOff((events ?? []).find((e: any) => e.event_type === "sign_off")?.event_date ?? null);
      setDocs(pp ?? null);
    }
    (supabase as any).from("yachts").select("vessel_name").not("vessel_name", "is", null).order("vessel_name")
      .then(({ data: ys }: { data: { vessel_name: string }[] | null }) =>
        setYachtNames(Array.from(new Set((ys ?? []).map(y => y.vessel_name).filter(Boolean))) as string[]));
  }

  function pushExcel() {
    fetch("/api/visa/excel-push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) }).catch(() => {});
  }

  async function setStatus(status: string) {
    const label = (STATUS_META[status]?.label ?? status);
    if (!window.confirm(`Change this application's status to "${label}"?`)) return;
    const patch: any = { status, updated_at: new Date().toISOString() };
    if (status === "submitted") patch.submitted_at = new Date().toISOString();
    if (status === "approved")  patch.approved_at = new Date().toISOString();
    if (status === "completed") patch.completed_at = new Date().toISOString();
    const { error } = await (supabase as any).from("visa_applications").update(patch).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Status updated"); setVisa(v => ({ ...v!, ...patch })); pushExcel();
  }

  function openEdit() {
    setForm({
      vessel_name: visa?.vessel_name ?? (vesselName !== "—" ? vesselName : ""),
      nationality: visa?.nationality ?? "", passport_number: visa?.passport_number ?? "",
      visa_number: visa?.visa_number ?? "", rank_rating: visa?.rank_rating ?? "",
      visa_issuance_date: visa?.visa_issuance_date ?? "", visa_expiry: visa?.visa_expiry ?? "",
      sign_on_date: visa?.sign_on_date ?? "", sign_off_date: visa?.sign_off_date ?? "",
      application_notes: visa?.application_notes ?? "",
    });
    setEditOpen(true);
  }

  async function saveEdit() {
    setBusy(true);
    const patch: any = { ...form, updated_at: new Date().toISOString() };
    for (const k of Object.keys(patch)) if (patch[k] === "") patch[k] = null;
    // Link the typed vessel name to a yacht row when it matches one.
    if (patch.vessel_name) {
      const { data: y } = await (supabase as any)
        .from("yachts").select("id").ilike("vessel_name", patch.vessel_name).limit(1).maybeSingle();
      patch.yacht_id = y?.id ?? null;
    }
    const { error } = await (supabase as any).from("visa_applications").update(patch).eq("id", id);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Saved"); setEditOpen(false);
    setVisa(v => ({ ...v!, ...patch }));
    setVesselName(patch.vessel_name ?? "—");
    pushExcel();
  }

  async function confirmDelete() {
    const { error } = await (supabase as any).from("visa_applications").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Application deleted"); navigate({ to: "/crew-immigration/visas" });
  }

  if (loading || !visa) {
    return <div className="flex h-full items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  const name = [visa.given_name, visa.surname].filter(Boolean).join(" ") || visa.application_notes?.split("\n")[0] || "—";
  const sm = STATUS_META[visa.status] ?? STATUS_META.draft;

  const rows: [string, React.ReactNode][] = [
    ["Crew Member", name],
    ["Vessel", vesselName],
    ["Destination", visa.country_code ?? visa.destination_country ?? "—"],
    ["Visa Type", visa.visa_type ?? "—"],
    ["Nationality", visa.nationality ?? "—"],
    ["Passport No.", visa.passport_number ?? "—"],
    ["Rank / Rating", visa.rank_rating ?? "—"],
    ["Visa Reference", visa.visa_number ?? "—"],
    ["Visa Issuance", fmt(visa.visa_issuance_date)],
    ["Visa Expiry", fmt(visa.visa_expiry)],
    ["1st Entry Expiry", fmt(visa.first_entry_expiry)],
    ["Arrival", fmt(visa.arrival_date)],
    ["Sign On", fmt(signOn ?? visa.sign_on_date)],
    ["Sign Off", fmt(signOff ?? visa.sign_off_date)],
    ["Submitted", fmt(visa.submitted_at?.slice(0, 10))],
  ];

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-border/70 bg-card/30 px-6 py-3.5">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/crew-immigration/visas" })} className="h-8 gap-1.5"><ArrowLeft className="h-4 w-4" /> Back</Button>
          <div>
            <div className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground/60">Visa Application</div>
            <h1 className="mt-0.5 font-display text-[1.2rem] font-semibold tracking-tight">{name}</h1>
          </div>
          <span className={cn("ml-2 rounded-full px-2.5 py-0.5 text-[11px] font-semibold", sm.cls)}>{sm.label}</span>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={openEdit} className="h-8 gap-1.5"><Pencil className="h-3.5 w-3.5" /> Edit</Button>
          <Button size="sm" variant="outline" onClick={() => navigate({ to: `/crew-immigration/visas/new?draft=${id}` as any })} className="h-8 gap-1.5"><IdCard className="h-3.5 w-3.5" /> Edit Passport</Button>
          <Button size="sm" variant="outline" onClick={() => setDel(true)} className="h-8 gap-1.5 text-destructive hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /> Delete</Button>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-6">
        <div className="grid max-w-3xl gap-6 md:grid-cols-[1fr_240px]">
          {/* Details */}
          <div className="rounded-xl border border-border bg-card/60 divide-y divide-border/40 overflow-hidden">
            {rows.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 px-4 py-2.5 text-sm">
                <span className="text-muted-foreground">{k}</span>
                <span className="font-medium text-right">{v}</span>
              </div>
            ))}
            {visa.visa_document_url && (
              <SignedAnchor stored={visa.visa_document_url} className="flex items-center gap-1.5 px-4 py-2.5 text-sm text-primary hover:underline">
                <ExternalLink className="h-3.5 w-3.5" /> Visa document
              </SignedAnchor>
            )}
            {docs && (() => {
              const items: [string, string | null][] = [
                ["Passport — inside pages", docs.document_url],
                ["Passport — cover", docs.cover_url],
                ["Headshot photo", docs.headshot_url],
                docs.crew_verification_letter_url
                  ? ["Crew verification letter", docs.crew_verification_letter_url]
                  : ["Seaman's book", docs.seamans_book_url],
              ];
              const present = items.filter(([, u]) => !!u);
              if (present.length === 0) return null;
              return (
                <div className="px-4 py-3">
                  <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">Documents</div>
                  <div className="flex flex-col gap-1">
                    {present.map(([label, u]) => (
                      <SignedAnchor key={label} stored={u!} className="flex items-center gap-1.5 text-[13px] text-primary hover:underline">
                        <ExternalLink className="h-3.5 w-3.5" /> {label}
                      </SignedAnchor>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Status pipeline */}
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 mb-2">Update Status</div>
            <div className="grid grid-cols-2 gap-1.5">
              {STATUSES.filter(s => s !== visa.status).map(s => {
                const m = STATUS_META[s];
                return (
                  <button key={s} onClick={() => setStatus(s)}
                    className={cn("rounded-lg px-2.5 py-1.5 text-[11px] font-semibold border border-transparent transition hover:opacity-90", m.cls)}>
                    → {m.label}
                  </button>
                );
              })}
            </div>

            {/* Issued visa — attached state (view/replace/delete) or dropzone */}
            <div className="mt-5">
              <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 mb-2">Issued Visa</div>
              {visa.visa_document_url ? (
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3">
                  <div className="flex items-center gap-2">
                    <FileCheck2 className="h-5 w-5 shrink-0 text-emerald-500" />
                    <div className="min-w-0 flex-1">
                      <div className="text-[12.5px] font-medium">Visa attached</div>
                      <SignedAnchor stored={visa.visa_document_url} className="text-[11px] text-primary hover:underline">View visa document</SignedAnchor>
                    </div>
                  </div>
                  <div className="mt-2.5 flex gap-2">
                    <button onClick={() => !attaching && document.getElementById("visa-attach-input")?.click()}
                      className="flex-1 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-medium hover:bg-accent">
                      {attaching ? "Uploading…" : "Replace"}
                    </button>
                    <button onClick={deleteVisaFile}
                      className="flex-1 rounded-lg border border-destructive/30 px-2.5 py-1.5 text-[11px] font-medium text-destructive hover:bg-destructive/10">
                      Delete
                    </button>
                  </div>
                  <input id="visa-attach-input" type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden"
                    onChange={e => { void attachVisaFile(e.target.files?.[0] ?? null); e.target.value = ""; }} />
                </div>
              ) : (
                <div
                  onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={e => { e.preventDefault(); setDragOver(false); void attachVisaFile(e.dataTransfer.files?.[0] ?? null); }}
                  onClick={() => !attaching && document.getElementById("visa-attach-input")?.click()}
                  className={cn(
                    "flex flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed px-3 py-5 text-center transition",
                    attaching ? "cursor-wait" : "cursor-pointer",
                    dragOver ? "border-primary bg-primary/10" : "border-border hover:border-primary/50",
                  )}
                >
                  {attaching
                    ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    : <Upload className="h-5 w-5 text-primary" />}
                  <span className="text-[12px] font-medium">{attaching ? "Uploading…" : "Drag the visa here, or click"}</span>
                  <span className="text-[10.5px] leading-snug text-muted-foreground">Drop a file from Outlook or your PC — it's filed into the crew folder, name-checked, and the application is marked Approved.</span>
                  <input id="visa-attach-input" type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden"
                    onChange={e => { void attachVisaFile(e.target.files?.[0] ?? null); e.target.value = ""; }} />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Edit dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>Edit Visa Application</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            <div className="col-span-2 space-y-1.5">
              <Label className="text-xs">Vessel</Label>
              <Input
                value={form.vessel_name ?? ""}
                onChange={e => setForm(f => ({ ...f, vessel_name: e.target.value }))}
                list="visa-edit-vessels"
                placeholder="Start typing a vessel name…"
                className="h-9"
              />
              <datalist id="visa-edit-vessels">
                {yachtNames.map(n => <option key={n} value={n} />)}
              </datalist>
            </div>
            <div className="space-y-1.5"><Label className="text-xs">Nationality</Label><Input value={form.nationality} onChange={e => setForm(f => ({ ...f, nationality: e.target.value }))} className="h-9" /></div>
            <div className="space-y-1.5"><Label className="text-xs">Passport No.</Label><Input value={form.passport_number} onChange={e => setForm(f => ({ ...f, passport_number: e.target.value }))} className="h-9" /></div>
            <div className="space-y-1.5"><Label className="text-xs">Visa Reference</Label><Input value={form.visa_number} onChange={e => setForm(f => ({ ...f, visa_number: e.target.value }))} className="h-9" /></div>
            <div className="space-y-1.5"><Label className="text-xs">Rank / Rating</Label><Input value={form.rank_rating} onChange={e => setForm(f => ({ ...f, rank_rating: e.target.value }))} className="h-9" /></div>
            <div className="space-y-1.5"><Label className="text-xs">Visa Issuance</Label><DateInputDMY value={form.visa_issuance_date} onChange={v => setForm(f => ({ ...f, visa_issuance_date: v }))} style={{ height: 36, width: "100%", borderRadius: 8, border: "1px solid var(--border)", background: "var(--background)", color: "var(--foreground)", padding: "0 10px", fontSize: 14 }} /></div>
            <div className="space-y-1.5"><Label className="text-xs">Visa Expiry</Label><DateInputDMY value={form.visa_expiry} onChange={v => setForm(f => ({ ...f, visa_expiry: v }))} style={{ height: 36, width: "100%", borderRadius: 8, border: "1px solid var(--border)", background: "var(--background)", color: "var(--foreground)", padding: "0 10px", fontSize: 14 }} /></div>
            <div className="space-y-1.5"><Label className="text-xs">Sign On</Label><DateInputDMY value={form.sign_on_date} onChange={v => setForm(f => ({ ...f, sign_on_date: v }))} style={{ height: 36, width: "100%", borderRadius: 8, border: "1px solid var(--border)", background: "var(--background)", color: "var(--foreground)", padding: "0 10px", fontSize: 14 }} /></div>
            <div className="space-y-1.5"><Label className="text-xs">Sign Off</Label><DateInputDMY value={form.sign_off_date} onChange={v => setForm(f => ({ ...f, sign_off_date: v }))} style={{ height: 36, width: "100%", borderRadius: 8, border: "1px solid var(--border)", background: "var(--background)", color: "var(--foreground)", padding: "0 10px", fontSize: 14 }} /></div>
            <div className="col-span-2 space-y-1.5"><Label className="text-xs">Notes</Label><Textarea rows={2} value={form.application_notes} onChange={e => setForm(f => ({ ...f, application_notes: e.target.value }))} className="resize-none text-sm" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)} disabled={busy}>Cancel</Button>
            <Button onClick={saveEdit} disabled={busy} className="gap-1.5">{busy && <Loader2 className="h-4 w-4 animate-spin" />} Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={del} onOpenChange={setDel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete application?</AlertDialogTitle>
            <AlertDialogDescription>The visa application for <strong>{name}</strong> will be permanently deleted.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

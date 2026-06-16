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
import { ArrowLeft, Loader2, Pencil, Trash2, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

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

function fmt(d: string | null) {
  if (!d) return "—";
  return new Date(d + "T00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function VisaDetailPage() {
  const { id } = useParams({ from: "/_app/crew-immigration/visas/$id" });
  const navigate = useNavigate();
  const [visa, setVisa] = useState<Visa | null>(null);
  const [vesselName, setVesselName] = useState<string>("—");
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState<Visa>({});
  const [busy, setBusy] = useState(false);
  const [del, setDel] = useState(false);

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
    setVesselName(data.yachts?.vessel_name ?? "—");
    setLoading(false);
  }

  function pushExcel() {
    fetch("/api/visa/excel-push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) }).catch(() => {});
  }

  async function setStatus(status: string) {
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
    const { error } = await (supabase as any).from("visa_applications").update(patch).eq("id", id);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Saved"); setEditOpen(false); setVisa(v => ({ ...v!, ...patch })); pushExcel();
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
    ["Sign On", fmt(visa.sign_on_date)],
    ["Sign Off", fmt(visa.sign_off_date)],
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
          </div>
        </div>
      </div>

      {/* Edit dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>Edit Visa Application</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
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

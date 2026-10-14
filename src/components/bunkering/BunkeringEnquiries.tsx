/**
 * Bunkering enquiries — one record for each enquiry, from the yacht's request through the supplier quotations to the vessel's
 * approval and the delivery. Anyone on staff can log one and read them all; the Agency team manages the quotations and the status.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Fuel, Loader2, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth";
import { useAccess } from "@/lib/auth/useAccess";
import { cn } from "@/lib/utils";
import { errorMessage } from "@/lib/error-message";
import { STATUS_LABEL, OPEN_STATUSES, DOC_TYPES, emptyEnquiry, unitLabel, enquiryProblems, type EnquiryForm, type EnquiryStatus } from "@/lib/bunkering/model";
import { loadEnquiries, createEnquiry, type BunkerEnquiry } from "@/lib/bunkering/data";
import type { PendingFile } from "@/lib/warehouse/requests";
import { FilePicker } from "@/components/shipsync/warehouse/request-form";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/fetch-all";
import { EnquiryFormView, DeclarationBox, type DeclarationHandle, type YachtOption } from "./enquiry-form";
import { EnquiryDetailView, StatusBadge } from "./enquiry-detail";

const day = (d: string | null) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "—");

export function BunkeringEnquiries({ openNumber }: { openNumber?: string }) {
  const { user } = useAuth();
  const { canAccessModule } = useAccess();
  const isAgency = canAccessModule("agency", "edit");

  const [rows, setRows] = useState<BunkerEnquiry[] | null>(null);
  const [show, setShow] = useState<"open" | "all" | "mine">("open");
  const [status, setStatus] = useState<EnquiryStatus | "all">("all");
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<EnquiryForm>(emptyEnquiry());
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [saving, setSaving] = useState(false);
  const decl = useRef<DeclarationHandle>(null);

  const [yachts, setYachts] = useState<YachtOption[]>([]);
  useEffect(() => {
    // The yachts the form offers (and links the enquiry to). Not being able to load them only means no yacht is offered.
    void fetchAllRows(() => (supabase as any).from("yachts").select("id, vessel_name, flag").order("vessel_name"))
      .then((r: { data: YachtOption[] | null }) => setYachts(r.data ?? [])).catch(() => {});
  }, []);

  const reload = useCallback(async () => { setRows(await loadEnquiries()); }, []);
  useEffect(() => { void reload().catch((e) => toast.error(errorMessage(e, "Could not load the enquiries"))); }, [reload]);
  useEffect(() => {
    if (!openNumber || !rows) return;
    const hit = rows.find((r) => r.number.toLowerCase() === openNumber.toLowerCase());
    if (hit) setOpenId(hit.id);
  }, [openNumber, rows]);

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (rows ?? []).filter((r) =>
      (status === "all" || r.status === status)
      && (show === "all" || (show === "open" ? OPEN_STATUSES.includes(r.status) : r.created_by === user?.id))
      && (!t || [r.number, r.yacht_name, r.port, r.fuel_type, r.captain_name, r.created_by_name].some((v) => (v ?? "").toLowerCase().includes(t))));
  }, [rows, status, show, q, user?.id]);

  async function submit() {
    const problems = enquiryProblems(form);
    if (problems.length) { toast.error(problems[0], { description: problems.length > 1 ? `…and ${problems.length - 1} more to fix.` : undefined }); return; }
    setSaving(true);
    try {
      let declaration = null;
      try { declaration = (await decl.current?.read()) ?? null; }
      catch (e) { toast.error(errorMessage(e, "Check the vessel's confirmation")); setSaving(false); return; }
      const made = await createEnquiry(form, files, declaration);
      toast.success(`${made.number} logged`, { description: declaration ? "The vessel's confirmation is recorded." : "Record the vessel's confirmation before it goes to suppliers." });
      setCreating(false);
      await reload();
      setOpenId(made.id);
    } catch (e) { toast.error(errorMessage(e, "Could not log the enquiry")); }
    finally { setSaving(false); }
  }

  return (
    <div className="flex h-full min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button className="gap-1.5" onClick={() => { setForm(emptyEnquiry()); setFiles([]); setCreating(true); }}><Plus className="h-4 w-4" /><Fuel className="h-4 w-4" /> New bunkering enquiry</Button>
        <div className="flex gap-1 rounded-lg border border-border bg-card/50 p-1">
          {([["open", "Open"], ["mine", "Mine"], ["all", "All"]] as const).map(([k, l]) => (
            <button key={k} type="button" onClick={() => setShow(k)} className={cn("rounded-md px-3 py-1.5 text-sm font-medium", show === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>{l}</button>
          ))}
        </div>
        <select className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={status} onChange={(e) => setStatus(e.target.value as EnquiryStatus | "all")} aria-label="Status">
          <option value="all">Any status</option>{(Object.keys(STATUS_LABEL) as EnquiryStatus[]).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
        <div className="relative"><Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="h-9 w-64 pl-8" placeholder="Number, yacht, port, fuel…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        {rows && <span className="text-sm text-muted-foreground">{shown.length} of {rows.length}</span>}
      </div>

      {rows === null ? <div className="flex h-32 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div> : shown.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">{rows.length === 0 ? "No bunkering enquiries yet. Use the button above to log the first." : "Nothing matches these filters."}</p>
      ) : (
        <ul className="min-h-0 flex-1 space-y-2 overflow-auto">
          {shown.map((r) => (
            <li key={r.id}>
              <button type="button" onClick={() => setOpenId(r.id)} className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-border bg-card px-4 py-3 text-left hover:border-primary">
                <Fuel className="h-5 w-5 text-muted-foreground" />
                <span className="font-mono text-sm font-semibold text-primary">{r.number}</span>
                <StatusBadge status={r.status} />
                <span className="text-sm font-medium">{r.yacht_name}</span>
                <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{[r.fuel_type === "Other" ? r.fuel_other : r.fuel_type, r.quantity ? `${r.quantity} ${unitLabel(r.quantity_unit)}` : null, r.port].filter(Boolean).join(" · ")}</span>
                <span className="text-sm text-muted-foreground">{day(r.preferred_date)}</span>
                <span className="text-sm text-muted-foreground">{r.declared_by_name ? "Vessel confirmed" : "Awaiting vessel confirmation"}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={creating} onOpenChange={(o) => { if (!o && !saving) setCreating(false); }}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader><DialogTitle>New bunkering enquiry</DialogTitle></DialogHeader>
          {creating && <>
            <EnquiryFormView value={form} onChange={setForm} yachts={yachts} />
            <DeclarationBox ref={decl} optional defaultName={form.captain} />
            <div className="space-y-1.5"><h4 className="text-sm font-semibold">Documents and photos</h4>
              <FilePicker files={files} onChange={setFiles} docTypes={DOC_TYPES} hint="The vessel's request, a signed form, email or WhatsApp confirmation, anything that helps the quotation." /></div>
            <div className="flex justify-end gap-2 border-t border-border pt-3">
              <Button variant="ghost" disabled={saving} onClick={() => setCreating(false)}>Cancel</Button>
              <Button disabled={saving} onClick={() => void submit()}>{saving ? "Saving…" : "Log the enquiry"}</Button>
            </div>
          </>}
        </DialogContent>
      </Dialog>

      <Dialog open={!!openId} onOpenChange={(o) => { if (!o) setOpenId(null); }}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
          <DialogHeader><DialogTitle>{rows?.find((r) => r.id === openId) ? `${rows.find((r) => r.id === openId)!.number} · ${rows.find((r) => r.id === openId)!.yacht_name}` : "Bunkering enquiry"}</DialogTitle></DialogHeader>
          {openId && <EnquiryDetailView id={openId} isAgency={isAgency} myId={user?.id ?? null} onChanged={() => void reload()} yachts={yachts} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

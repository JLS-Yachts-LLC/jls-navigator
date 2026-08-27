import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DateInputDMY } from "@/components/ui/date-input-dmy";
import { UploadCloud, Loader2, AlertTriangle, CheckCircle2, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/**
 * Import a vessel's own sign on/off sheet (CSV, PDF or a photo of it).
 *
 * The file is read on the worker, which returns MATCH PROPOSALS only — nothing is
 * written until the movements are confirmed here. Rows that need a decision (no
 * crew profile, unreadable date, missing sign on/off) are surfaced and can be
 * corrected inline; anything already in Polaris is flagged and unticked so a
 * re-sent sheet cannot create duplicates.
 */

type Candidate = { id: string; name: string };
type Proposal = {
  name: string;
  event_type: "sign_on" | "sign_off" | null;
  event_date: string | null;
  date_raw: string | null;
  port: string | null;
  vessel: string | null;
  rank: string | null;
  ambiguous_date: boolean;
  crew: { id: string; name: string; yacht_id: string | null } | null;
  candidates: Candidate[];
  yacht: { id: string; name: string } | null;
  duplicate: boolean;
  note: string | null;
};
type Row = Proposal & { include: boolean; crewId: string | null };

const fileToBase64 = (f: File) =>
  new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(",")[1] ?? "");
    r.onerror = () => rej(new Error("Could not read the file"));
    r.readAsDataURL(f);
  });

export function MovementImportDialog({ open, onClose, onImported, yachtId, crew, yachts }: {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
  /** Vessel currently filtered on the page — used when the sheet doesn't name one. */
  yachtId: string | null;
  crew: Array<{ id: string; first_name: string | null; last_name: string | null }>;
  yachts: Array<{ id: string; vessel_name: string }>;
}) {
  const { user, session } = useAuth();
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [fileName, setFileName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function reset() {
    setRows(null); setWarnings([]); setFileName(""); setBusy(false); setImporting(false);
  }

  async function handleFile(file: File | null) {
    if (!file) return;
    setBusy(true); setRows(null); setWarnings([]); setFileName(file.name);
    try {
      const isText = /\.(csv|tsv|txt)$/i.test(file.name) || file.type.startsWith("text/");
      const body: any = { yacht_id: yachtId };
      if (isText) body.csvText = await file.text();
      else { body.fileBase64 = await fileToBase64(file); body.mediaType = file.type || "application/pdf"; }

      const res = await fetch("/api/movements/import", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${(session as any)?.access_token ?? ""}` },
        body: JSON.stringify(body),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error ?? "Could not read that file");

      setWarnings(j.warnings ?? []);
      setRows(((j.rows ?? []) as Proposal[]).map((p) => ({
        ...p,
        crewId: p.crew?.id ?? null,
        // Only rows that are complete and not already recorded start ticked.
        include: !!p.crew && !!p.event_date && !!p.event_type && !p.duplicate,
      })));
      if (!j.rows?.length) toast.warning("No movements were found in that file");
    } catch (e: any) {
      toast.error(e.message ?? "Could not read that file");
    } finally { setBusy(false); }
  }

  const set = (i: number, patch: Partial<Row>) =>
    setRows((prev) => prev?.map((r, idx) => (idx === i ? { ...r, ...patch } : r)) ?? prev);

  const ready = (rows ?? []).filter((r) => r.include && r.crewId && r.event_date && r.event_type);

  async function runImport() {
    if (!ready.length) return;
    setImporting(true);
    try {
      // Insert through the same table the manual form uses, so the propagation
      // trigger, crew status and timeline all behave identically.
      const payload = ready.map((r) => ({
        crew_member_id: r.crewId,
        yacht_id: r.yacht?.id ?? yachtId ?? null,
        event_type: r.event_type,
        event_date: r.event_date,
        port: r.port || null,
        notes: `Imported from vessel sheet${fileName ? ` (${fileName})` : ""}`,
        created_by: user?.id ?? null,
      }));
      const { error } = await (supabase as any).from("crew_signon_events").insert(payload);
      if (error) throw error;

      // Keep crew status in step, newest movement per crew member winning.
      const latest = new Map<string, string>();
      for (const r of [...ready].sort((a, b) => String(a.event_date).localeCompare(String(b.event_date)))) {
        latest.set(r.crewId!, r.event_type!);
      }
      await Promise.all([...latest.entries()].map(([id, type]) =>
        (supabase as any).from("crew_members")
          .update({ status: type === "sign_on" ? "active" : "off_signed", updated_at: new Date().toISOString() })
          .eq("id", id)));

      toast.success(`${ready.length} movement${ready.length === 1 ? "" : "s"} imported`);
      onImported();
      reset();
      onClose();
    } catch (e: any) {
      toast.error(e.message ?? "Import failed");
    } finally { setImporting(false); }
  }

  const problems = (rows ?? []).filter((r) => !r.crewId || !r.event_date || !r.event_type).length;
  const dupes = (rows ?? []).filter((r) => r.duplicate).length;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { reset(); onClose(); } }}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Import a vessel sign on/off sheet</DialogTitle>
        </DialogHeader>

        {!rows && (
          <div className="py-2">
            <label className={cn(
              "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-center transition",
              busy ? "cursor-wait border-border" : "border-border hover:border-primary/50",
            )}>
              {busy
                ? <><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /><span className="text-sm font-medium">Reading {fileName}…</span></>
                : <><UploadCloud className="h-6 w-6 text-primary" /><span className="text-sm font-medium">Choose the sheet the vessel sent</span></>}
              <span className="max-w-md text-[11.5px] leading-snug text-muted-foreground">
                CSV or Excel-saved-as-CSV, a PDF, or a photo/scan. Crew names, dates and ports are
                matched against Polaris and shown for your approval — nothing is saved until you confirm.
              </span>
              <input ref={inputRef} type="file" className="hidden" accept=".csv,.tsv,.txt,.pdf,image/*"
                onChange={(e) => { void handleFile(e.target.files?.[0] ?? null); e.target.value = ""; }} disabled={busy} />
            </label>
          </div>
        )}

        {rows && (
          <>
            <div className="flex flex-wrap items-center gap-3 text-[12px]">
              <span className="flex items-center gap-1.5 font-medium"><FileSpreadsheet className="h-3.5 w-3.5 text-muted-foreground" />{fileName}</span>
              <span className="text-muted-foreground">{rows.length} movement{rows.length === 1 ? "" : "s"} read</span>
              <span className="flex items-center gap-1 text-emerald-500"><CheckCircle2 className="h-3.5 w-3.5" />{ready.length} ready</span>
              {problems > 0 && <span className="flex items-center gap-1 text-amber-500"><AlertTriangle className="h-3.5 w-3.5" />{problems} need attention</span>}
              {dupes > 0 && <span className="text-muted-foreground">{dupes} already in Polaris</span>}
              <Button size="sm" variant="outline" className="ml-auto h-7 text-[11px]" onClick={() => { reset(); }}>
                Choose a different file
              </Button>
            </div>

            {warnings.map((w) => (
              <p key={w} className="flex items-start gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-[11.5px] text-amber-600 dark:text-amber-400">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />{w}
              </p>
            ))}

            <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-border">
              <table className="w-full text-[12.5px]">
                <thead className="sticky top-0 bg-card">
                  <tr className="border-b border-border text-[10.5px] uppercase tracking-wider text-muted-foreground">
                    <th className="w-8 px-2 py-2"></th>
                    <th className="px-2 py-2 text-left">On the sheet</th>
                    <th className="px-2 py-2 text-left">Crew member in Polaris</th>
                    <th className="px-2 py-2 text-left">Event</th>
                    <th className="px-2 py-2 text-left">Date</th>
                    <th className="px-2 py-2 text-left">Vessel / Port</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => {
                    const incomplete = !r.crewId || !r.event_date || !r.event_type;
                    return (
                      <tr key={i} className={cn("border-b border-border/40", r.duplicate && "opacity-60")}>
                        <td className="px-2 py-1.5 align-top">
                          <input type="checkbox" checked={r.include} disabled={incomplete}
                            onChange={(e) => set(i, { include: e.target.checked })} title={incomplete ? "Complete the row first" : "Include in the import"} />
                        </td>
                        <td className="px-2 py-1.5 align-top">
                          <div className="font-medium">{r.name}</div>
                          <div className="text-[10.5px] text-muted-foreground">
                            {[r.rank, r.date_raw].filter(Boolean).join(" · ")}
                          </div>
                          {r.note && (
                            <div className={cn("mt-0.5 text-[10.5px]", r.duplicate ? "text-muted-foreground" : "text-amber-500")}>{r.note}</div>
                          )}
                        </td>
                        <td className="px-2 py-1.5 align-top">
                          <select value={r.crewId ?? ""} onChange={(e) => set(i, { crewId: e.target.value || null })}
                            className="w-full max-w-[200px] rounded-md border border-border bg-background px-2 py-1 text-[12px]">
                            <option value="">— not matched —</option>
                            {/* Suggested matches first, then everyone. */}
                            {r.candidates.map((c) => <option key={c.id} value={c.id}>{c.name} (suggested)</option>)}
                            {crew.map((c) => (
                              <option key={c.id} value={c.id}>{[c.first_name, c.last_name].filter(Boolean).join(" ")}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-2 py-1.5 align-top">
                          <select value={r.event_type ?? ""} onChange={(e) => set(i, { event_type: (e.target.value || null) as any })}
                            className="rounded-md border border-border bg-background px-2 py-1 text-[12px]">
                            <option value="">— pick —</option>
                            <option value="sign_on">Sign On</option>
                            <option value="sign_off">Sign Off</option>
                          </select>
                        </td>
                        <td className="px-2 py-1.5 align-top">
                          <DateInputDMY value={r.event_date ?? ""} onChange={(iso) => set(i, { event_date: iso || null })}
                            style={{ height: 28, width: 116, borderRadius: 6, border: "1px solid var(--border)", background: "var(--background)", color: "var(--foreground)", padding: "0 6px", fontSize: 12 }} />
                        </td>
                        <td className="px-2 py-1.5 align-top text-[11.5px] text-muted-foreground">
                          <div>{r.yacht?.name ?? r.vessel ?? "—"}</div>
                          <div>{r.port ?? ""}</div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onClose(); }} disabled={importing}>Cancel</Button>
          <Button onClick={() => void runImport()} disabled={importing || !ready.length} className="gap-1.5">
            {importing && <Loader2 className="h-4 w-4 animate-spin" />}
            Import {ready.length || ""} movement{ready.length === 1 ? "" : "s"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

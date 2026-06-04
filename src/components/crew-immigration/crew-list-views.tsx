import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Pencil, Trash2, Ship, UserCircle2, FileText, Upload, Download, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// Local copies (kept in sync with crew-list-page)
export type CrewRow = {
  id: string;
  yacht_id: string | null;
  first_name: string;
  last_name: string;
  nationality: string | null;
  rank: string | null;
  department: string | null;
  status: string;
  email: string | null;
  phone: string | null;
  passport_number: string | null;
  passport_expiry_date: string | null;
};

const STATUS_COLORS: Record<string, string> = {
  active: "bg-emerald-500/15 text-emerald-500",
  on_leave: "bg-amber-500/15 text-amber-500",
  off_signed: "bg-slate-500/15 text-slate-400",
  inactive: "bg-red-500/15 text-red-400",
};
const STATUS_LABELS: Record<string, string> = {
  active: "Active", on_leave: "On Leave", off_signed: "Off-Signed", inactive: "Inactive",
};
const DEPARTMENTS = ["Deck", "Engine", "Interior", "Galley", "Bridge", "Other"];
const RANKS = [
  "Captain", "Chief Officer", "Second Officer", "Third Officer",
  "Chief Engineer", "Second Engineer", "Third Engineer", "Electrician",
  "Bosun", "Able Seaman", "Deckhand",
  "Chief Steward/ess", "Steward/ess", "Purser",
  "Executive Chef", "Chef", "Cook", "Other",
];

// ─── Cards view ─────────────────────────────────────────────────────────────

export function CrewCards({ crew, yachtName, fmtDate, onEdit, onDelete }: {
  crew: CrewRow[];
  yachtName: (id: string | null) => string;
  fmtDate: (d: string | null) => string;
  onEdit: (m: CrewRow) => void;
  onDelete: (m: CrewRow) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {crew.map((m) => {
        const expiring = m.passport_expiry_date && new Date(m.passport_expiry_date) < new Date(Date.now() + 90 * 86400000);
        return (
          <div key={m.id} className="group rounded-xl border border-border bg-card p-4 shadow-sm transition hover:border-primary/30 hover:shadow-md">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-bold text-primary">
                {m.first_name[0]}{m.last_name[0]}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold text-foreground">{m.first_name} {m.last_name}</div>
                <div className="truncate text-xs text-muted-foreground">{m.rank ?? "—"}{m.department ? ` · ${m.department}` : ""}</div>
              </div>
              <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold", STATUS_COLORS[m.status] ?? "bg-muted text-muted-foreground")}>
                {STATUS_LABELS[m.status] ?? m.status}
              </span>
            </div>
            <div className="mt-3 space-y-1.5 text-xs">
              <div className="flex items-center gap-2 text-muted-foreground"><Ship className="h-3.5 w-3.5 shrink-0 opacity-60" /><span className="truncate">{yachtName(m.yacht_id)}</span></div>
              {m.nationality && <div className="flex items-center gap-2 text-muted-foreground"><UserCircle2 className="h-3.5 w-3.5 shrink-0 opacity-60" />{m.nationality}</div>}
              {m.passport_number && (
                <div className="flex items-center gap-2">
                  <FileText className="h-3.5 w-3.5 shrink-0 opacity-60 text-muted-foreground" />
                  <span className="font-mono text-muted-foreground">{m.passport_number}</span>
                  {m.passport_expiry_date && <span className={cn("ml-auto", expiring ? "text-amber-500" : "text-muted-foreground/60")}>exp {fmtDate(m.passport_expiry_date)}</span>}
                </div>
              )}
            </div>
            <div className="mt-3 flex items-center gap-1 border-t border-border/50 pt-2 opacity-0 transition group-hover:opacity-100">
              <Button variant="ghost" size="sm" className="h-7 flex-1 gap-1 text-xs" onClick={() => onEdit(m)}><Pencil className="h-3 w-3" /> Edit</Button>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground/60 hover:text-destructive" onClick={() => onDelete(m)}><Trash2 className="h-3.5 w-3.5" /></Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Grid (spreadsheet) view — inline editable ───────────────────────────────

const GRID_COLS: { key: keyof CrewRow; label: string; type?: "text" | "date" | "select"; options?: string[]; width: string }[] = [
  { key: "first_name", label: "First Name", width: "140px" },
  { key: "last_name", label: "Last Name", width: "140px" },
  { key: "nationality", label: "Nationality", width: "130px" },
  { key: "rank", label: "Rank", type: "select", options: RANKS, width: "150px" },
  { key: "department", label: "Department", type: "select", options: DEPARTMENTS, width: "120px" },
  { key: "status", label: "Status", type: "select", options: ["active", "on_leave", "off_signed", "inactive"], width: "120px" },
  { key: "email", label: "Email", width: "190px" },
  { key: "phone", label: "Phone", width: "140px" },
  { key: "passport_number", label: "Passport No.", width: "140px" },
  { key: "passport_expiry_date", label: "Passport Expiry", type: "date", width: "150px" },
];

export function CrewGrid({ crew, onSave, onDelete }: {
  crew: CrewRow[];
  onSave: (id: string, patch: Record<string, string | null>) => void;
  onDelete: (m: CrewRow) => void;
}) {
  const [editing, setEditing] = useState<{ id: string; key: string } | null>(null);

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-[0_2px_12px_-4px_rgba(0,0,0,0.4)]">
      <table className="min-w-full border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-border bg-muted/40">
            {GRID_COLS.map((c) => (
              <th key={c.key as string} style={{ minWidth: c.width }} className="border-r border-border/40 px-2.5 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap">{c.label}</th>
            ))}
            <th className="w-10 px-2 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {crew.map((m) => (
            <tr key={m.id} className="border-b border-border/40 hover:bg-accent/10">
              {GRID_COLS.map((c) => {
                const isEditing = editing?.id === m.id && editing?.key === (c.key as string);
                const raw = (m[c.key] as string | null) ?? "";
                return (
                  <td
                    key={c.key as string}
                    className={cn("border-r border-border/30 px-2.5 py-1.5 cursor-text", isEditing && "bg-primary/5 ring-1 ring-inset ring-primary/40")}
                    onClick={() => !isEditing && setEditing({ id: m.id, key: c.key as string })}
                  >
                    {isEditing ? (
                      c.type === "select" ? (
                        <select
                          autoFocus
                          defaultValue={raw}
                          onChange={(e) => { onSave(m.id, { [c.key]: e.target.value || null }); setEditing(null); }}
                          onBlur={() => setEditing(null)}
                          className="h-6 w-full rounded border border-border bg-background px-1 text-xs focus:outline-none"
                        >
                          {(c.options ?? []).map((o) => <option key={o} value={o}>{c.key === "status" ? (STATUS_LABELS[o] ?? o) : o}</option>)}
                        </select>
                      ) : (
                        <input
                          autoFocus
                          type={c.type === "date" ? "date" : "text"}
                          defaultValue={raw}
                          onBlur={(e) => { if (e.target.value !== raw) onSave(m.id, { [c.key]: e.target.value || null }); setEditing(null); }}
                          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setEditing(null); }}
                          className="h-6 w-full rounded border border-border bg-background px-1 text-xs focus:outline-none"
                        />
                      )
                    ) : (
                      <span className={cn(c.key === "passport_number" && "font-mono", !raw && "text-muted-foreground/30")}>
                        {c.key === "status" ? (STATUS_LABELS[raw] ?? raw) : (raw || "—")}
                      </span>
                    )}
                  </td>
                );
              })}
              <td className="px-2 py-1.5 text-center">
                <button onClick={() => onDelete(m)} className="rounded p-1 text-muted-foreground/50 transition hover:bg-destructive/10 hover:text-destructive">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="border-t border-border/40 bg-muted/10 px-3 py-1.5 text-[11px] text-muted-foreground">
        Click any cell to edit inline · Enter to confirm · Esc to cancel
      </div>
    </div>
  );
}

// ─── CSV import ───────────────────────────────────────────────────────────────

const CSV_HEADERS = [
  "First Name", "Last Name", "Middle Name", "Nationality", "Rank", "Department",
  "Email", "Phone", "Passport Number", "Passport Expiry", "Date of Birth", "Status",
];

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  function splitLine(line: string): string[] {
    const out: string[] = []; let cur = ""; let q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
      else if (ch === "," && !q) { out.push(cur.trim()); cur = ""; }
      else cur += ch;
    }
    out.push(cur.trim()); return out;
  }
  const headers = splitLine(lines[0]).map((h) => h.toLowerCase().replace(/[^a-z0-9]/g, ""));
  return lines.slice(1).map((l) => {
    const vals = splitLine(l); const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h] = vals[i] ?? ""; });
    return obj;
  });
}

function pick(r: Record<string, string>, ...keys: string[]) {
  for (const k of keys) { const v = r[k.toLowerCase().replace(/[^a-z0-9]/g, "")]; if (v) return v; }
  return "";
}
function normDate(s: string): string | null {
  if (!s) return null;
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return null;
}

export function CsvImportDialog({ open, onOpenChange, userId, onImported }: {
  open: boolean; onOpenChange: (o: boolean) => void; userId: string | undefined; onImported: () => void;
}) {
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function reset() { setRows([]); setFileName(""); }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const parsed = parseCSV(await file.text());
    setRows(parsed);
    if (!parsed.length) toast.error("No rows found in CSV");
  }

  async function doImport() {
    if (!rows.length) return;
    setBusy(true);
    try {
      const payload = rows.map((r) => {
        let status = (pick(r, "Status") || "active").toLowerCase().replace(/[^a-z]/g, "");
        if (status === "onleave") status = "on_leave";
        else if (status === "offsigned") status = "off_signed";
        else if (!["active", "inactive"].includes(status)) status = "active";
        return {
          first_name: pick(r, "First Name", "firstname", "first") || "—",
          last_name: pick(r, "Last Name", "lastname", "surname", "last") || "—",
          middle_name: pick(r, "Middle Name", "middlename") || null,
          nationality: pick(r, "Nationality") || null,
          rank: pick(r, "Rank", "Position") || null,
          department: pick(r, "Department") || null,
          email: pick(r, "Email") || null,
          phone: pick(r, "Phone", "Mobile", "Contact") || null,
          passport_number: pick(r, "Passport Number", "Passport", "passportno") || null,
          passport_expiry_date: normDate(pick(r, "Passport Expiry", "passportexpirydate", "passportexpiry")),
          date_of_birth: normDate(pick(r, "Date of Birth", "dob", "birthdate")),
          status,
          created_by: userId,
        };
      }).filter((p) => p.first_name !== "—" || p.last_name !== "—");

      const { error } = await (supabase as any).from("crew_members").insert(payload);
      if (error) throw error;
      toast.success(`Imported ${payload.length} crew member${payload.length === 1 ? "" : "s"}`);
      reset();
      onImported();
    } catch (e: any) {
      toast.error(e.message ?? "Import failed");
    } finally {
      setBusy(false);
    }
  }

  function downloadTemplate() {
    const csv = CSV_HEADERS.join(",") + "\n" + "Mark,Jones,James,South Africa,Chief Engineer,Engine,mark@vessel.com,+27820000000,A12345678,2030-03-12,1985-05-14,active";
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: "crew-import-template.csv" });
    a.click(); URL.revokeObjectURL(url);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Import Crew from CSV</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/20 px-4 py-3">
            <div className="text-xs text-muted-foreground">
              Expected columns: First Name, Last Name, Middle Name, Nationality, Rank, Department, Email, Phone, Passport Number, Passport Expiry, Date of Birth, Status
            </div>
            <Button variant="ghost" size="sm" className="h-7 shrink-0 gap-1.5 text-xs" onClick={downloadTemplate}>
              <Download className="h-3.5 w-3.5" /> Template
            </Button>
          </div>

          <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFile} />
          <Button variant="outline" onClick={() => fileRef.current?.click()} className="w-full gap-1.5">
            <Upload className="h-4 w-4" /> {fileName || "Choose CSV file"}
          </Button>

          {rows.length > 0 && (
            <div className="overflow-hidden rounded-lg border border-border">
              <div className="bg-muted/30 px-3 py-1.5 text-xs font-medium">{rows.length} rows detected — preview (first 5)</div>
              <div className="max-h-56 overflow-auto">
                <table className="w-full text-[11px]">
                  <thead className="bg-muted/20"><tr>
                    {["First", "Last", "Nationality", "Rank", "Passport"].map((h) => <th key={h} className="px-2 py-1 text-left font-medium text-muted-foreground">{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {rows.slice(0, 5).map((r, i) => (
                      <tr key={i} className="border-t border-border/40">
                        <td className="px-2 py-1">{pick(r, "First Name", "firstname", "first")}</td>
                        <td className="px-2 py-1">{pick(r, "Last Name", "lastname", "surname")}</td>
                        <td className="px-2 py-1">{pick(r, "Nationality")}</td>
                        <td className="px-2 py-1">{pick(r, "Rank", "Position")}</td>
                        <td className="px-2 py-1 font-mono">{pick(r, "Passport Number", "Passport")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onOpenChange(false); }} disabled={busy}>Cancel</Button>
          <Button onClick={doImport} disabled={busy || !rows.length} className="gap-1.5">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Import {rows.length || ""} Crew
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, Search, UserCircle2, Pencil, Trash2, Loader2, FileText, Table2, LayoutGrid, Rows3, Upload } from "lucide-react";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { useActiveVessel } from "@/components/vessel-switcher";
import { CrewCards, CrewGrid, CsvImportDialog } from "@/components/crew-immigration/crew-list-views";

type Yacht = { id: string; vessel_name: string };

type CrewMember = {
  id: string;
  yacht_id: string | null;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  nationality: string | null;
  rank: string | null;
  department: string | null;
  status: string;
  email: string | null;
  phone: string | null;
  passport_number: string | null;
  passport_expiry_date: string | null;
  photo_url: string | null;
  created_at: string;
};

const STATUS_COLORS: Record<string, string> = {
  active:    "bg-emerald-500/15 text-emerald-400",
  on_leave:  "bg-amber-500/15 text-amber-400",
  off_signed:"bg-slate-500/15 text-slate-400",
  inactive:  "bg-red-500/15 text-red-400",
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
  "Executive Chef", "Chef", "Cook",
  "Other",
];

const EMPTY_FORM = {
  first_name: "", middle_name: "", last_name: "",
  nationality: "", rank: "", department: "",
  email: "", phone: "", status: "active",
  passport_number: "", passport_expiry_date: "",
  yacht_id: "",
};

export function CrewListPage() {
  const { user } = useAuth();
  const [crew, setCrew] = useState<CrewMember[]>([]);
  const [yachts, setYachts] = useState<Yacht[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterYacht, setFilterYacht] = useState("all");
  const activeVessel = useActiveVessel();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CrewMember | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CrewMember | null>(null);
  const [view, setView] = useState<"table" | "grid" | "cards">("table");
  const [csvOpen, setCsvOpen] = useState(false);

  useEffect(() => { void load(); void loadYachts(); }, []);

  // Inline save for the spreadsheet/grid view
  async function quickSave(id: string, patch: Partial<CrewMember>) {
    setCrew(prev => prev.map(m => m.id === id ? { ...m, ...patch } as CrewMember : m));
    const { error } = await (supabase as any).from("crew_members").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) { toast.error(error.message); void load(); }
  }

  // Sync page filter to the global active vessel
  useEffect(() => { setFilterYacht(activeVessel ?? "all"); }, [activeVessel]);

  async function load() {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("crew_members")
      .select("*")
      .order("last_name", { ascending: true });
    if (error) toast.error(error.message);
    else setCrew(data ?? []);
    setLoading(false);
  }

  async function loadYachts() {
    const { data } = await supabase.from("yachts").select("id, vessel_name").order("vessel_name");
    setYachts((data ?? []) as Yacht[]);
  }

  function openNew() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setOpen(true);
  }

  function openEdit(m: CrewMember) {
    setEditing(m);
    setForm({
      first_name: m.first_name,
      middle_name: m.middle_name ?? "",
      last_name: m.last_name,
      nationality: m.nationality ?? "",
      rank: m.rank ?? "",
      department: m.department ?? "",
      email: m.email ?? "",
      phone: m.phone ?? "",
      status: m.status,
      passport_number: m.passport_number ?? "",
      passport_expiry_date: m.passport_expiry_date ?? "",
      yacht_id: m.yacht_id ?? "",
    });
    setOpen(true);
  }

  async function handleSave() {
    if (!form.first_name.trim() || !form.last_name.trim()) {
      toast.error("First and last name are required");
      return;
    }
    setBusy(true);
    try {
      const payload: any = {
        first_name: form.first_name.trim(),
        middle_name: form.middle_name.trim() || null,
        last_name: form.last_name.trim(),
        nationality: form.nationality || null,
        rank: form.rank || null,
        department: form.department || null,
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        status: form.status,
        passport_number: form.passport_number.trim() || null,
        passport_expiry_date: form.passport_expiry_date || null,
        yacht_id: form.yacht_id || null,
        created_by: user?.id,
        updated_at: new Date().toISOString(),
      };
      const db = supabase as any;
      const { error } = editing
        ? await db.from("crew_members").update(payload).eq("id", editing.id)
        : await db.from("crew_members").insert([payload]);
      if (error) throw error;
      toast.success(editing ? "Crew member updated" : "Crew member added");
      setOpen(false);
      void load();
    } catch (e: any) {
      toast.error(e.message ?? "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const { error } = await (supabase as any).from("crew_members").delete().eq("id", deleteTarget.id);
    if (error) toast.error(error.message);
    else { toast.success("Crew member removed"); void load(); }
    setDeleteTarget(null);
  }

  const filtered = useMemo(() => {
    const yachtMap = new Map(yachts.map(y => [y.id, y.vessel_name]));
    return crew.filter(m => {
      if (filterStatus !== "all" && m.status !== filterStatus) return false;
      if (filterYacht !== "all" && m.yacht_id !== filterYacht) return false;
      if (q.trim()) {
        const s = q.toLowerCase();
        const hay = [m.first_name, m.last_name, m.nationality, m.rank, m.department, m.email,
          m.passport_number, m.yacht_id ? yachtMap.get(m.yacht_id) : ""].join(" ").toLowerCase();
        if (!hay.includes(s)) return false;
      }
      return true;
    });
  }, [crew, q, filterStatus, filterYacht, yachts]);

  const yachtName = (id: string | null) => yachts.find(y => y.id === id)?.vessel_name ?? "—";
  const fmtDate = (d: string | null) => d ? new Date(d + "T00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-border/70 bg-card/30 px-6 py-3.5">
        <div>
          <div className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground/60">Superyacht Middle East / Crew & Immigration</div>
          <h1 className="mt-0.5 font-display text-[1.25rem] font-semibold tracking-tight">Crew List</h1>
        </div>
        <div className="flex items-center gap-2.5">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/50" />
            <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search crew…" className="h-9 w-56 pl-8 text-sm" />
          </div>
          <Select value={filterYacht} onValueChange={setFilterYacht}>
            <SelectTrigger className="h-9 w-40 text-xs"><SelectValue placeholder="All Vessels" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Vessels</SelectItem>
              {yachts.map(y => <SelectItem key={y.id} value={y.id}>{y.vessel_name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="h-9 w-36 text-xs"><SelectValue placeholder="All Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              {Object.entries(STATUS_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
            </SelectContent>
          </Select>

          {/* View switcher */}
          <div className="flex items-center rounded-lg border border-border bg-muted/30 p-0.5">
            {([
              { v: "table", icon: Table2, label: "Table" },
              { v: "grid", icon: LayoutGrid, label: "Grid" },
              { v: "cards", icon: Rows3, label: "Cards" },
            ] as const).map(({ v, icon: Icon, label }) => (
              <button
                key={v}
                onClick={() => setView(v)}
                title={label}
                className={cn("flex h-8 w-8 items-center justify-center rounded-md transition",
                  view === v ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
              >
                <Icon className="h-4 w-4" />
              </button>
            ))}
          </div>

          <Button size="sm" variant="outline" onClick={() => setCsvOpen(true)} className="h-9 gap-1.5 text-xs">
            <Upload className="h-3.5 w-3.5" /> Import CSV
          </Button>
          <Button size="sm" onClick={openNew} className="h-9 gap-1.5 px-3.5 font-medium shadow-sm">
            <Plus className="h-3.5 w-3.5" /> Add Crew Member
          </Button>
        </div>
      </header>

      {/* Stats bar */}
      <div className="flex items-center gap-4 border-b border-border/40 bg-muted/10 px-6 py-2">
        {Object.entries(STATUS_LABELS).map(([v, l]) => {
          const count = crew.filter(m => m.status === v).length;
          return (
            <button key={v} onClick={() => setFilterStatus(filterStatus === v ? "all" : v)}
              className={`flex items-center gap-1.5 text-xs transition ${filterStatus === v ? "text-foreground font-semibold" : "text-muted-foreground hover:text-foreground"}`}>
              <span className={cn("h-1.5 w-1.5 rounded-full", v === "active" ? "bg-emerald-400" : v === "on_leave" ? "bg-amber-400" : v === "off_signed" ? "bg-slate-400" : "bg-red-400")} />
              {count} {l}
            </button>
          );
        })}
        <span className="ml-auto text-xs text-muted-foreground">{filtered.length} of {crew.length} crew members</span>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto px-6 py-5">
        {loading ? (
          <div className="flex h-40 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : filtered.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center rounded-xl border border-dashed border-border text-center">
            <UserCircle2 className="h-10 w-10 text-muted-foreground/40 mb-3" />
            <p className="font-display text-base font-semibold">{q ? "No crew match your search" : "No crew members yet"}</p>
            <p className="text-sm text-muted-foreground mt-1">Add crew members to track visas, documents, and movements.</p>
            {!q && <Button onClick={openNew} className="mt-4 gap-1.5"><Plus className="h-4 w-4" /> Add First Crew Member</Button>}
          </div>
        ) : view === "table" ? (
          <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-[0_2px_12px_-4px_rgba(0,0,0,0.4)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  {["Crew Member", "Vessel", "Rank / Department", "Passport", "Status", "Actions"].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(m => (
                  <tr key={m.id} className="border-b border-border/40 hover:bg-accent/20 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[11px] font-bold text-primary">
                          {m.first_name[0]}{m.last_name[0]}
                        </div>
                        <div>
                          <div className="font-semibold text-foreground">{m.first_name} {m.last_name}</div>
                          {m.nationality && <div className="text-[11px] text-muted-foreground">{m.nationality}</div>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm">{yachtName(m.yacht_id)}</td>
                    <td className="px-4 py-3">
                      <div className="text-sm font-medium">{m.rank ?? "—"}</div>
                      {m.department && <div className="text-[11px] text-muted-foreground">{m.department}</div>}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                      <div>{m.passport_number ?? "—"}</div>
                      {m.passport_expiry_date && (
                        <div className={cn("text-[10px]", new Date(m.passport_expiry_date) < new Date(Date.now() + 90*86400000) ? "text-amber-400" : "text-muted-foreground/60")}>
                          Exp: {fmtDate(m.passport_expiry_date)}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn("rounded-full px-2.5 py-0.5 text-[10.5px] font-semibold", STATUS_COLORS[m.status] ?? "bg-muted text-muted-foreground")}>
                        {STATUS_LABELS[m.status] ?? m.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-primary" title="View visas" asChild>
                          <Link to={"/crew-immigration/visas" as any}><FileText className="h-3.5 w-3.5" /></Link>
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground" onClick={() => openEdit(m)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground/60 hover:text-destructive" onClick={() => setDeleteTarget(m)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : view === "grid" ? (
          <CrewGrid crew={filtered} yachts={yachts} onSave={quickSave} onDelete={setDeleteTarget} />
        ) : (
          <CrewCards crew={filtered} yachtName={yachtName} fmtDate={fmtDate} onEdit={openEdit} onDelete={setDeleteTarget} />
        )}
      </div>

      {/* CSV import */}
      <CsvImportDialog
        open={csvOpen}
        onOpenChange={setCsvOpen}
        userId={user?.id}
        onImported={() => { setCsvOpen(false); void load(); }}
      />

      {/* Add / Edit Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Crew Member" : "Add Crew Member"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            {/* Name */}
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">First Name <span className="text-destructive">*</span></Label>
                <Input value={form.first_name} onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))} placeholder="Mark" className="h-8" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Middle Name</Label>
                <Input value={form.middle_name} onChange={e => setForm(f => ({ ...f, middle_name: e.target.value }))} placeholder="James" className="h-8" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Last Name <span className="text-destructive">*</span></Label>
                <Input value={form.last_name} onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))} placeholder="Jones" className="h-8" />
              </div>
            </div>

            {/* Role */}
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Vessel</Label>
                <Select value={form.yacht_id || "__none"} onValueChange={v => setForm(f => ({ ...f, yacht_id: v === "__none" ? "" : v }))}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="— None —" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">— None —</SelectItem>
                    {yachts.map(y => <SelectItem key={y.id} value={y.id}>{y.vessel_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Rank / Position</Label>
                <Select value={form.rank || "__none"} onValueChange={v => setForm(f => ({ ...f, rank: v === "__none" ? "" : v }))}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="— Select —" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">— Select —</SelectItem>
                    {RANKS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Department</Label>
                <Select value={form.department || "__none"} onValueChange={v => setForm(f => ({ ...f, department: v === "__none" ? "" : v }))}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="— Select —" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">— Select —</SelectItem>
                    {DEPARTMENTS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Contact */}
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Nationality</Label>
                <Input value={form.nationality} onChange={e => setForm(f => ({ ...f, nationality: e.target.value }))} placeholder="South African" className="h-8" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Email</Label>
                <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="crew@vessel.com" className="h-8" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Phone</Label>
                <Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+27 82 000 0000" className="h-8" />
              </div>
            </div>

            {/* Passport */}
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Passport Number</Label>
                <Input value={form.passport_number} onChange={e => setForm(f => ({ ...f, passport_number: e.target.value }))} placeholder="A12345678" className="h-8 font-mono" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Passport Expiry</Label>
                <Input type="date" value={form.passport_expiry_date} onChange={e => setForm(f => ({ ...f, passport_expiry_date: e.target.value }))} className="h-8" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Status</Label>
                <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(STATUS_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
            <Button onClick={handleSave} disabled={busy} className="gap-1.5">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {editing ? "Save Changes" : "Add Crew Member"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete */}
      <AlertDialog open={!!deleteTarget} onOpenChange={o => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove crew member?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{deleteTarget?.first_name} {deleteTarget?.last_name}</strong> will be permanently removed along with all associated records.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

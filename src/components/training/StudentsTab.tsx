import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, RefreshCw, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { TrainingBoardTable, type TrainingCol } from "@/components/training/TrainingBoardTable";
import { AttachmentsDialog } from "@/components/training/AttachmentsDialog";
import { attachmentCounts } from "@/lib/training/attachments";
import { loadStudents, studentCrud, type TrainingStudent } from "@/lib/training/data";
import { syncTrainingStudents } from "@/lib/training/monday.server";

// Monday's own labels + colours for these two status columns (Student_Contacts
// board settings) — kept exact, not re-picked, for the "near 1:1" ask.
const PAYMENT_STATUS: TrainingCol["statusOptions"] = [
  { label: "Paid", color: "#00c875" },
  { label: "Partial", color: "#fdab3d" },
  { label: "Pending", color: "#df2f4a" },
];
const ENROLLMENT_STATUS: TrainingCol["statusOptions"] = [
  { label: "New Student", color: "#00c875" },
  { label: "Enrolled", color: "#037f4c" },
  { label: "Completed", color: "#c4c4c4" },
  { label: "Cancelled", color: "#df2f4a" },
];

const COLS: TrainingCol[] = [
  { key: "full_name", label: "Name", type: "text", width: "w-48", bold: true },
  { key: "mobile", label: "Mobile", type: "text", width: "w-32" },
  { key: "email", label: "Email", type: "text", width: "w-48" },
  { key: "birthday", label: "Birthday", type: "date", width: "w-28" },
  { key: "address", label: "Address", type: "text", width: "w-48" },
  { key: "payment_status", label: "Payment Status", type: "status", width: "w-32", statusOptions: PAYMENT_STATUS },
  { key: "payment_amount", label: "Payment Amount", type: "number", width: "w-32" },
  { key: "class_name", label: "Class", type: "text", width: "w-36" },
  { key: "instructor_name", label: "Instructor", type: "text", width: "w-32" },
  { key: "schedule", label: "Schedule", type: "text", width: "w-40" },
  { key: "enrollment_status", label: "Enrollment Status", type: "status", width: "w-36", statusOptions: ENROLLMENT_STATUS },
];

export function StudentsTab() {
  const [rows, setRows] = useState<TrainingStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState("");

  /** Whose files are open, and how many each student holds. */
  const [filesFor, setFilesFor] = useState<TrainingStudent | null>(null);
  const [fileCounts, setFileCounts] = useState<Record<string, number>>({});

  async function reload() { setRows(await loadStudents()); }

  // One query for the whole tab — a count per row would be a round trip per row.
  async function reloadCounts() {
    try { setFileCounts(await attachmentCounts("student")); }
    catch { /* the table is still usable without the badges */ }
  }

  useEffect(() => {
    setLoading(true);
    void Promise.all([reload(), reloadCounts()]).finally(() => setLoading(false));
  }, []);

  // Where a mis-filed document can be moved to: every other student.
  const moveTargets = useMemo(
    () => rows
      .filter((r) => r.id !== filesFor?.id)
      .map((r) => ({ id: r.id, label: r.full_name || "Unnamed student", sub: r.class_name ?? undefined })),
    [rows, filesFor?.id],
  );

  async function sync() {
    setSyncing(true);
    try {
      const r = await (syncTrainingStudents as any)();
      if (!r.ok) throw new Error(r.detail);
      toast.success(r.detail);
      await reload();
    } catch (e: any) { toast.error(e?.message ?? "Monday sync failed"); }
    finally { setSyncing(false); }
  }

  const filtered = rows.filter((r) => !search.trim() ||
    [r.full_name, r.email, r.mobile, r.class_name].join(" ").toLowerCase().includes(search.toLowerCase()));

  const groupOrder = [...new Set(rows.map((r) => r.monday_group).filter(Boolean))].sort() as string[];

  if (loading) return <div className="flex h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="flex h-full min-w-0 flex-col px-6 py-5">
      <div className="mb-3 flex shrink-0 flex-wrap items-center gap-2.5">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/50" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search students…" className="h-9 w-72 pl-8 text-sm" />
        </div>
        <span className="text-[12px] text-muted-foreground">{filtered.length} of {rows.length}</span>
        <Button size="sm" variant="outline" onClick={() => void sync()} disabled={syncing} className="ml-auto h-9 gap-1.5">
          {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Sync from Monday
        </Button>
      </div>
      <TrainingBoardTable
        rows={filtered}
        columns={COLS}
        groupBy="monday_group"
        groupLabels={groupOrder}
        newRowLabel="Student name"
        onPatch={async (id, patch) => {
          setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } as TrainingStudent : r)));
          try { await studentCrud.patch(id, patch); } catch (e: any) { toast.error(e?.message ?? "Update failed"); await reload(); }
        }}
        onCreate={async (name, group) => {
          try { const created = await studentCrud.create({ full_name: name, monday_group: group ?? null }); setRows((prev) => [...prev, created]); }
          catch (e: any) { toast.error(e?.message ?? "Couldn't add student"); }
        }}
        onDelete={async (id) => {
          try { await studentCrud.remove(id); setRows((prev) => prev.filter((r) => r.id !== id)); }
          catch (e: any) { toast.error(e?.message ?? "Delete failed"); }
        }}
        onOpenFiles={(row) => setFilesFor(row as TrainingStudent)}
        fileCounts={fileCounts}
      />

      {filesFor && (
        <AttachmentsDialog
          open
          onClose={() => setFilesFor(null)}
          ownerType="student"
          ownerId={filesFor.id}
          ownerLabel={filesFor.full_name || "Unnamed student"}
          moveTargets={moveTargets}
          onChanged={() => void reloadCounts()}
        />
      )}
    </div>
  );
}

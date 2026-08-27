import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, RefreshCw, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { TrainingBoardTable, type TrainingCol } from "@/components/training/TrainingBoardTable";
import { loadClasses, classCrud, type TrainingClass } from "@/lib/training/data";
import { syncTrainingClasses } from "@/lib/training/monday.server";

// Monday's own labels + colours for the Class board's Status column, kept exact.
const CLASS_STATUS: TrainingCol["statusOptions"] = [
  { label: "In Progress", color: "#fdab3d" },
  { label: "On Hold", color: "#df2f4a" },
  { label: "Pending Approval", color: "#007eb5" },
  { label: "Complete", color: "#00c875" },
];

const COLS: TrainingCol[] = [
  { key: "name", label: "Name", type: "text", width: "w-56", bold: true },
  { key: "instructor_name", label: "Instructor", type: "text", width: "w-32" },
  { key: "status", label: "Status", type: "status", width: "w-36", statusOptions: CLASS_STATUS },
  { key: "course_name", label: "Course", type: "text", width: "w-56" },
  { key: "timeline_start", label: "Start", type: "date", width: "w-28" },
  { key: "timeline_end", label: "End", type: "date", width: "w-28" },
  { key: "student_names", label: "Students", type: "text", width: "w-64" },
];

export function ClassesTab() {
  const [rows, setRows] = useState<TrainingClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState("");

  async function reload() { setRows(await loadClasses()); }
  useEffect(() => { setLoading(true); void reload().finally(() => setLoading(false)); }, []);

  async function sync() {
    setSyncing(true);
    try {
      const r = await (syncTrainingClasses as any)();
      if (!r.ok) throw new Error(r.detail);
      toast.success(r.detail);
      await reload();
    } catch (e: any) { toast.error(e?.message ?? "Monday sync failed"); }
    finally { setSyncing(false); }
  }

  const filtered = rows.filter((r) => !search.trim() ||
    [r.name, r.instructor_name, r.course_name].join(" ").toLowerCase().includes(search.toLowerCase()));

  if (loading) return <div className="flex h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="flex h-full min-w-0 flex-col px-6 py-5">
      <div className="mb-3 flex shrink-0 flex-wrap items-center gap-2.5">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/50" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search classes…" className="h-9 w-72 pl-8 text-sm" />
        </div>
        <span className="text-[12px] text-muted-foreground">{filtered.length} of {rows.length}</span>
        <Button size="sm" variant="outline" onClick={() => void sync()} disabled={syncing} className="ml-auto h-9 gap-1.5">
          {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Sync from Monday
        </Button>
      </div>
      <TrainingBoardTable
        rows={filtered}
        columns={COLS}
        newRowLabel="Class name"
        onPatch={async (id, patch) => {
          setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } as TrainingClass : r)));
          try { await classCrud.patch(id, patch); } catch (e: any) { toast.error(e?.message ?? "Update failed"); await reload(); }
        }}
        onCreate={async (name) => {
          try { const created = await classCrud.create({ name }); setRows((prev) => [...prev, created]); }
          catch (e: any) { toast.error(e?.message ?? "Couldn't add class"); }
        }}
        onDelete={async (id) => {
          try { await classCrud.remove(id); setRows((prev) => prev.filter((r) => r.id !== id)); }
          catch (e: any) { toast.error(e?.message ?? "Delete failed"); }
        }}
      />
    </div>
  );
}

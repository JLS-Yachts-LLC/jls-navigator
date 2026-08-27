import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, RefreshCw, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { TrainingBoardTable, type TrainingCol } from "@/components/training/TrainingBoardTable";
import { loadInstructors, instructorCrud, type TrainingInstructor } from "@/lib/training/data";
import { syncTrainingInstructors } from "@/lib/training/monday.server";

const COLS: TrainingCol[] = [
  { key: "full_name", label: "Name", type: "text", width: "w-48", bold: true },
  { key: "eid_expiry", label: "EID Expiry", type: "date-expiry", width: "w-32" },
  { key: "passport_expiry", label: "Passport Expiry", type: "date-expiry", width: "w-32" },
  { key: "labour_card_expiry", label: "Labour Card", type: "date-expiry", width: "w-32" },
  { key: "residence_visa_expiry", label: "Residence Visa", type: "date-expiry", width: "w-32" },
  { key: "driving_license_expiry", label: "24M Driving License", type: "date-expiry", width: "w-36" },
  { key: "seamen_card_expiry", label: "Seamen Card", type: "date-expiry", width: "w-32" },
  { key: "class_name", label: "Class", type: "text", width: "w-40" },
  { key: "schedule", label: "Schedule", type: "text", width: "w-48" },
];

export function InstructorsTab() {
  const [rows, setRows] = useState<TrainingInstructor[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState("");

  async function reload() { setRows(await loadInstructors()); }
  useEffect(() => { setLoading(true); void reload().finally(() => setLoading(false)); }, []);

  async function sync() {
    setSyncing(true);
    try {
      const r = await (syncTrainingInstructors as any)();
      if (!r.ok) throw new Error(r.detail);
      toast.success(r.detail);
      await reload();
    } catch (e: any) { toast.error(e?.message ?? "Monday sync failed"); }
    finally { setSyncing(false); }
  }

  const filtered = rows.filter((r) => !search.trim() || [r.full_name, r.class_name].join(" ").toLowerCase().includes(search.toLowerCase()));

  if (loading) return <div className="flex h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="flex h-full min-w-0 flex-col px-6 py-5">
      <div className="mb-3 flex shrink-0 flex-wrap items-center gap-2.5">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/50" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search instructors…" className="h-9 w-72 pl-8 text-sm" />
        </div>
        <span className="text-[12px] text-muted-foreground">{filtered.length} of {rows.length}</span>
        <Button size="sm" variant="outline" onClick={() => void sync()} disabled={syncing} className="ml-auto h-9 gap-1.5">
          {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Sync from Monday
        </Button>
      </div>
      <TrainingBoardTable
        rows={filtered}
        columns={COLS}
        newRowLabel="Instructor name"
        onPatch={async (id, patch) => {
          setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } as TrainingInstructor : r)));
          try { await instructorCrud.patch(id, patch); } catch (e: any) { toast.error(e?.message ?? "Update failed"); await reload(); }
        }}
        onCreate={async (name) => {
          try { const created = await instructorCrud.create({ full_name: name }); setRows((prev) => [...prev, created]); }
          catch (e: any) { toast.error(e?.message ?? "Couldn't add instructor"); }
        }}
        onDelete={async (id) => {
          try { await instructorCrud.remove(id); setRows((prev) => prev.filter((r) => r.id !== id)); }
          catch (e: any) { toast.error(e?.message ?? "Delete failed"); }
        }}
      />
    </div>
  );
}

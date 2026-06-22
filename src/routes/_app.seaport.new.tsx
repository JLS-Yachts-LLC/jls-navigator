import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { PolarisShell } from "@/components/platform/PolarisShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/seaport/new")({
  component: NewSeaportRequest,
  validateSearch: (s: Record<string, unknown>) => ({ vesselId: typeof s.vesselId === "string" ? s.vesselId : undefined }),
  head: () => ({ meta: [{ title: "New Seaport Request — Polaris" }] }),
});

type Row = {
  crew_name: string; flight_date: string; flight_time: string; flight_number: string;
  sign: boolean; pickup_required: boolean; pickup_time: string; crew_contact: string;
};
const emptyRow = (): Row => ({ crew_name: "", flight_date: "", flight_time: "", flight_number: "", sign: true, pickup_required: false, pickup_time: "", crew_contact: "" });
const MAX = 15;

function NewSeaportRequest() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { vesselId } = Route.useSearch();
  const today = new Date().toISOString().slice(0, 10);

  const [vessel, setVessel] = useState(vesselId ?? "");
  const [requestDate, setRequestDate] = useState(today);
  const [notes, setNotes] = useState("");
  const [arrivals, setArrivals] = useState<Row[]>([emptyRow(), emptyRow(), emptyRow()]);
  const [departures, setDepartures] = useState<Row[]>([emptyRow(), emptyRow(), emptyRow()]);
  const [busy, setBusy] = useState(false);

  const { data: yachts = [] } = useQuery({
    queryKey: ["yachts-min"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("yachts").select("id, vessel_name").eq("archive", false).order("vessel_name");
      return data ?? [];
    },
  });

  async function submit() {
    if (!vessel) { toast.error("Select a vessel"); return; }
    const clean = (rows: Row[]) => rows.filter((r) => r.crew_name.trim());
    const arr = clean(arrivals); const dep = clean(departures);
    if (arr.length === 0 && dep.length === 0) { toast.error("Add at least one crew arrival or departure"); return; }
    setBusy(true);
    try {
      const { data: req, error } = await (supabase as any).from("seaport_requests")
        .insert({ vessel_id: vessel, submitted_by: user!.id, request_date: requestDate, notes: notes.trim() || null, status: "submitted" })
        .select("request_id").single();
      if (error) throw new Error(error.message);
      const rid = req.request_id;
      const mapArr = (r: Row) => ({ request_id: rid, crew_name: r.crew_name.trim(), flight_date: r.flight_date || null, flight_time: r.flight_time || null, flight_number: r.flight_number || null, sign_on: r.sign, pickup_required: r.pickup_required, pickup_time: r.pickup_required ? (r.pickup_time || null) : null, crew_contact: r.crew_contact || null });
      const mapDep = (r: Row) => ({ request_id: rid, crew_name: r.crew_name.trim(), flight_date: r.flight_date || null, flight_time: r.flight_time || null, flight_number: r.flight_number || null, sign_off: r.sign, pickup_required: r.pickup_required, pickup_time: r.pickup_required ? (r.pickup_time || null) : null, crew_contact: r.crew_contact || null });
      if (arr.length) { const { error: e } = await (supabase as any).from("seaport_arrivals").insert(arr.map(mapArr)); if (e) throw new Error(e.message); }
      if (dep.length) { const { error: e } = await (supabase as any).from("seaport_departures").insert(dep.map(mapDep)); if (e) throw new Error(e.message); }
      toast.success("Seaport request submitted");
      navigate({ to: "/seaport/$requestId" as any, params: { requestId: rid } });
    } catch (e: any) {
      toast.error(e.message ?? "Could not submit request");
    } finally {
      setBusy(false);
    }
  }

  return (
    <PolarisShell label="Polaris / Port & Agency" title="New Seaport Immigration Request"
      actions={<Button size="sm" onClick={submit} disabled={busy} className="gap-1.5">{busy && <Loader2 className="h-4 w-4 animate-spin" />} Submit</Button>}>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Vessel</Label>
          <Select value={vessel} onValueChange={setVessel}>
            <SelectTrigger className="h-9"><SelectValue placeholder="Select vessel…" /></SelectTrigger>
            <SelectContent>{yachts.map((y: any) => <SelectItem key={y.id} value={y.id}>{y.vessel_name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Week / date covered</Label>
          <Input type="date" value={requestDate} onChange={(e) => setRequestDate(e.target.value)} className="h-9" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Notes</Label>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" className="h-9" />
        </div>
      </div>

      <RowSection title="Arrivals (Sign On)" signLabel="Sign On" rows={arrivals} setRows={setArrivals} />
      <RowSection title="Departures (Sign Off)" signLabel="Sign Off" rows={departures} setRows={setDepartures} />
    </PolarisShell>
  );
}

function RowSection({ title, signLabel, rows, setRows }: { title: string; signLabel: string; rows: Row[]; setRows: (r: Row[]) => void }) {
  const update = (i: number, patch: Partial<Row>) => setRows(rows.map((r, idx) => idx === i ? { ...r, ...patch } : r));
  return (
    <div className="rounded-xl border border-border">
      <div className="flex items-center justify-between border-b border-border/60 px-4 py-2.5">
        <h2 className="text-sm font-semibold">{title}</h2>
        <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" disabled={rows.length >= MAX}
          onClick={() => setRows([...rows, emptyRow()])}><Plus className="h-3.5 w-3.5" /> Add row</Button>
      </div>
      <div className="space-y-2 p-3">
        {rows.map((r, i) => (
          <div key={i} className={`grid grid-cols-1 gap-2 rounded-lg border border-border/50 p-2.5 sm:grid-cols-12 ${!r.sign ? "opacity-50" : ""}`}>
            <Input className="h-8 sm:col-span-3" placeholder="Crew name" value={r.crew_name} onChange={(e) => update(i, { crew_name: e.target.value })} />
            <Input className="h-8 sm:col-span-2" type="date" value={r.flight_date} onChange={(e) => update(i, { flight_date: e.target.value })} />
            <Input className="h-8 sm:col-span-1" placeholder="HH:MM" value={r.flight_time} onChange={(e) => update(i, { flight_time: e.target.value })} />
            <Input className="h-8 sm:col-span-2" placeholder="Flight no." value={r.flight_number} onChange={(e) => update(i, { flight_number: e.target.value })} />
            <Input className="h-8 sm:col-span-2" placeholder="Contact" value={r.crew_contact} onChange={(e) => update(i, { crew_contact: e.target.value })} />
            <label className="flex items-center gap-1 text-[11px] sm:col-span-1"><input type="checkbox" checked={r.sign} onChange={(e) => update(i, { sign: e.target.checked })} className="accent-primary" />{signLabel}</label>
            <div className="flex items-center gap-2 sm:col-span-1">
              <label className="flex items-center gap-1 text-[11px]"><input type="checkbox" checked={r.pickup_required} onChange={(e) => update(i, { pickup_required: e.target.checked })} className="accent-primary" />Pickup</label>
              <button onClick={() => setRows(rows.filter((_, idx) => idx !== i))} className="text-muted-foreground/50 hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
            {r.pickup_required && <Input className="h-8 sm:col-span-2" placeholder="Pickup time HH:MM" value={r.pickup_time} onChange={(e) => update(i, { pickup_time: e.target.value })} />}
          </div>
        ))}
      </div>
    </div>
  );
}

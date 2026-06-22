import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/fetch-all";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Search, LogIn, LogOut, Trash2, Loader2, FileText, Upload, CheckCircle2, Pencil, BarChart3, Download } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { doPushToSharePoint } from "@/lib/sharepoint-push.server";

type CrewLite = { id: string; first_name: string; last_name: string; rank: string | null; yacht_id: string | null };
type Yacht = { id: string; vessel_name: string };
type SignEvent = {
  id: string;
  crew_member_id: string;
  yacht_id: string | null;
  event_type: "sign_on" | "sign_off";
  event_date: string | null;
  port: string | null;
  notes: string | null;
  // Flight / logistics detail (SOSO)
  airline?: string | null;
  flight_number?: string | null;
  departure_airport?: string | null;
  arrival_airport?: string | null;
  departure_datetime?: string | null;
  arrival_datetime?: string | null;
  pickup_required?: boolean | null;
  pickup_time?: string | null;
  crew_contact_number?: string | null;
  driver_name?: string | null;
};

const EMPTY_FORM = {
  yacht_id: "", event_type: "sign_on", event_date: "", port: "", notes: "",
  airline: "", flight_number: "", departure_airport: "", arrival_airport: "",
  departure_datetime: "", arrival_datetime: "", pickup_required: false,
  pickup_time: "", crew_contact_number: "", driver_name: "",
};

export function SignOnOffPage() {
  const { user, session } = useAuth();
  const [events, setEvents] = useState<SignEvent[]>([]);
  const [crew, setCrew] = useState<CrewLite[]>([]);
  const [yachts, setYachts] = useState<Yacht[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterYacht, setFilterYacht] = useState("all");
  const [filterImm, setFilterImm] = useState("all"); // all | with | missing
  const [immLists, setImmLists] = useState<{ id: string; yacht_id: string; list_date: string | null; file_url: string | null; file_name: string | null; emirate: string }[]>([]);
  const [immOpen, setImmOpen] = useState(false);
  const [immBusy, setImmBusy] = useState(false);
  const [immForm, setImmForm] = useState<{ yacht_id: string; list_date: string; notes: string; file: File | null; emirate: "dubai" | "abu_dhabi" }>({ yacht_id: "", list_date: "", notes: "", file: null, emirate: "dubai" });
  const [editId, setEditId] = useState<string | null>(null);
  const [selectedEvents, setSelectedEvents] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SignEvent | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  // Multi-select crew + in-modal search.
  const [selectedCrew, setSelectedCrew] = useState<string[]>([]);
  const [crewQ, setCrewQ] = useState("");
  // Reports dashboard
  const [reportsOpen, setReportsOpen] = useState(false);
  const [reportWeek, setReportWeek] = useState("");
  const [reportBusy, setReportBusy] = useState("");

  const REPORTS = [
    { path: "/api/reports/crew-movement", label: "Crew Movement", desc: "All movements — uses the current vessel & type filters", weekly: false },
    { path: "/api/reports/weekly-sign-on", label: "Weekly Sign-On", desc: "Sign-ons for the selected week", weekly: true },
    { path: "/api/reports/weekly-sign-off", label: "Weekly Sign-Off", desc: "Sign-offs for the selected week", weekly: true },
    { path: "/api/reports/crew-onboard", label: "Crew Onboard", desc: "Crew currently onboard, all vessels", weekly: false },
    { path: "/api/reports/crew-arriving", label: "Crew Arriving", desc: "Confirmed upcoming sign-ons", weekly: false },
    { path: "/api/reports/crew-departing", label: "Crew Departing", desc: "Confirmed upcoming sign-offs", weekly: false },
  ];

  async function downloadReport(path: string, format: "csv" | "pdf", weekly: boolean) {
    setReportBusy(`${path}:${format}`);
    try {
      const params = new URLSearchParams({ format });
      if (path.endsWith("/crew-movement")) {
        if (filterYacht !== "all") params.set("vessel_id", filterYacht);
        if (filterType !== "all") params.set("movement_type", filterType);
      }
      if (weekly && reportWeek) params.set("week", reportWeek);
      const res = await fetch(`${path}?${params}`, { headers: { Authorization: `Bearer ${(session as any)?.access_token ?? ""}` } });
      if (!res.ok) { toast.error("Could not generate report"); return; }
      const blob = await res.blob();
      const cd = res.headers.get("Content-Disposition") ?? "";
      const filename = /filename="([^"]+)"/.exec(cd)?.[1] ?? `report.${format}`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);
    } catch { toast.error("Could not generate report"); }
    finally { setReportBusy(""); }
  }

  useEffect(() => { void load(); void loadRefs(); }, []);

  async function load() {
    setLoading(true);
    const { data, error } = await fetchAllRows(() => (supabase as any).from("crew_signon_events").select("*").order("event_date", { ascending: false, nullsFirst: false }));
    if (error) toast.error(error.message);
    else setEvents(data ?? []);
    setLoading(false);
  }
  async function loadRefs() {
    const db = supabase as any;
    const [c, y] = await Promise.all([
      fetchAllRows(() => db.from("crew_members").select("id, first_name, last_name, rank, yacht_id").order("last_name")),
      fetchAllRows(() => supabase.from("yachts").select("id, vessel_name").order("vessel_name")),
    ]);
    setCrew(c.data ?? []);
    setYachts((y.data ?? []) as Yacht[]);
    const { data: imm } = await fetchAllRows(() => db.from("immigration_crew_lists").select("id, yacht_id, list_date, file_url, file_name, emirate").order("created_at", { ascending: false }));
    setImmLists((imm ?? []) as any);
  }

  // Latest immigration record per yacht, split by emirate (Dubai = document, Abu Dhabi = confirmation).
  const immByYacht = useMemo(() => {
    const dubai = new Map<string, typeof immLists[number]>();
    const auh = new Map<string, typeof immLists[number]>();
    for (const l of immLists) {
      const m = l.emirate === "abu_dhabi" ? auh : dubai;
      if (!m.has(l.yacht_id)) m.set(l.yacht_id, l);
    }
    return { dubai, auh, has: (y: string | null) => !!y && (dubai.has(y) || auh.has(y)) };
  }, [immLists]);

  const yachtOptions = useMemo(
    () => [{ value: "all", label: "All Yachts" }, ...yachts.map((y) => ({ value: y.id, label: y.vessel_name }))],
    [yachts],
  );

  async function saveImmList() {
    if (!immForm.yacht_id) { toast.error("Select a vessel"); return; }
    const isDubai = immForm.emirate === "dubai";
    if (isDubai && !immForm.file) { toast.error("Attach the Dubai immigration crew list file"); return; }
    setImmBusy(true);
    try {
      let fileUrl: string | null = null;
      let fileName: string | null = null;
      if (immForm.file) {
        const ext = immForm.file.name.split(".").pop();
        const path = `immigration/${immForm.yacht_id}/${immForm.emirate}_${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage.from("permit-documents").upload(path, immForm.file, { upsert: true });
        if (upErr) throw upErr;
        fileUrl = supabase.storage.from("permit-documents").getPublicUrl(path).data.publicUrl;
        fileName = immForm.file.name;
      }
      const { error } = await (supabase as any).from("immigration_crew_lists").insert([{
        yacht_id: immForm.yacht_id, list_date: immForm.list_date || null,
        port: isDubai ? "Dubai" : "Abu Dhabi", emirate: immForm.emirate, completed: true,
        file_url: fileUrl, file_name: fileName, notes: immForm.notes || null, created_by: user?.id,
      }]);
      if (error) throw error;
      toast.success(isDubai ? "Dubai immigration crew list added" : "Abu Dhabi immigration confirmed");
      setImmOpen(false);
      void loadRefs();
    } catch (e: any) { toast.error(e.message ?? "Could not save"); }
    finally { setImmBusy(false); }
  }

  function openNew() {
    setEditId(null);
    setForm({ ...EMPTY_FORM, event_date: new Date().toISOString().slice(0, 10) });
    setSelectedCrew([]);
    setCrewQ("");
    setOpen(true);
  }

  function openEdit(e: SignEvent) {
    setEditId(e.id);
    setForm({
      yacht_id: e.yacht_id ?? "", event_type: e.event_type, event_date: e.event_date ?? "",
      port: e.port ?? "", notes: e.notes ?? "",
      airline: e.airline ?? "", flight_number: e.flight_number ?? "",
      departure_airport: e.departure_airport ?? "", arrival_airport: e.arrival_airport ?? "",
      departure_datetime: e.departure_datetime ? e.departure_datetime.slice(0, 16) : "",
      arrival_datetime: e.arrival_datetime ? e.arrival_datetime.slice(0, 16) : "",
      pickup_required: !!e.pickup_required, pickup_time: e.pickup_time ? e.pickup_time.slice(0, 16) : "",
      crew_contact_number: e.crew_contact_number ?? "", driver_name: e.driver_name ?? "",
    });
    setSelectedCrew([e.crew_member_id]);
    setCrewQ("");
    setOpen(true);
  }

  // Crew shown in the picker: filtered by the chosen vessel, then by search text.
  const modalCrew = useMemo(() => {
    const s = crewQ.trim().toLowerCase();
    return crew.filter((c) => {
      if (form.yacht_id && c.yacht_id !== form.yacht_id) return false;
      if (s && !`${c.first_name} ${c.last_name} ${c.rank ?? ""}`.toLowerCase().includes(s)) return false;
      return true;
    });
  }, [crew, form.yacht_id, crewQ]);

  const toggleCrew = (id: string) =>
    setSelectedCrew((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);

  // Flight / logistics fields shared across the batch (blank → null).
  function movementFields() {
    return {
      yacht_id: form.yacht_id || null,
      event_type: form.event_type,
      event_date: form.event_date || null,
      port: form.port || null,
      notes: form.notes || null,
      airline: form.airline || null,
      flight_number: form.flight_number || null,
      departure_airport: form.departure_airport ? form.departure_airport.toUpperCase() : null,
      arrival_airport: form.arrival_airport ? form.arrival_airport.toUpperCase() : null,
      departure_datetime: form.departure_datetime || null,
      arrival_datetime: form.arrival_datetime || null,
      pickup_required: !!form.pickup_required,
      pickup_time: form.pickup_required ? (form.pickup_time || null) : null,
      crew_contact_number: form.crew_contact_number || null,
      driver_name: form.driver_name || null,
    };
  }

  // Best-effort email to ops/visa team (in-app notifications fire via DB trigger).
  function notifyMovement(crewIds: string[]) {
    fetch("/api/movements/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${(session as any)?.access_token ?? ""}` },
      body: JSON.stringify({
        crew_ids: crewIds, yacht_id: form.yacht_id || null, event_type: form.event_type,
        event_date: form.event_date || null, port: form.port || null,
        airline: form.airline || null, flight_number: form.flight_number || null,
      }),
    }).catch(() => {});
  }

  async function save() {
    if (selectedCrew.length === 0) { toast.error("Select at least one crew member"); return; }
    setBusy(true);
    try {
      // Edit mode — update the single existing event.
      if (editId) {
        const { error } = await (supabase as any).from("crew_signon_events").update({
          ...movementFields(), crew_member_id: selectedCrew[0],
        }).eq("id", editId);
        if (error) throw error;
        await (supabase as any).from("crew_members")
          .update({ status: form.event_type === "sign_on" ? "active" : "off_signed", updated_at: new Date().toISOString() })
          .eq("id", selectedCrew[0]);
        doPushToSharePoint({ data: { target: "crew_signon_events", id: editId } } as any).catch(() => {});
        notifyMovement(selectedCrew);
        toast.success("Event updated");
        setOpen(false); setEditId(null); void load();
        return;
      }
      const fields = movementFields();
      const rows = selectedCrew.map((id) => ({ ...fields, crew_member_id: id, created_by: user?.id }));
      const { data: saved, error } = await (supabase as any)
        .from("crew_signon_events").insert(rows).select("id");
      if (error) throw error;
      // Bulk-update crew status for everyone in this batch.
      await (supabase as any).from("crew_members")
        .update({ status: form.event_type === "sign_on" ? "active" : "off_signed", updated_at: new Date().toISOString() })
        .in("id", selectedCrew);
      // Mirror each event to the SharePoint "Crew Sign On Off" list (best-effort).
      (saved ?? []).forEach((s: any) => {
        if (s?.id) doPushToSharePoint({ data: { target: "crew_signon_events", id: s.id } } as any).catch(() => {});
      });
      notifyMovement(selectedCrew);
      const verb = form.event_type === "sign_on" ? "signed on" : "signed off";
      toast.success(`${selectedCrew.length} crew ${verb}`);
      setOpen(false);
      void load();
    } catch (e: any) { toast.error(e.message ?? "Save failed"); }
    finally { setBusy(false); }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const { error } = await (supabase as any).from("crew_signon_events").delete().eq("id", deleteTarget.id);
    if (error) toast.error(error.message);
    else { toast.success("Event removed"); void load(); }
    setDeleteTarget(null);
  }

  const crewName = (id: string) => { const c = crew.find((m) => m.id === id); return c ? `${c.first_name} ${c.last_name}` : "—"; };
  const yachtName = (id: string | null) => yachts.find((y) => y.id === id)?.vessel_name ?? "—";
  const fmtDate = (d: string | null) => d ? new Date(d + "T00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" }) : "—";

  const filtered = useMemo(() => events.filter((e) => {
    if (filterType !== "all" && e.event_type !== filterType) return false;
    if (filterYacht !== "all" && e.yacht_id !== filterYacht) return false;
    if (filterImm !== "all") {
      const hasList = !!(e.yacht_id && immByYacht.has(e.yacht_id));
      if (filterImm === "with" && !hasList) return false;
      if (filterImm === "missing" && hasList) return false;
    }
    if (q.trim()) {
      const s = q.toLowerCase();
      if (![crewName(e.crew_member_id), yachtName(e.yacht_id), e.port].join(" ").toLowerCase().includes(s)) return false;
    }
    return true;
  }), [events, q, filterType, filterYacht, filterImm, immByYacht, crew, yachts]);

  const toggleEvent = (id: string) => setSelectedEvents((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]);
  const allSelected = filtered.length > 0 && filtered.every((e) => selectedEvents.includes(e.id));
  const toggleAll = () => setSelectedEvents(allSelected ? [] : filtered.map((e) => e.id));

  function generateReport() {
    const rows = events.filter((e) => selectedEvents.includes(e.id));
    if (rows.length === 0) return;
    const esc = (v: string) => `"${(v ?? "").replace(/"/g, '""')}"`;
    const header = ["Event", "Crew Member", "Vessel", "Date", "Port", "Dubai Immigration", "Abu Dhabi Immigration", "Notes"];
    const lines = rows.map((e) => [
      e.event_type === "sign_on" ? "Sign On" : "Sign Off",
      crewName(e.crew_member_id), yachtName(e.yacht_id), fmtDate(e.event_date), e.port ?? "",
      e.yacht_id && immByYacht.dubai.has(e.yacht_id) ? "Yes" : "No",
      e.yacht_id && immByYacht.auh.has(e.yacht_id) ? "Yes" : "No",
      e.notes ?? "",
    ].map(esc).join(","));
    const csv = [header.map(esc).join(","), ...lines].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url; a.download = `sign-on-off-report-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
    toast.success(`Report generated — ${rows.length} event${rows.length === 1 ? "" : "s"}`);
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-border/70 bg-card/30 px-6 py-3.5">
        <div>
          <div className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground/60">Crew &amp; Immigration</div>
          <h1 className="mt-0.5 font-display text-[1.25rem] font-semibold tracking-tight">Sign On / Sign Off</h1>
        </div>
        <div className="flex items-center gap-2.5">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/50" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="h-9 w-56 pl-8 text-sm" />
          </div>
          <SearchableSelect value={filterYacht} onValueChange={setFilterYacht} options={yachtOptions} placeholder="All Yachts" className="w-44" />
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="h-9 w-32 text-xs"><SelectValue placeholder="All Events" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Events</SelectItem>
              <SelectItem value="sign_on">Sign On</SelectItem>
              <SelectItem value="sign_off">Sign Off</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterImm} onValueChange={setFilterImm}>
            <SelectTrigger className="h-9 w-48 text-xs"><SelectValue placeholder="Immigration list" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any immigration status</SelectItem>
              <SelectItem value="with">With immigration crew list</SelectItem>
              <SelectItem value="missing">Missing immigration crew list</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" onClick={() => { setImmForm({ yacht_id: filterYacht !== "all" ? filterYacht : "", list_date: new Date().toISOString().slice(0, 10), notes: "", file: null, emirate: "dubai" }); setImmOpen(true); }} className="h-9 gap-1.5 px-3 text-xs"><FileText className="h-3.5 w-3.5" /> Dubai Imm.</Button>
          <Button size="sm" variant="outline" onClick={() => { setImmForm({ yacht_id: filterYacht !== "all" ? filterYacht : "", list_date: new Date().toISOString().slice(0, 10), notes: "", file: null, emirate: "abu_dhabi" }); setImmOpen(true); }} className="h-9 gap-1.5 px-3 text-xs"><FileText className="h-3.5 w-3.5" /> AUH Imm.</Button>
          <Button size="sm" variant="outline" onClick={() => setReportsOpen(true)} className="h-9 gap-1.5 px-3 text-xs"><BarChart3 className="h-3.5 w-3.5" /> Reports</Button>
          <Button size="sm" onClick={openNew} className="h-9 gap-1.5 px-3.5 font-medium shadow-sm"><Plus className="h-3.5 w-3.5" /> Record Event</Button>
        </div>
      </header>

      <div className="flex-1 overflow-auto px-6 py-5">
        {loading ? (
          <div className="flex h-40 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : filtered.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center rounded-xl border border-dashed border-border text-center">
            <LogIn className="h-10 w-10 text-muted-foreground/40 mb-3" />
            <p className="font-display text-base font-semibold">{q || filterType !== "all" ? "No events match" : "No sign-on / sign-off events yet"}</p>
            <p className="text-sm text-muted-foreground mt-1">Record crew movements as they join or leave a vessel.</p>
            {!q && filterType === "all" && <Button onClick={openNew} className="mt-4 gap-1.5"><Plus className="h-4 w-4" /> Record First Event</Button>}
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-[0_2px_12px_-4px_rgba(0,0,0,0.4)]">
            {selectedEvents.length > 0 && (
              <div className="flex items-center justify-between border-b border-border bg-primary/5 px-4 py-2">
                <span className="text-[12.5px] font-medium">{selectedEvents.length} selected</span>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={() => setSelectedEvents([])}>Clear</Button>
                  <Button size="sm" className="h-7 gap-1.5 text-xs" onClick={generateReport}><FileText className="h-3.5 w-3.5" /> Generate report</Button>
                </div>
              </div>
            )}
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border bg-muted/30">
                <th className="w-10 px-3 py-2.5"><input type="checkbox" checked={allSelected} onChange={toggleAll} className="accent-primary" aria-label="Select all" /></th>
                {["Event", "Crew Member", "Vessel", "Date", "Port", "Immigration", ""].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-left text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground whitespace-nowrap">{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {filtered.map((e) => {
                  const dxb = e.yacht_id ? immByYacht.dubai.get(e.yacht_id) : undefined;
                  const auh = e.yacht_id ? immByYacht.auh.get(e.yacht_id) : undefined;
                  return (
                  <tr key={e.id} className="border-b border-border/40 hover:bg-accent/20 transition-colors">
                    <td className="px-3 py-3"><input type="checkbox" checked={selectedEvents.includes(e.id)} onChange={() => toggleEvent(e.id)} className="accent-primary" /></td>
                    <td className="px-4 py-3">
                      <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
                        e.event_type === "sign_on" ? "bg-emerald-500/15 text-emerald-600" : "bg-amber-500/15 text-amber-600")}>
                        {e.event_type === "sign_on" ? <LogIn className="h-3 w-3" /> : <LogOut className="h-3 w-3" />}
                        {e.event_type === "sign_on" ? "Sign On" : "Sign Off"}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium">{crewName(e.crew_member_id)}</td>
                    <td className="px-4 py-3 text-foreground/80">{yachtName(e.yacht_id)}</td>
                    <td className="px-4 py-3 tabular-nums text-muted-foreground">{fmtDate(e.event_date)}</td>
                    <td className="px-4 py-3 text-foreground/70">{e.port ?? "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        {dxb ? (
                          <a href={dxb.file_url ?? "#"} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 hover:underline"><CheckCircle2 className="h-3 w-3" /> DXB list</a>
                        ) : <span className="text-[10.5px] text-amber-600">DXB: missing</span>}
                        {auh ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600"><CheckCircle2 className="h-3 w-3" /> AUH done</span>
                        ) : <span className="text-[10.5px] text-muted-foreground/60">AUH: —</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-0.5">
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground/60 hover:text-primary" onClick={() => openEdit(e)} title="Edit">
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground/60 hover:text-destructive" onClick={() => setDeleteTarget(e)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );})}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[88vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editId ? "Edit" : "Record"} Sign On / Sign Off</DialogTitle></DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Event Type</Label>
              <div className="grid grid-cols-2 gap-2">
                {(["sign_on", "sign_off"] as const).map((t) => (
                  <button key={t} onClick={() => setForm((f) => ({ ...f, event_type: t }))}
                    className={cn("flex items-center justify-center gap-1.5 rounded-lg border py-2 text-sm font-medium transition",
                      form.event_type === t ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-accent")}>
                    {t === "sign_on" ? <LogIn className="h-4 w-4" /> : <LogOut className="h-4 w-4" />}
                    {t === "sign_on" ? "Sign On" : "Sign Off"}
                  </button>
                ))}
              </div>
            </div>
            {/* Vessel first — filters the crew list below to that yacht's crew. */}
            <div className="space-y-1.5">
              <Label className="text-xs">Vessel</Label>
              <Select value={form.yacht_id || "__all"} onValueChange={(v) => { setForm((f) => ({ ...f, yacht_id: v === "__all" ? "" : v })); setSelectedCrew([]); }}>
                <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="All vessels" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all">All vessels</SelectItem>
                  {yachts.map((y) => <SelectItem key={y.id} value={y.id}>{y.vessel_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Searchable multi-select crew list. */}
            <div className="space-y-1.5">
              <Label className="text-xs">Crew Members <span className="text-destructive">*</span> <span className="text-muted-foreground">— select one or more</span></Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/50" />
                <Input value={crewQ} onChange={(e) => setCrewQ(e.target.value)} placeholder="Search crew…" className="h-8 pl-8 text-sm" />
              </div>
              <div className="max-h-44 overflow-auto rounded-lg border border-border">
                {modalCrew.length === 0 ? (
                  <p className="px-3 py-4 text-center text-[13px] text-muted-foreground/70">
                    {form.yacht_id ? "No crew assigned to this vessel." : "No crew match your search."}
                  </p>
                ) : (
                  modalCrew.map((c) => {
                    const checked = selectedCrew.includes(c.id);
                    return (
                      <button key={c.id} type="button" onClick={() => toggleCrew(c.id)}
                        className={cn("flex w-full items-center gap-2.5 border-b border-border/50 px-3 py-2 text-left text-sm last:border-0 transition",
                          checked ? "bg-primary/10" : "hover:bg-accent")}>
                        <span className={cn("flex h-4 w-4 items-center justify-center rounded border", checked ? "border-primary bg-primary text-primary-foreground" : "border-border")}>
                          {checked && <span className="text-[10px] leading-none">✓</span>}
                        </span>
                        <span className="flex-1">{c.first_name} {c.last_name}</span>
                        {c.rank && <span className="text-[11px] text-muted-foreground">{c.rank}</span>}
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Date</Label>
                <Input type="date" value={form.event_date} onChange={(e) => setForm((f) => ({ ...f, event_date: e.target.value }))} className="h-8" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Port</Label>
                <Input value={form.port} onChange={(e) => setForm((f) => ({ ...f, port: e.target.value }))} className="h-8" placeholder="e.g. Port Rashid, Dubai" />
              </div>
            </div>
            {/* Flight & logistics — applied to all selected crew (same flight/batch). */}
            <div className="rounded-lg border border-border/70 p-3">
              <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Flight &amp; logistics <span className="font-normal normal-case">— applies to the whole batch</span></p>
              <div className="grid gap-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Airline</Label>
                    <Input value={form.airline} onChange={(e) => setForm((f) => ({ ...f, airline: e.target.value }))} className="h-8" placeholder="e.g. Emirates" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Flight no.</Label>
                    <Input value={form.flight_number} onChange={(e) => setForm((f) => ({ ...f, flight_number: e.target.value }))} className="h-8" placeholder="e.g. EK204" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">From (IATA)</Label>
                    <Input value={form.departure_airport} onChange={(e) => setForm((f) => ({ ...f, departure_airport: e.target.value }))} className="h-8 uppercase" maxLength={4} placeholder="LHR" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">To (IATA)</Label>
                    <Input value={form.arrival_airport} onChange={(e) => setForm((f) => ({ ...f, arrival_airport: e.target.value }))} className="h-8 uppercase" maxLength={4} placeholder="DXB" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Departure</Label>
                    <Input type="datetime-local" value={form.departure_datetime} onChange={(e) => setForm((f) => ({ ...f, departure_datetime: e.target.value }))} className="h-8" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Arrival</Label>
                    <Input type="datetime-local" value={form.arrival_datetime} onChange={(e) => setForm((f) => ({ ...f, arrival_datetime: e.target.value }))} className="h-8" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Driver</Label>
                    <Input value={form.driver_name} onChange={(e) => setForm((f) => ({ ...f, driver_name: e.target.value }))} className="h-8" placeholder="Driver / coordinator" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Crew contact</Label>
                    <Input value={form.crew_contact_number} onChange={(e) => setForm((f) => ({ ...f, crew_contact_number: e.target.value }))} className="h-8" placeholder="Phone" />
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={form.pickup_required} onChange={(e) => setForm((f) => ({ ...f, pickup_required: e.target.checked }))} className="accent-primary" />
                    Pickup required
                  </label>
                  {form.pickup_required && (
                    <Input type="datetime-local" value={form.pickup_time} onChange={(e) => setForm((f) => ({ ...f, pickup_time: e.target.value }))} className="h-8 flex-1" />
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Notes</Label>
              <Textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={2} className="resize-none text-sm" />
            </div>

            {/* Summary of the batch about to be recorded. */}
            {selectedCrew.length > 0 && (
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-xs font-semibold">
                    {selectedCrew.length} crew to {form.event_type === "sign_on" ? "sign on" : "sign off"}
                  </span>
                  <button type="button" onClick={() => setSelectedCrew([])} className="text-[11px] text-muted-foreground hover:text-foreground underline">Clear</button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {selectedCrew.map((id) => (
                    <span key={id} className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[11px] text-primary">
                      {crewName(id)}
                      <button type="button" onClick={() => toggleCrew(id)} className="text-primary/60 hover:text-primary">✕</button>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
            <Button onClick={save} disabled={busy || selectedCrew.length === 0} className="gap-1.5">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {form.event_type === "sign_on" ? "Sign On" : "Sign Off"}{selectedCrew.length > 0 ? ` ${selectedCrew.length}` : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={immOpen} onOpenChange={setImmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{immForm.emirate === "dubai" ? "Dubai Immigration Crew List" : "Abu Dhabi Immigration"}</DialogTitle></DialogHeader>
          <p className="text-[12px] text-muted-foreground">
            {immForm.emirate === "dubai"
              ? "Upload the Dubai immigration crew list for a vessel — uploading the document marks it complete. Shown against each of the vessel's crew."
              : "Confirm Abu Dhabi immigration has been completed for this vessel. No document required — just tick to confirm."}
          </p>
          <div className="grid gap-3 py-2">
            {/* Emirate toggle */}
            <div className="grid grid-cols-2 gap-2">
              {(["dubai", "abu_dhabi"] as const).map((em) => (
                <button key={em} type="button" onClick={() => setImmForm((f) => ({ ...f, emirate: em }))}
                  className={cn("rounded-lg border py-2 text-sm font-medium transition",
                    immForm.emirate === em ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-accent")}>
                  {em === "dubai" ? "Dubai" : "Abu Dhabi"}
                </button>
              ))}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Vessel <span className="text-destructive">*</span></Label>
              <SearchableSelect value={immForm.yacht_id} onValueChange={(v) => setImmForm((f) => ({ ...f, yacht_id: v }))}
                options={yachts.map((y) => ({ value: y.id, label: y.vessel_name }))} placeholder="— Select vessel —" triggerClassName="h-8" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Date</Label>
              <Input type="date" value={immForm.list_date} onChange={(e) => setImmForm((f) => ({ ...f, list_date: e.target.value }))} className="h-8" />
            </div>
            {immForm.emirate === "dubai" ? (
              <div className="space-y-1.5">
                <Label className="text-xs">Crew list file <span className="text-destructive">*</span></Label>
                <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2.5 text-sm hover:bg-accent">
                  <Upload className="h-4 w-4 text-muted-foreground" />
                  <span className="flex-1 truncate text-muted-foreground">{immForm.file ? immForm.file.name : "Choose file (PDF / image / Excel)"}</span>
                  <input type="file" className="hidden" accept=".pdf,.png,.jpg,.jpeg,.xlsx,.xls,.doc,.docx"
                    onChange={(e) => setImmForm((f) => ({ ...f, file: e.target.files?.[0] ?? null }))} />
                </label>
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-lg border border-border px-3 py-2.5 text-sm">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                <span>Abu Dhabi immigration completed for this vessel</span>
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-xs">Notes</Label>
              <Textarea value={immForm.notes} onChange={(e) => setImmForm((f) => ({ ...f, notes: e.target.value }))} rows={2} className="resize-none text-sm" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImmOpen(false)} disabled={immBusy}>Cancel</Button>
            <Button onClick={saveImmList} disabled={immBusy} className="gap-1.5">{immBusy && <Loader2 className="h-4 w-4 animate-spin" />} Save list</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={reportsOpen} onOpenChange={setReportsOpen}>
        <DialogContent className="max-w-lg max-h-[88vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Immigration &amp; Movement Reports</DialogTitle></DialogHeader>
          <div className="space-y-1.5 py-1">
            <Label className="text-xs">Week (for weekly reports)</Label>
            <Input type="date" value={reportWeek} onChange={(e) => setReportWeek(e.target.value)} className="h-8 w-48" />
            <p className="text-[11px] text-muted-foreground">Defaults to the current week. Any date in the week works.</p>
          </div>
          <div className="divide-y divide-border">
            {REPORTS.map((r) => (
              <div key={r.path} className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{r.label}</p>
                  <p className="text-[11px] text-muted-foreground">{r.desc}</p>
                </div>
                <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" disabled={!!reportBusy} onClick={() => downloadReport(r.path, "csv", r.weekly)}>
                  {reportBusy === `${r.path}:csv` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />} CSV
                </Button>
                <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" disabled={!!reportBusy} onClick={() => downloadReport(r.path, "pdf", r.weekly)}>
                  {reportBusy === `${r.path}:pdf` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />} PDF
                </Button>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete event?</AlertDialogTitle>
            <AlertDialogDescription>This sign-on/sign-off record will be permanently removed.</AlertDialogDescription>
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

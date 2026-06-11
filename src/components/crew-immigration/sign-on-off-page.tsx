import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/fetch-all";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Search, LogIn, LogOut, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type CrewLite = { id: string; first_name: string; last_name: string; rank: string | null };
type Yacht = { id: string; vessel_name: string };
type SignEvent = {
  id: string;
  crew_member_id: string;
  yacht_id: string | null;
  event_type: "sign_on" | "sign_off";
  event_date: string | null;
  port: string | null;
  notes: string | null;
};

export function SignOnOffPage() {
  const { user } = useAuth();
  const [events, setEvents] = useState<SignEvent[]>([]);
  const [crew, setCrew] = useState<CrewLite[]>([]);
  const [yachts, setYachts] = useState<Yacht[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SignEvent | null>(null);
  const [form, setForm] = useState({
    crew_member_id: "", yacht_id: "", event_type: "sign_on", event_date: "", port: "", notes: "",
  });

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
      fetchAllRows(() => db.from("crew_members").select("id, first_name, last_name, rank").order("last_name")),
      fetchAllRows(() => supabase.from("yachts").select("id, vessel_name").order("vessel_name")),
    ]);
    setCrew(c.data ?? []);
    setYachts((y.data ?? []) as Yacht[]);
  }

  function openNew() {
    setForm({ crew_member_id: "", yacht_id: "", event_type: "sign_on", event_date: new Date().toISOString().slice(0, 10), port: "", notes: "" });
    setOpen(true);
  }

  async function save() {
    if (!form.crew_member_id) { toast.error("Select a crew member"); return; }
    setBusy(true);
    try {
      const { error } = await (supabase as any).from("crew_signon_events").insert([{
        crew_member_id: form.crew_member_id,
        yacht_id: form.yacht_id || null,
        event_type: form.event_type,
        event_date: form.event_date || null,
        port: form.port || null,
        notes: form.notes || null,
        created_by: user?.id,
      }]);
      if (error) throw error;
      // Optionally update crew status
      await (supabase as any).from("crew_members")
        .update({ status: form.event_type === "sign_on" ? "active" : "off_signed", updated_at: new Date().toISOString() })
        .eq("id", form.crew_member_id);
      toast.success(form.event_type === "sign_on" ? "Sign-on recorded" : "Sign-off recorded");
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
    if (q.trim()) {
      const s = q.toLowerCase();
      if (![crewName(e.crew_member_id), yachtName(e.yacht_id), e.port].join(" ").toLowerCase().includes(s)) return false;
    }
    return true;
  }), [events, q, filterType, crew, yachts]);

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
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="h-9 w-36 text-xs"><SelectValue placeholder="All Events" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Events</SelectItem>
              <SelectItem value="sign_on">Sign On</SelectItem>
              <SelectItem value="sign_off">Sign Off</SelectItem>
            </SelectContent>
          </Select>
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
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border bg-muted/30">
                {["Event", "Crew Member", "Vessel", "Date", "Port", ""].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-left text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground whitespace-nowrap">{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {filtered.map((e) => (
                  <tr key={e.id} className="border-b border-border/40 hover:bg-accent/20 transition-colors">
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
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground/60 hover:text-destructive" onClick={() => setDeleteTarget(e)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Record Sign On / Sign Off</DialogTitle></DialogHeader>
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
            <div className="space-y-1.5">
              <Label className="text-xs">Crew Member <span className="text-destructive">*</span></Label>
              <Select value={form.crew_member_id || "__none"} onValueChange={(v) => setForm((f) => ({ ...f, crew_member_id: v === "__none" ? "" : v }))}>
                <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="— Select —" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">— Select —</SelectItem>
                  {crew.map((c) => <SelectItem key={c.id} value={c.id}>{c.first_name} {c.last_name}{c.rank ? ` · ${c.rank}` : ""}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Vessel</Label>
                <Select value={form.yacht_id || "__none"} onValueChange={(v) => setForm((f) => ({ ...f, yacht_id: v === "__none" ? "" : v }))}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="— None —" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">— None —</SelectItem>
                    {yachts.map((y) => <SelectItem key={y.id} value={y.id}>{y.vessel_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Date</Label>
                <Input type="date" value={form.event_date} onChange={(e) => setForm((f) => ({ ...f, event_date: e.target.value }))} className="h-8" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Port</Label>
              <Input value={form.port} onChange={(e) => setForm((f) => ({ ...f, port: e.target.value }))} className="h-8" placeholder="e.g. Port Rashid, Dubai" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Notes</Label>
              <Textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={2} className="resize-none text-sm" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
            <Button onClick={save} disabled={busy} className="gap-1.5">{busy && <Loader2 className="h-4 w-4 animate-spin" />} Record Event</Button>
          </DialogFooter>
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

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Loader2, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
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
import { loadCalendarEvents, calendarEventCrud, type TrainingCalendarEvent } from "@/lib/training/data";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const CATEGORY_OPTIONS = ["Class", "Exam", "Holiday", "Meeting", "Other"];
const CATEGORY_COLORS: Record<string, string> = {
  Class:   "bg-sky-500/15 text-sky-400 border-sky-500/20",
  Exam:    "bg-amber-500/15 text-amber-400 border-amber-500/20",
  Holiday: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  Meeting: "bg-violet-500/15 text-violet-400 border-violet-500/20",
  Other:   "bg-muted text-muted-foreground border-border",
};
const categoryClass = (c: string | null) => CATEGORY_COLORS[c ?? ""] ?? CATEGORY_COLORS.Other;

const toDateStr = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const todayStr = () => toDateStr(new Date());

/** Always 42 cells (6 full weeks), Monday-first — same convention ShipSync's
 *  WEEKDAYS uses. A fixed 6 rows keeps the grid a stable height across every
 *  month, at the cost of an occasional all-next-month trailing row. */
function buildMonthGrid(monthDate: Date): Date[] {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7; // 0=Mon…6=Sun
  const gridStart = new Date(year, month, 1 - firstWeekday);
  return Array.from({ length: 42 }, (_, i) => new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i));
}

export function CalendarTab() {
  const [events, setEvents] = useState<TrainingCalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(() => { const d = new Date(); d.setDate(1); return d; });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TrainingCalendarEvent | null>(null);
  const [defaultDate, setDefaultDate] = useState<string>(todayStr());

  async function reload() { setEvents(await loadCalendarEvents()); }
  useEffect(() => { setLoading(true); void reload().finally(() => setLoading(false)); }, []);

  const grid = useMemo(() => buildMonthGrid(month), [month]);
  const eventsByDate = useMemo(() => {
    const map = new Map<string, TrainingCalendarEvent[]>();
    for (const e of events) {
      if (!map.has(e.event_date)) map.set(e.event_date, []);
      map.get(e.event_date)!.push(e);
    }
    for (const list of map.values()) list.sort((a, b) => (a.time_of_day ?? "").localeCompare(b.time_of_day ?? ""));
    return map;
  }, [events]);

  function openNew(dateStr: string) { setEditing(null); setDefaultDate(dateStr); setDialogOpen(true); }
  function openEdit(e: TrainingCalendarEvent) { setEditing(e); setDialogOpen(true); }

  if (loading) return <div className="flex h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="flex h-full min-w-0 flex-col px-6 py-5">
      <div className="mb-3 flex shrink-0 items-center gap-2.5">
        <div className="flex items-center gap-1 rounded-lg border border-border bg-card/50 p-1">
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="w-36 text-center font-display text-sm font-semibold">
            {month.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}
          </span>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <Button variant="outline" size="sm" className="h-9" onClick={() => { const d = new Date(); d.setDate(1); setMonth(d); }}>
          Today
        </Button>
        <Button size="sm" onClick={() => openNew(todayStr())} className="ml-auto h-9 gap-1.5">
          <Plus className="h-4 w-4" /> Add event
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-border bg-card">
        <div className="grid grid-cols-7 border-b border-border/60 bg-muted/20">
          {WEEKDAYS.map((w) => (
            <div key={w} className="px-2 py-2 text-center text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">{w}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 [&>*:nth-child(7n)]:border-r-0">
          {grid.map((date) => {
            const dateStr = toDateStr(date);
            const inMonth = date.getMonth() === month.getMonth();
            const isToday = dateStr === todayStr();
            const dayEvents = eventsByDate.get(dateStr) ?? [];
            return (
              <button
                key={dateStr}
                onClick={() => openNew(dateStr)}
                className={cn(
                  "flex min-h-[92px] flex-col items-stretch gap-1 border-b border-r border-border/40 p-1.5 text-left align-top transition-colors hover:bg-accent/20",
                  !inMonth && "bg-muted/10",
                )}
              >
                <span className={cn(
                  "self-start rounded px-1.5 py-0.5 text-[11px] font-semibold tabular-nums",
                  !inMonth && "text-muted-foreground/40",
                  inMonth && !isToday && "text-muted-foreground",
                  isToday && "bg-primary text-primary-foreground",
                )}>
                  {date.getDate()}
                </span>
                <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
                  {dayEvents.map((e) => (
                    <span
                      key={e.id}
                      onClick={(ev) => { ev.stopPropagation(); openEdit(e); }}
                      title={e.title}
                      className={cn("truncate rounded border px-1.5 py-0.5 text-[10.5px] font-medium", categoryClass(e.category))}
                    >
                      {e.time_of_day ? <span className="font-mono">{e.time_of_day} </span> : null}{e.title}
                    </span>
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <EventDialog
        open={dialogOpen}
        editing={editing}
        defaultDate={defaultDate}
        onClose={() => setDialogOpen(false)}
        onSaved={reload}
      />
    </div>
  );
}

function EventDialog({
  open, editing, defaultDate, onClose, onSaved,
}: {
  open: boolean;
  editing: TrainingCalendarEvent | null;
  defaultDate: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const blank = { event_date: defaultDate, title: "", time_of_day: "", category: "", notes: "" };
  const [form, setForm] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    setForm(editing ? {
      event_date:  editing.event_date,
      title:       editing.title,
      time_of_day: editing.time_of_day ?? "",
      category:    editing.category ?? "",
      notes:       editing.notes ?? "",
    } : { ...blank, event_date: defaultDate });
  }, [editing, defaultDate, open]);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function save() {
    if (!form.title.trim() || !form.event_date) { toast.error("Title and date are required"); return; }
    setBusy(true);
    const payload = {
      event_date:  form.event_date,
      title:       form.title.trim(),
      time_of_day: form.time_of_day.trim() || null,
      category:    form.category || null,
      notes:       form.notes.trim() || null,
    };
    try {
      if (editing) await calendarEventCrud.patch(editing.id, payload);
      else await calendarEventCrud.create(payload);
      toast.success(editing ? "Event updated" : "Event added");
      onClose();
      await onSaved();
    } catch (e: any) { toast.error(e?.message ?? "Save failed"); }
    finally { setBusy(false); }
  }

  async function remove() {
    if (!editing) return;
    setBusy(true);
    try {
      await calendarEventCrud.remove(editing.id);
      toast.success("Event removed");
      setConfirmDelete(false);
      onClose();
      await onSaved();
    } catch (e: any) { toast.error(e?.message ?? "Delete failed"); }
    finally { setBusy(false); }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editing ? "Edit event" : "Add event"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-1">
            <div className="space-y-1.5"><Label className="text-xs">Date *</Label>
              <Input type="date" value={form.event_date} onChange={(e) => set("event_date", e.target.value)} className="h-9" /></div>
            <div className="space-y-1.5"><Label className="text-xs">Time</Label>
              <Input value={form.time_of_day} onChange={(e) => set("time_of_day", e.target.value)} placeholder="e.g. 10:00 or All day" className="h-9" /></div>
            <div className="col-span-2 space-y-1.5"><Label className="text-xs">Title *</Label>
              <Input value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. STCW exam — Batch 3" className="h-9" autoFocus /></div>
            <div className="col-span-2 space-y-1.5"><Label className="text-xs">Category</Label>
              <Select value={form.category || "none"} onValueChange={(v) => set("category", v === "none" ? "" : v)}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— None —</SelectItem>
                  {CATEGORY_OPTIONS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select></div>
            <div className="col-span-2 space-y-1.5"><Label className="text-xs">Notes</Label>
              <Textarea rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Optional notes" className="resize-none text-sm" /></div>
          </div>
          <DialogFooter className="sm:justify-between">
            {editing ? (
              <Button variant="ghost" className="gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => setConfirmDelete(true)} disabled={busy}>
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </Button>
            ) : <span />}
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
              <Button onClick={save} disabled={busy}>
                {busy && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                {editing ? "Save changes" : "Add event"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this event?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{editing?.title}</strong> on {editing?.event_date} will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={remove} disabled={busy} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

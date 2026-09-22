/**
 * Orbit 2 — add or edit a task.
 *
 * Everything the dashboard draws comes from here, so the form asks for exactly
 * those things and nothing else: what it is, which service, which vessel,
 * whether it is done, when it runs, and who holds it. Only the title is
 * required — a task noted in a hurry should still be capturable, and the
 * dashboard simply leaves an incomplete one out of the figures it cannot serve.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { ORBIT2_CATEGORIES } from "./orbit2-constants";
import type { Orbit2Task, Yacht } from "./orbit2-data";

const BLANK = {
  title: "", category: "Vessel Services" as string, yacht_id: "",
  status: "pending" as "pending" | "complete",
  task_date: "", start_time: "", end_time: "", assigned_to: "", notes: "",
};

export function Orbit2TaskDialog({
  open, editing, yachts, onClose, onSaved,
}: {
  open: boolean;
  editing: Orbit2Task | null;
  yachts: Yacht[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { user } = useAuth();
  const [form, setForm] = useState(BLANK);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setForm(editing ? {
      title: editing.title,
      category: editing.category,
      yacht_id: editing.yacht_id ?? "",
      status: editing.status,
      task_date: editing.task_date ?? "",
      start_time: editing.start_time?.slice(0, 5) ?? "",
      end_time: editing.end_time?.slice(0, 5) ?? "",
      assigned_to: editing.assigned_to ?? "",
      notes: editing.notes ?? "",
    } : BLANK);
  }, [editing, open]);

  const set = (k: keyof typeof BLANK, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function save() {
    if (!form.title.trim()) { toast.error("Give the task a name"); return; }
    if (form.start_time && form.end_time && form.end_time <= form.start_time) {
      toast.error("The end time must be after the start time");
      return;
    }
    setBusy(true);
    const payload = {
      title: form.title.trim(),
      category: form.category,
      yacht_id: form.yacht_id || null,
      status: form.status,
      task_date: form.task_date || null,
      start_time: form.start_time || null,
      end_time: form.end_time || null,
      assigned_to: form.assigned_to.trim() || null,
      notes: form.notes.trim() || null,
      updated_at: new Date().toISOString(),
    };
    const { error } = editing
      ? await (supabase as any).from("orbit2_tasks").update(payload).eq("id", editing.id)
      : await (supabase as any).from("orbit2_tasks").insert([{ ...payload, created_by: user?.id ?? null }]);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(editing ? "Task updated" : "Task added");
    onClose();
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{editing ? "Edit task" : "New task"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3 py-1">
          <Field label="Task *" full>
            <Input value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Bunkering — 12,000L MGO" />
          </Field>

          <Field label="Service">
            <Select value={form.category} onValueChange={(v) => set("category", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ORBIT2_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Vessel">
            <Select value={form.yacht_id || "__none"} onValueChange={(v) => set("yacht_id", v === "__none" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="— None —" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">— None —</SelectItem>
                {yachts.map((y) => <SelectItem key={y.id} value={y.id}>{y.vessel_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Date">
            <Input type="date" value={form.task_date} onChange={(e) => set("task_date", e.target.value)} />
          </Field>

          <Field label="Status">
            <Select value={form.status} onValueChange={(v) => set("status", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="complete">Complete</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          <Field label="Start time">
            <Input type="time" value={form.start_time} onChange={(e) => set("start_time", e.target.value)} />
          </Field>

          <Field label="End time">
            <Input type="time" value={form.end_time} onChange={(e) => set("end_time", e.target.value)} />
          </Field>

          <Field label="Assigned to" full>
            <Input value={form.assigned_to} onChange={(e) => set("assigned_to", e.target.value)} placeholder="Team member" />
          </Field>

          <Field label="Notes" full>
            <Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={2} placeholder="Optional" />
          </Field>
        </div>
        <p className="px-1 text-[11px] text-muted-foreground">
          A date and a start time put the task on the calendar; a start and an end give it hours on the donut.
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={() => void save()} disabled={busy || !form.title.trim()}>
            {busy && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
            {editing ? "Save changes" : "Add task"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={full ? "col-span-2 space-y-1.5" : "space-y-1.5"}>
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

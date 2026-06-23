import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { Department, StaffProfile } from "@/lib/directory/types";

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  editing: StaffProfile | null;
  departments: Department[];
  onSaved: () => void;
};

const EMPTY = {
  full_name: "", preferred_name: "", position: "", department_id: "",
  office_location: "", direct_mobile: "", office_number: "", whatsapp_number: "",
  email: "", teams_upn: "", languages: "", areas_of_expertise: "", office_hours: "",
  emergency_hours: "", is_emergency_contact: false, is_active: true,
};

function csvToArray(v: string): string[] | null {
  const arr = v.split(",").map((s) => s.trim()).filter(Boolean);
  return arr.length ? arr : null;
}

export function StaffFormDialog({ open, onOpenChange, editing, departments, onSaved }: Props) {
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(
      editing
        ? {
            full_name: editing.full_name,
            preferred_name: editing.preferred_name ?? "",
            position: editing.position,
            department_id: editing.department_id ?? "",
            office_location: editing.office_location ?? "",
            direct_mobile: editing.direct_mobile ?? "",
            office_number: editing.office_number ?? "",
            whatsapp_number: editing.whatsapp_number ?? "",
            email: editing.email,
            teams_upn: editing.teams_upn ?? "",
            languages: (editing.languages ?? []).join(", "),
            areas_of_expertise: (editing.areas_of_expertise ?? []).join(", "),
            office_hours: editing.office_hours ?? "",
            emergency_hours: editing.emergency_hours ?? "",
            is_emergency_contact: editing.is_emergency_contact,
            is_active: editing.is_active,
          }
        : EMPTY,
    );
  }, [open, editing]);

  const set = <K extends keyof typeof EMPTY>(k: K, v: (typeof EMPTY)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  async function handleSave() {
    if (!form.full_name.trim()) return toast.error("Full name is required");
    if (!form.position.trim()) return toast.error("Position is required");
    if (!form.email.trim()) return toast.error("Email is required");
    setBusy(true);
    try {
      const payload = {
        full_name: form.full_name.trim(),
        preferred_name: form.preferred_name.trim() || null,
        position: form.position.trim(),
        department_id: form.department_id || null,
        office_location: form.office_location.trim() || null,
        direct_mobile: form.direct_mobile.trim() || null,
        office_number: form.office_number.trim() || null,
        whatsapp_number: form.whatsapp_number.trim() || null,
        email: form.email.trim(),
        teams_upn: form.teams_upn.trim() || null,
        languages: csvToArray(form.languages),
        areas_of_expertise: csvToArray(form.areas_of_expertise),
        office_hours: form.office_hours.trim() || null,
        emergency_hours: form.emergency_hours.trim() || null,
        is_emergency_contact: form.is_emergency_contact,
        emergency_available: form.is_emergency_contact,
        is_active: form.is_active,
      };
      if (editing) {
        const { error } = await (supabase as any).from("staff_profiles").update(payload).eq("id", editing.id);
        if (error) throw error;
        toast.success("Profile updated");
      } else {
        const { error } = await (supabase as any).from("staff_profiles").insert([payload]);
        if (error) throw error;
        toast.success("Team member added");
      }
      onOpenChange(false);
      onSaved();
    } catch (e: any) {
      toast.error(e.message ?? "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit" : "Add"} Team Member</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Full Name <span className="text-destructive">*</span></Label>
              <Input value={form.full_name} onChange={(e) => set("full_name", e.target.value)} placeholder="e.g. Astrid Engelbrecht" />
            </div>
            <div className="space-y-1.5">
              <Label>Preferred Name</Label>
              <Input value={form.preferred_name} onChange={(e) => set("preferred_name", e.target.value)} placeholder="e.g. Astrid" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Position <span className="text-destructive">*</span></Label>
              <Input value={form.position} onChange={(e) => set("position", e.target.value)} placeholder="e.g. Visa Processing Coordinator" />
            </div>
            <div className="space-y-1.5">
              <Label>Department</Label>
              <Select value={form.department_id || "none"} onValueChange={(v) => set("department_id", v === "none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— None —</SelectItem>
                  {departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Email <span className="text-destructive">*</span></Label>
              <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="name@jlsyachts.com" />
            </div>
            <div className="space-y-1.5">
              <Label>Office Location</Label>
              <Input value={form.office_location} onChange={(e) => set("office_location", e.target.value)} placeholder="e.g. Dubai" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Direct Mobile</Label>
              <Input value={form.direct_mobile} onChange={(e) => set("direct_mobile", e.target.value)} placeholder="+971 50 000 0000" />
            </div>
            <div className="space-y-1.5">
              <Label>Office Number</Label>
              <Input value={form.office_number} onChange={(e) => set("office_number", e.target.value)} placeholder="+971 4 331 3555" />
            </div>
            <div className="space-y-1.5">
              <Label>WhatsApp</Label>
              <Input value={form.whatsapp_number} onChange={(e) => set("whatsapp_number", e.target.value)} placeholder="+971 50 000 0000" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Teams UPN</Label>
              <Input value={form.teams_upn} onChange={(e) => set("teams_upn", e.target.value)} placeholder="name@jlsyachts.com" />
            </div>
            <div className="space-y-1.5">
              <Label>Office Hours</Label>
              <Input value={form.office_hours} onChange={(e) => set("office_hours", e.target.value)} placeholder="Sun–Thu 08:00–17:00" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Languages <span className="text-muted-foreground">(comma-separated)</span></Label>
            <Input value={form.languages} onChange={(e) => set("languages", e.target.value)} placeholder="English, Afrikaans, Hindi" />
          </div>
          <div className="space-y-1.5">
            <Label>Areas of Expertise <span className="text-muted-foreground">(comma-separated)</span></Label>
            <Input value={form.areas_of_expertise} onChange={(e) => set("areas_of_expertise", e.target.value)} placeholder="Visa Processing, UAE Customs" />
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
            <div>
              <Label className="text-xs">Emergency Contact</Label>
              <p className="text-[11px] text-muted-foreground">Show in the Quick Reaction Force list</p>
            </div>
            <Switch checked={form.is_emergency_contact} onCheckedChange={(v) => set("is_emergency_contact", v)} />
          </div>
          {form.is_emergency_contact && (
            <div className="space-y-1.5">
              <Label>Emergency Hours</Label>
              <Input value={form.emergency_hours} onChange={(e) => set("emergency_hours", e.target.value)} placeholder="Available 24/7" />
            </div>
          )}
          <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
            <div>
              <Label className="text-xs">Active</Label>
              <p className="text-[11px] text-muted-foreground">Inactive profiles are hidden from the directory</p>
            </div>
            <Switch checked={form.is_active} onCheckedChange={(v) => set("is_active", v)} />
          </div>
          <div className="flex justify-end gap-2 border-t border-border pt-3">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
            <Button onClick={handleSave} disabled={busy} className="gap-1.5">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {editing ? "Save Changes" : "Add Member"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

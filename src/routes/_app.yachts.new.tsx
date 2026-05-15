import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { YACHT_COLUMNS } from "@/lib/yacht-fields";
import { ArrowLeft, Save, Upload } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/yachts/new")({
  component: NewYacht,
  head: () => ({ meta: [{ title: "Add Yacht — JLS Yachts CRM" }] }),
});

const NUMERIC_KEYS = new Set([
  "built_year", "gross_tonnage", "net_tonnage", "length_overall_m",
  "breadth_m", "draught_m", "air_draft_m", "max_crew", "max_guests",
]);
const DATE_KEYS = new Set(["eta", "etd", "cruising_permit_expiry", "departed_date"]);

const SECTIONS: { title: string; keys: string[] }[] = [
  { title: "Identity", keys: ["vessel_name", "vessel_type", "flag", "imo_no", "official_no", "port_of_registry"] },
  { title: "Build", keys: ["built_year", "builders_name", "built_place"] },
  { title: "Dimensions", keys: ["gross_tonnage", "net_tonnage", "length_overall_m", "breadth_m", "draught_m", "air_draft_m"] },
  { title: "Communications", keys: ["radio_call_sign", "frequency", "equipment_model", "manufacturer", "serial_no", "mmsi"] },
  { title: "Capacity", keys: ["max_crew", "max_guests"] },
  { title: "Owner", keys: ["owners_name", "owners_nationality", "owners_address", "company_name"] },
  { title: "Contact", keys: ["contact_person", "email_address", "contact_no", "billing_address", "link_to_folder"] },
  { title: "Operations", keys: ["status", "berth", "eta", "etd", "location", "cruising_permit_expiry", "departed_date", "dma_permit_phase_status", "planner_id", "engine"] },
];

function labelFor(key: string) {
  return YACHT_COLUMNS.find((c) => c.key === key)?.label ?? key;
}

function NewYacht() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState<Record<string, string>>({ status: "Active" });
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function set(key: string, val: string) { setForm((f) => ({ ...f, [key]: val })); }

  function pickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setImageFile(f);
    setImagePreview(URL.createObjectURL(f));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    if (!form.vessel_name) { toast.error("Vessel name is required"); return; }
    setBusy(true);
    try {
      let vessel_image: string | null = null;
      if (imageFile) {
        const path = `${user.id}/${Date.now()}-${imageFile.name.replace(/[^a-zA-Z0-9.\-_]/g, "_")}`;
        const { error: upErr } = await supabase.storage.from("vessel-images").upload(path, imageFile);
        if (upErr) throw upErr;
        vessel_image = supabase.storage.from("vessel-images").getPublicUrl(path).data.publicUrl;
      }

      const payload: Record<string, unknown> = { created_by: user.id, vessel_image };
      for (const [k, v] of Object.entries(form)) {
        if (v === "" || v === undefined) continue;
        if (NUMERIC_KEYS.has(k)) payload[k] = Number(v);
        else payload[k] = v;
      }

      const { data, error } = await supabase.from("yachts").insert([payload as never]).select("id").single();
      if (error) throw error;
      toast.success("Yacht added");
      navigate({ to: "/yachts/$id", params: { id: data.id } });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-border bg-card/40 px-6 py-3">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="sm" className="gap-1.5">
            <Link to="/yachts"><ArrowLeft className="h-3.5 w-3.5" /> Back</Link>
          </Button>
          <h1 className="font-display text-lg font-semibold">Add Yacht</h1>
        </div>
        <Button onClick={submit} disabled={busy} className="gap-1.5">
          <Save className="h-4 w-4" /> {busy ? "Saving…" : "Save Yacht"}
        </Button>
      </header>

      <form onSubmit={submit} className="flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-5xl space-y-6">
          {/* Image */}
          <section className="rounded-lg border border-border bg-card p-5">
            <h2 className="font-display text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wider">Vessel Image</h2>
            <div className="flex items-center gap-4">
              <div className="aspect-video w-64 overflow-hidden rounded-md border border-border bg-muted">
                {imagePreview ? <img src={imagePreview} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-xs text-muted-foreground">No image</div>}
              </div>
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm hover:bg-accent">
                <Upload className="h-4 w-4" /> Upload image
                <input type="file" accept="image/*" className="hidden" onChange={pickImage} />
              </label>
            </div>
          </section>

          {SECTIONS.map((s) => (
            <section key={s.title} className="rounded-lg border border-border bg-card p-5">
              <h2 className="font-display text-sm font-semibold mb-4 text-muted-foreground uppercase tracking-wider">{s.title}</h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {s.keys.map((k) => (
                  <div key={k} className="space-y-1.5">
                    <Label htmlFor={k} className="text-xs">{labelFor(k)}{k === "vessel_name" ? " *" : ""}</Label>
                    <Input
                      id={k}
                      type={DATE_KEYS.has(k) ? "date" : NUMERIC_KEYS.has(k) ? "number" : "text"}
                      step={NUMERIC_KEYS.has(k) ? "any" : undefined}
                      value={form[k] ?? ""}
                      onChange={(e) => set(k, e.target.value)}
                      required={k === "vessel_name"}
                    />
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </form>
    </div>
  );
}

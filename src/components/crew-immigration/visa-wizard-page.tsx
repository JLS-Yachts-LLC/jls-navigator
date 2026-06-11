import { useState, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/fetch-all";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ArrowRight, ArrowLeft, Check, ChevronDown, Plus, Loader2, UserCircle2,
  FileText, Upload, X, CheckCircle2, Clock,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { uploadVisaDocToSharePoint } from "@/lib/visa-sharepoint.server";

type Yacht = { id: string; vessel_name: string };

/** Read a File's bytes as a base64 string (no data: prefix). */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(r.error ?? new Error("File read failed"));
    r.readAsDataURL(file);
  });
}
type CrewLite = { id: string; first_name: string; last_name: string; rank: string | null; status: string; yacht_id: string | null };

const STEPS = ["Crew Member", "Personal Details", "Visa Details", "Documents", "Review & Submit"] as const;

const VISA_TYPES = ["Crew Visa", "Employment Visa", "Visit Visa", "Transit Visa", "Multi-Entry Visa", "Residence Visa"];
const GENDERS = ["Male", "Female"];
const MARITAL = ["Single", "Married", "Divorced", "Widowed"];
const DEPARTMENTS = ["Deck", "Engine", "Interior", "Galley", "Bridge", "Other"];
const REQUIRED_DOCS = [
  "Passport Copy", "Photo (White Background)", "Seaman's Book",
  "STCW Certificates", "Medical Certificate", "Visa Application Form",
];

type DocStatus = "pending" | "uploaded" | "approved";

const EMPTY = {
  // personal (crew_members)
  first_name: "", middle_name: "", last_name: "",
  date_of_birth: "", place_of_birth: "", nationality: "",
  mother_name: "", father_name: "", gender: "",
  marital_status: "", religion: "", native_language: "",
  department: "", rank: "", occupation: "",
  email: "", phone: "",
  // passport
  passport_number: "", passport_issue_country: "", passport_issue_authority: "",
  passport_issue_date: "", passport_expiry_date: "", passport_place_of_issue: "",
  // visa (visa_applications)
  visa_type: "Crew Visa", destination_country: "UAE", destination_city: "",
  planned_arrival: "", planned_departure: "", priority: "normal",
  assigned_to: "", application_notes: "",
  yacht_id: "",
};

export function VisaWizardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [crew, setCrew] = useState<CrewLite[]>([]);
  const [yachts, setYachts] = useState<Yacht[]>([]);
  const [selectedCrewId, setSelectedCrewId] = useState<string | null>(null);
  const [isNewCrew, setIsNewCrew] = useState(false);
  const [form, setForm] = useState({ ...EMPTY });
  const [docs, setDocs] = useState<{ name: string; status: DocStatus; url?: string }[]>(
    REQUIRED_DOCS.map((name) => ({ name, status: "pending" as DocStatus })),
  );
  const [uploadingIdx, setUploadingIdx] = useState<number | null>(null);

  async function uploadDoc(i: number, file: File) {
    setUploadingIdx(i);
    try {
      const path = `visa-docs/${Date.now()}-${file.name}`;
      const { error } = await supabase.storage.from("permit-documents").upload(path, file);
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from("permit-documents").getPublicUrl(path);
      setDocs((arr) => arr.map((x, xi) => xi === i ? { ...x, status: "uploaded", url: publicUrl } : x));

      // Also push a copy to the SharePoint Crew Visas folder (best-effort —
      // the Supabase copy is the source of truth, so a SP failure isn't fatal).
      try {
        const vesselName = yachts.find((y) => y.id === form.yacht_id)?.vessel_name ?? null;
        const crewName = `${form.first_name} ${form.last_name}`.trim() || "Unknown Crew";
        const base64 = await fileToBase64(file);
        await (uploadVisaDocToSharePoint as any)({
          data: { vesselName, crewName, fileName: file.name, contentType: file.type, base64 },
        });
        toast.success(`${file.name} attached & synced to SharePoint`);
      } catch (spErr: any) {
        toast.warning(`${file.name} attached, but SharePoint sync failed: ${spErr?.message ?? "unknown error"}`);
      }
    } catch (e: any) {
      toast.error(e.message ?? "Upload failed");
    } finally {
      setUploadingIdx(null);
    }
  }
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      const db = supabase as any;
      const [c, y] = await Promise.all([
        fetchAllRows(() => db.from("crew_members").select("id, first_name, last_name, rank, status, yacht_id").order("last_name")),
        fetchAllRows(() => supabase.from("yachts").select("id, vessel_name").order("vessel_name")),
      ]);
      setCrew(c.data ?? []);
      setYachts((y.data ?? []) as Yacht[]);
    })();
  }, []);

  function set<K extends keyof typeof form>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function selectCrew(id: string) {
    setSelectedCrewId(id);
    setIsNewCrew(false);
    const { data } = await (supabase as any).from("crew_members").select("*").eq("id", id).single();
    if (data) {
      // Auto-fill — enter once, reuse everywhere
      setForm((f) => ({
        ...f,
        first_name: data.first_name ?? "", middle_name: data.middle_name ?? "", last_name: data.last_name ?? "",
        date_of_birth: data.date_of_birth ?? "", place_of_birth: data.place_of_birth ?? "", nationality: data.nationality ?? "",
        mother_name: data.mother_name ?? "", father_name: data.father_name ?? "", gender: data.gender ?? "",
        marital_status: data.marital_status ?? "", religion: data.religion ?? "", native_language: data.native_language ?? "",
        department: data.department ?? "", rank: data.rank ?? "", occupation: data.occupation ?? "",
        email: data.email ?? "", phone: data.phone ?? "",
        passport_number: data.passport_number ?? "", passport_issue_country: data.passport_issue_country ?? "",
        passport_issue_authority: data.passport_issue_authority ?? "", passport_issue_date: data.passport_issue_date ?? "",
        passport_expiry_date: data.passport_expiry_date ?? "", passport_place_of_issue: data.passport_place_of_issue ?? "",
        yacht_id: data.yacht_id ?? "",
      }));
    }
  }

  function startNewCrew() {
    setIsNewCrew(true);
    setSelectedCrewId(null);
    setForm({ ...EMPTY });
  }

  function canContinue(): boolean {
    if (step === 0) return !!selectedCrewId || isNewCrew;
    if (step === 1) return !!form.first_name.trim() && !!form.last_name.trim();
    return true;
  }

  async function submit() {
    if (!user?.id) { toast.error("You must be signed in"); return; }
    setSaving(true);
    try {
      const db = supabase as any;
      let crewId = selectedCrewId;

      const crewPayload = {
        first_name: form.first_name.trim(), middle_name: form.middle_name || null, last_name: form.last_name.trim(),
        date_of_birth: form.date_of_birth || null, place_of_birth: form.place_of_birth || null, nationality: form.nationality || null,
        mother_name: form.mother_name || null, father_name: form.father_name || null, gender: form.gender || null,
        marital_status: form.marital_status || null, religion: form.religion || null, native_language: form.native_language || null,
        department: form.department || null, rank: form.rank || null, occupation: form.occupation || null,
        email: form.email || null, phone: form.phone || null,
        passport_number: form.passport_number || null, passport_issue_country: form.passport_issue_country || null,
        passport_issue_authority: form.passport_issue_authority || null, passport_issue_date: form.passport_issue_date || null,
        passport_expiry_date: form.passport_expiry_date || null, passport_place_of_issue: form.passport_place_of_issue || null,
        yacht_id: form.yacht_id || null, updated_at: new Date().toISOString(),
      };

      // Reuse: update existing crew record, or create a new one
      if (crewId) {
        await db.from("crew_members").update(crewPayload).eq("id", crewId);
      } else {
        const { data, error } = await db.from("crew_members").insert([{ ...crewPayload, status: "active", created_by: user.id }]).select("id").single();
        if (error) throw error;
        crewId = data.id;
      }

      const { error: vErr } = await db.from("visa_applications").insert([{
        crew_member_id: crewId,
        yacht_id: form.yacht_id || null,
        visa_type: form.visa_type,
        destination_country: form.destination_country || null,
        destination_city: form.destination_city || null,
        planned_arrival: form.planned_arrival || null,
        planned_departure: form.planned_departure || null,
        priority: form.priority,
        assigned_to: form.assigned_to || null,
        application_notes: form.application_notes || null,
        documents: docs,
        status: "submitted",
        submitted_at: new Date().toISOString(),
        created_by: user.id,
      }]);
      if (vErr) throw vErr;

      toast.success("Visa application submitted");
      navigate({ to: "/crew-immigration/visas" as any });
    } catch (e: any) {
      toast.error(e.message ?? "Failed to submit");
    } finally {
      setSaving(false);
    }
  }

  const crewName = selectedCrewId || isNewCrew
    ? `${form.first_name} ${form.last_name}`.trim() || "New crew member"
    : "—";
  const yachtName = yachts.find((y) => y.id === form.yacht_id)?.vessel_name ?? "—";
  const fmtDate = (d: string) => d ? new Date(d + "T00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <header className="border-b border-border bg-card px-6 py-3.5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[11px] text-muted-foreground">
              Crew &amp; Immigration <span className="opacity-50">/</span> Visas <span className="opacity-50">/</span> <span className="text-primary">New Visa Application</span>
            </div>
            <h1 className="mt-0.5 font-display text-[1.4rem] font-bold tracking-tight">New Visa Application</h1>
            <p className="text-sm text-muted-foreground">Create and submit a new visa application request</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="outline" onClick={() => navigate({ to: "/crew-immigration/visas" as any })}>Cancel</Button>
            {step < STEPS.length - 1 ? (
              <Button onClick={() => canContinue() ? setStep((s) => s + 1) : toast.error("Please complete the required fields")} className="gap-1.5">
                {step === STEPS.length - 2 ? "Review & Submit" : "Continue"} <ArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button onClick={submit} disabled={saving} className="gap-1.5">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Submit Application
              </Button>
            )}
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-6xl">
          {/* Step indicator */}
          <div className="mb-6 rounded-xl border border-border bg-card px-6 py-4">
            <div className="flex items-center justify-between">
              {STEPS.map((label, i) => (
                <div key={label} className="flex flex-1 items-center">
                  <button
                    onClick={() => i <= step && setStep(i)}
                    className="flex items-center gap-2.5 text-left"
                    disabled={i > step}
                  >
                    <div className={cn(
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-bold transition",
                      i < step ? "bg-primary text-primary-foreground"
                        : i === step ? "bg-primary text-primary-foreground ring-4 ring-primary/15"
                        : "bg-muted text-muted-foreground",
                    )}>
                      {i < step ? <Check className="h-3.5 w-3.5" /> : i + 1}
                    </div>
                    <span className={cn("text-[13px] font-medium whitespace-nowrap", i === step ? "text-foreground" : "text-muted-foreground")}>
                      {label}
                    </span>
                  </button>
                  {i < STEPS.length - 1 && <div className={cn("mx-3 h-px flex-1", i < step ? "bg-primary/40" : "bg-border")} />}
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* Main form */}
            <div className="lg:col-span-2 space-y-5">
              {step === 0 && (
                <Section title="1. Select Crew Member">
                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <Select value={selectedCrewId ?? ""} onValueChange={selectCrew}>
                        <SelectTrigger className="h-12">
                          <SelectValue placeholder="— Select an existing crew member —" />
                        </SelectTrigger>
                        <SelectContent>
                          {crew.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.first_name} {c.last_name}{c.rank ? ` · ${c.rank}` : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button variant="outline" onClick={startNewCrew} className="h-12 gap-1.5">
                      <Plus className="h-4 w-4" /> Add New Crew Member
                    </Button>
                  </div>
                  {isNewCrew && (
                    <p className="mt-3 rounded-lg bg-primary/5 border border-primary/15 px-3 py-2 text-xs text-primary">
                      Creating a new crew member — fill in the details on the next step. They'll be saved to the crew list and reused for future applications.
                    </p>
                  )}
                  {selectedCrewId && (
                    <p className="mt-3 rounded-lg bg-emerald-500/5 border border-emerald-500/15 px-3 py-2 text-xs text-emerald-600">
                      ✓ Profile loaded. Personal and passport details are pre-filled on the next steps — no need to re-enter.
                    </p>
                  )}
                </Section>
              )}

              {step === 1 && (
                <>
                  <Section title="Personal Details">
                    <Grid>
                      <Field label="First Name" req value={form.first_name} onChange={(v) => set("first_name", v)} />
                      <Field label="Middle Name" value={form.middle_name} onChange={(v) => set("middle_name", v)} />
                      <Field label="Last Name" req value={form.last_name} onChange={(v) => set("last_name", v)} />
                      <Field label="Date of Birth" type="date" value={form.date_of_birth} onChange={(v) => set("date_of_birth", v)} />
                      <Field label="Birth Place" value={form.place_of_birth} onChange={(v) => set("place_of_birth", v)} />
                      <Field label="Nationality" value={form.nationality} onChange={(v) => set("nationality", v)} />
                      <Field label="Mother's Name" value={form.mother_name} onChange={(v) => set("mother_name", v)} />
                      <Field label="Father's Name" value={form.father_name} onChange={(v) => set("father_name", v)} />
                      <SelectField label="Gender" value={form.gender} onChange={(v) => set("gender", v)} options={GENDERS} />
                      <SelectField label="Marital Status" value={form.marital_status} onChange={(v) => set("marital_status", v)} options={MARITAL} />
                      <Field label="Religion" value={form.religion} onChange={(v) => set("religion", v)} />
                      <Field label="Native Language" value={form.native_language} onChange={(v) => set("native_language", v)} />
                      <SelectField label="Department" value={form.department} onChange={(v) => set("department", v)} options={DEPARTMENTS} />
                      <Field label="Position / Rank" value={form.rank} onChange={(v) => set("rank", v)} />
                      <Field label="Occupation / Profession" value={form.occupation} onChange={(v) => set("occupation", v)} />
                    </Grid>
                  </Section>
                  <Section title="Passport Details">
                    <Grid>
                      <Field label="Passport Number" value={form.passport_number} onChange={(v) => set("passport_number", v)} mono />
                      <Field label="Passport Issue Country" value={form.passport_issue_country} onChange={(v) => set("passport_issue_country", v)} />
                      <Field label="Passport Issue Authority" value={form.passport_issue_authority} onChange={(v) => set("passport_issue_authority", v)} />
                      <Field label="Issue Date" type="date" value={form.passport_issue_date} onChange={(v) => set("passport_issue_date", v)} />
                      <Field label="Expiry Date" type="date" value={form.passport_expiry_date} onChange={(v) => set("passport_expiry_date", v)} />
                      <Field label="Place of Issue" value={form.passport_place_of_issue} onChange={(v) => set("passport_place_of_issue", v)} />
                    </Grid>
                  </Section>
                </>
              )}

              {step === 2 && (
                <Section title="Visa Details">
                  <Grid>
                    <SelectField label="Vessel" value={form.yacht_id} onChange={(v) => set("yacht_id", v)} options={yachts.map((y) => ({ value: y.id, label: y.vessel_name }))} />
                    <SelectField label="Visa Type" value={form.visa_type} onChange={(v) => set("visa_type", v)} options={VISA_TYPES} />
                    <SelectField label="Priority" value={form.priority} onChange={(v) => set("priority", v)} options={[
                      { value: "urgent", label: "Urgent" }, { value: "high", label: "High" },
                      { value: "normal", label: "Normal" }, { value: "low", label: "Low" },
                    ]} />
                    <Field label="Destination Country" value={form.destination_country} onChange={(v) => set("destination_country", v)} />
                    <Field label="Destination City" value={form.destination_city} onChange={(v) => set("destination_city", v)} />
                    <Field label="Assigned To (JLS Staff)" value={form.assigned_to} onChange={(v) => set("assigned_to", v)} />
                    <Field label="Planned Arrival" type="date" value={form.planned_arrival} onChange={(v) => set("planned_arrival", v)} />
                    <Field label="Planned Departure" type="date" value={form.planned_departure} onChange={(v) => set("planned_departure", v)} />
                  </Grid>
                </Section>
              )}

              {step === 3 && (
                <Section title="Required Documents">
                  <p className="mb-3 text-sm text-muted-foreground">Attach each document, or set its status manually. Files upload to secure storage.</p>
                  <div className="space-y-2">
                    {docs.map((d, i) => (
                      <div key={d.name} className="flex items-center gap-3 rounded-lg border border-border px-4 py-2.5">
                        <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="flex-1 text-sm font-medium">{d.name}</span>
                        {/* Upload */}
                        <label className="flex cursor-pointer items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent transition">
                          {uploadingIdx === i ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                          {d.url ? "Replace" : "Upload"}
                          <input type="file" className="hidden" disabled={uploadingIdx !== null}
                            onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadDoc(i, f); }} />
                        </label>
                        {d.url && <a href={d.url} target="_blank" rel="noopener noreferrer" className="text-[11px] text-primary hover:underline">view</a>}
                        <div className="flex items-center gap-1">
                          {(["pending", "uploaded", "approved"] as DocStatus[]).map((s) => (
                            <button
                              key={s}
                              onClick={() => setDocs((arr) => arr.map((x, xi) => xi === i ? { ...x, status: s } : x))}
                              className={cn(
                                "rounded-md px-2.5 py-1 text-[11px] font-semibold capitalize transition",
                                d.status === s
                                  ? s === "approved" ? "bg-emerald-500/15 text-emerald-600"
                                    : s === "uploaded" ? "bg-blue-500/15 text-blue-600"
                                    : "bg-amber-500/15 text-amber-600"
                                  : "text-muted-foreground hover:bg-accent",
                              )}
                            >
                              {s}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              {step === 4 && (
                <Section title="Review & Submit">
                  <p className="mb-4 text-sm text-muted-foreground">Please review the application below. Submitting will save the crew profile and create the visa application.</p>
                  <ReviewBlock title="Crew Member" rows={[
                    ["Name", `${form.first_name} ${form.middle_name} ${form.last_name}`.replace(/\s+/g, " ").trim()],
                    ["Nationality", form.nationality || "—"],
                    ["Rank", form.rank || "—"],
                    ["Passport", form.passport_number || "—"],
                    ["Passport Expiry", fmtDate(form.passport_expiry_date)],
                  ]} />
                  <ReviewBlock title="Visa" rows={[
                    ["Vessel", yachtName],
                    ["Visa Type", form.visa_type],
                    ["Destination", [form.destination_country, form.destination_city].filter(Boolean).join(", ") || "—"],
                    ["Planned Arrival", fmtDate(form.planned_arrival)],
                    ["Priority", form.priority.charAt(0).toUpperCase() + form.priority.slice(1)],
                  ]} />
                  <ReviewBlock title="Documents" rows={docs.map((d) => [d.name, d.status.charAt(0).toUpperCase() + d.status.slice(1)])} />
                </Section>
              )}
            </div>

            {/* Right summary panel */}
            <div className="space-y-4">
              <div className="rounded-xl border border-border bg-card p-4">
                <h3 className="font-display text-sm font-semibold mb-3">Application Summary</h3>
                <div className="space-y-2 text-xs">
                  {[
                    ["Vessel", yachtName],
                    ["Crew Member", crewName],
                    ["Visa Type", form.visa_type],
                    ["Destination", form.destination_country || "—"],
                    ["Planned Arrival", fmtDate(form.planned_arrival)],
                    ["Priority", form.priority.charAt(0).toUpperCase() + form.priority.slice(1)],
                  ].map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-2">
                      <span className="text-muted-foreground/70">{k}</span>
                      <span className="font-medium text-right">{v}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-display text-sm font-semibold">Visa Status</h3>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">Draft</span>
                </div>
                <div className="flex items-center justify-between">
                  {["Draft", "Submitted", "In Review", "Processing", "Completed"].map((s, i) => (
                    <div key={s} className="flex flex-col items-center gap-1 flex-1">
                      <div className={cn("h-2.5 w-2.5 rounded-full", i === 0 ? "bg-primary" : "bg-border")} />
                      <span className="text-[8.5px] text-muted-foreground text-center leading-tight">{s}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-border bg-card p-4">
                <h3 className="font-display text-sm font-semibold mb-3">Required Documents</h3>
                <div className="space-y-1.5">
                  {docs.map((d) => (
                    <div key={d.name} className="flex items-center gap-2 text-xs">
                      {d.status === "pending"
                        ? <Clock className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                        : <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />}
                      <span className="flex-1 text-foreground/80">{d.name}</span>
                      <span className={cn("text-[10px] font-semibold capitalize", d.status === "pending" ? "text-amber-500" : d.status === "uploaded" ? "text-blue-500" : "text-emerald-500")}>{d.status}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-border bg-card p-4">
                <h3 className="font-display text-sm font-semibold mb-2">Notes</h3>
                <Textarea
                  value={form.application_notes}
                  onChange={(e) => set("application_notes", e.target.value)}
                  rows={3}
                  placeholder="Add any notes or additional information…"
                  className="text-sm resize-none"
                />
              </div>
            </div>
          </div>

          {/* Bottom nav */}
          <div className="mt-6 flex items-center justify-between">
            <Button variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0} className="gap-1.5">
              <ArrowLeft className="h-4 w-4" /> Back
            </Button>
            {step < STEPS.length - 1 ? (
              <Button onClick={() => canContinue() ? setStep((s) => s + 1) : toast.error("Please complete the required fields")} className="gap-1.5">
                Continue <ArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button onClick={submit} disabled={saving} className="gap-1.5">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Submit Application
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <h2 className="font-display text-[15px] font-semibold mb-4">{title}</h2>
      {children}
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</div>;
}

function Field({ label, value, onChange, type = "text", req, mono }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; req?: boolean; mono?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}{req && <span className="text-destructive"> *</span>}</Label>
      <Input type={type} value={value} onChange={(e) => onChange(e.target.value)} className={cn("h-9", mono && "font-mono")} />
    </div>
  );
}

function SelectField({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void;
  options: (string | { value: string; label: string })[];
}) {
  const opts = options.map((o) => typeof o === "string" ? { value: o, label: o } : o);
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Select value={value || "__none"} onValueChange={(v) => onChange(v === "__none" ? "" : v)}>
        <SelectTrigger className="h-9"><SelectValue placeholder="— Select —" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="__none">— Select —</SelectItem>
          {opts.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

function ReviewBlock({ title, rows }: { title: string; rows: (string[])[] }) {
  return (
    <div className="mb-4 overflow-hidden rounded-lg border border-border">
      <div className="bg-muted/40 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</div>
      <div className="divide-y divide-border/50">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3 px-4 py-2 text-sm">
            <span className="text-muted-foreground">{k}</span>
            <span className="font-medium text-right">{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Forms module — digital forms alongside their PDF originals.
 *
 * A form is a definition (sections → fields) plus, optionally, the signed PDF the
 * yacht or an authority still expects to see. From here staff can
 *   • fill a form in Polaris,
 *   • download or attach the PDF original,
 *   • create a share link so an incoming yacht can complete it with no login,
 *   • see every copy sent out and what came back.
 */
import { storageRef } from "@/lib/signed-url";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  FileText, Download, Link2, Loader2, Send, Upload, ArrowLeft, Save, Copy, CheckCircle2, Ship,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { SignedAnchor } from "@/components/ui/signed-file";
import { FormRenderer, type FormData } from "@/components/forms/FormRenderer";
import type { FormSection } from "@/lib/forms/pre-arrival-definition";

type FormRow = {
  id: string; slug: string; title: string; description: string | null;
  category: string | null; definition: FormSection[];
  pdf_url: string | null; pdf_file_name: string | null; version: number;
};
type SubmissionRow = {
  id: string; form_id: string; vessel_name: string | null; sent_to_name: string | null;
  sent_to_email: string | null; status: string; data: FormData;
  share_token: string | null; sent_at: string | null; submitted_at: string | null;
  created_at: string;
};

const STATUS_STYLE: Record<string, string> = {
  draft: "bg-slate-500/15 text-slate-400",
  sent: "bg-sky-500/15 text-sky-400",
  in_progress: "bg-amber-500/15 text-amber-400",
  submitted: "bg-emerald-500/15 text-emerald-400",
  accepted: "bg-emerald-500/15 text-emerald-400",
};

const fmt = (d: string | null) =>
  d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";

/** Unguessable enough for a link that is emailed to one recipient. */
function makeToken(): string {
  const a = new Uint8Array(24);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function FormsHub() {
  const { user } = useAuth();
  const [forms, setForms] = useState<FormRow[]>([]);
  const [subs, setSubs] = useState<SubmissionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [open, setOpen] = useState<{ form: FormRow; sub: SubmissionRow | null } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const db = supabase as any;
    const [{ data: f }, { data: s }] = await Promise.all([
      db.from("forms").select("*").eq("active", true).order("title"),
      db.from("form_submissions").select("*").order("created_at", { ascending: false }).limit(200),
    ]);
    setForms((f ?? []) as FormRow[]);
    setSubs((s ?? []) as SubmissionRow[]);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  // First visit: pull the built-in definitions in automatically rather than making
  // someone find a button before the module does anything. Runs once, and quietly —
  // if it fails (e.g. not an admin) the empty state still explains the manual step.
  const autoSeeded = useRef(false);
  useEffect(() => {
    if (loading || seeding || autoSeeded.current || forms.length > 0) return;
    autoSeeded.current = true;
    void (async () => {
      try {
        const res = await fetch("/api/forms/seed", { method: "POST" });
        if (res.ok) await load();
      } catch { /* the empty state covers this */ }
    })();
  }, [loading, seeding, forms.length, load]);

  /** Pull the built-in definitions in from code (first run, or after an update). */
  async function seed() {
    setSeeding(true);
    try {
      const res = await fetch("/api/forms/seed", { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? "Seed failed");
      toast.success(`Built-in forms loaded — ${body.sections} sections, ${body.fields} fields`);
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not load the built-in forms");
    } finally {
      setSeeding(false);
    }
  }

  async function attachPdf(form: FormRow, file: File) {
    try {
      const path = `forms/${form.slug}/${Date.now()}-${file.name}`;
      const { error } = await supabase.storage.from("permit-documents").upload(path, file, { upsert: true });
      if (error) throw error;
      const stored = storageRef("permit-documents", path);
      const { error: upErr } = await (supabase as any).from("forms")
        .update({ pdf_url: stored, pdf_file_name: file.name, updated_at: new Date().toISOString() })
        .eq("id", form.id);
      if (upErr) throw upErr;
      toast.success(`PDF attached to “${form.title}”`);
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Upload failed");
    }
  }

  /** New blank copy, with a share link ready to send to a vessel. */
  async function createSubmission(form: FormRow, vesselName: string) {
    const token = makeToken();
    const { data, error } = await (supabase as any).from("form_submissions").insert([{
      form_id: form.id,
      vessel_name: vesselName || null,
      status: "draft",
      share_token: token,
      created_by: user?.id ?? null,
    }]).select("*").single();
    if (error) { toast.error(error.message); return null; }
    await load();
    return data as SubmissionRow;
  }

  const subsFor = (formId: string) => subs.filter((s) => s.form_id === formId);

  if (open) {
    return (
      <FormFill
        form={open.form}
        submission={open.sub}
        onBack={() => { setOpen(null); void load(); }}
      />
    );
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-border/70 bg-card/30 px-6 py-3.5">
        <div>
          <div className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground/60">Polaris / Forms</div>
          <h1 className="mt-0.5 font-display text-[1.25rem] font-semibold tracking-tight">Forms Library</h1>
        </div>
        <Button size="sm" variant="outline" onClick={() => void seed()} disabled={seeding} className="gap-1.5">
          {seeding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          Load built-in forms
        </Button>
      </header>

      <div className="flex-1 overflow-auto px-6 py-5">
        {loading ? (
          <div className="flex h-40 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : forms.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-10 text-center">
            <FileText className="mx-auto h-8 w-8 text-muted-foreground/40" />
            <p className="mt-3 font-display text-base font-semibold">No forms yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Press “Load built-in forms” to bring in the Pre-Arrival / Cruising Permit Information form.
            </p>
          </div>
        ) : (
          <div className="mx-auto max-w-5xl space-y-4">
            {forms.map((form) => (
              <FormCard
                key={form.id}
                form={form}
                submissions={subsFor(form.id)}
                onFill={(sub) => setOpen({ form, sub })}
                onAttachPdf={(file) => void attachPdf(form, file)}
                onCreate={async (vessel) => {
                  const sub = await createSubmission(form, vessel);
                  if (sub) setOpen({ form, sub });
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function FormCard({
  form, submissions, onFill, onAttachPdf, onCreate,
}: {
  form: FormRow;
  submissions: SubmissionRow[];
  onFill: (sub: SubmissionRow | null) => void;
  onAttachPdf: (file: File) => void;
  onCreate: (vesselName: string) => void;
}) {
  const [vessel, setVessel] = useState("");
  const fieldCount = useMemo(
    () => (form.definition ?? []).reduce((n, s) => n + (s.fields?.length ?? 0), 0),
    [form.definition],
  );

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display text-[15px] font-semibold">{form.title}</h3>
          {form.description && <p className="mt-1 max-w-2xl text-[12.5px] text-muted-foreground">{form.description}</p>}
          <p className="mt-2 text-[11px] text-muted-foreground/70">
            {(form.definition ?? []).length} sections · {fieldCount} fields · v{form.version}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          {form.pdf_url ? (
            <SignedAnchor stored={form.pdf_url}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/30 px-2.5 py-1.5 text-[11.5px] font-medium text-muted-foreground transition hover:text-foreground">
              <Download className="h-3.5 w-3.5" /> PDF
            </SignedAnchor>
          ) : (
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-dashed border-border px-2.5 py-1.5 text-[11.5px] font-medium text-muted-foreground transition hover:text-foreground">
              <Upload className="h-3.5 w-3.5" /> Attach PDF
              <input type="file" accept="application/pdf" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) onAttachPdf(f); }} />
            </label>
          )}
        </div>
      </div>

      {/* Send to a vessel */}
      <div className="mt-4 flex flex-wrap items-end gap-2 rounded-lg border border-border/60 bg-muted/20 p-3">
        <div className="min-w-[200px] flex-1">
          <label className="text-[11px] uppercase tracking-wide text-muted-foreground">Vessel / recipient</label>
          <Input value={vessel} onChange={(e) => setVessel(e.target.value)} placeholder="e.g. MY Aurora X"
            className="mt-1 h-8 text-[13px]" />
        </div>
        <Button size="sm" className="h-8 gap-1.5" onClick={() => onCreate(vessel)}>
          <Send className="h-3.5 w-3.5" /> Start a copy for this vessel
        </Button>
        <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => onFill(null)}>
          <FileText className="h-3.5 w-3.5" /> Preview blank form
        </Button>
      </div>

      {/* Copies sent / returned */}
      {submissions.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Copies ({submissions.length})
          </p>
          <div className="divide-y divide-border/50">
            {submissions.map((s) => (
              <div key={s.id} className="flex flex-wrap items-center gap-3 py-2.5">
                <Ship className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
                <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
                  {s.vessel_name || s.sent_to_name || "Unnamed vessel"}
                </span>
                <span className={cn("rounded px-1.5 py-0.5 text-[9.5px] font-semibold uppercase", STATUS_STYLE[s.status] ?? "bg-muted text-muted-foreground")}>
                  {s.status.replace(/_/g, " ")}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {s.submitted_at ? `Returned ${fmt(s.submitted_at)}` : s.sent_at ? `Sent ${fmt(s.sent_at)}` : `Created ${fmt(s.created_at)}`}
                </span>
                {s.share_token && <ShareLinkButton token={s.share_token} />}
                <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => onFill(s)}>
                  Open
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function ShareLinkButton({ token }: { token: string }) {
  const [copied, setCopied] = useState(false);
  const url = `${typeof window !== "undefined" ? window.location.origin : ""}/forms/fill/${token}`;
  return (
    <Button
      size="sm" variant="outline" className="h-7 gap-1 text-[11px]"
      title="Copy the link to send to the vessel — it opens the form with no login needed"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          toast.success("Share link copied");
          setTimeout(() => setCopied(false), 2000);
        } catch { toast.error("Could not copy — the link is " + url); }
      }}
    >
      {copied ? <CheckCircle2 className="h-3 w-3 text-emerald-400" /> : <Link2 className="h-3 w-3" />}
      {copied ? "Copied" : "Share link"}
    </Button>
  );
}

/** Fill / review one copy of a form. */
function FormFill({
  form, submission, onBack,
}: {
  form: FormRow;
  submission: SubmissionRow | null;
  onBack: () => void;
}) {
  const [data, setData] = useState<FormData>(submission?.data ?? {});
  const [saving, setSaving] = useState(false);
  const readOnly = !submission; // blank preview

  async function save(markSubmitted = false) {
    if (!submission) return;
    setSaving(true);
    try {
      const patch: Record<string, any> = { data, updated_at: new Date().toISOString() };
      if (markSubmitted) { patch.status = "submitted"; patch.submitted_at = new Date().toISOString(); }
      else if (submission.status === "draft") patch.status = "in_progress";
      const { error } = await (supabase as any).from("form_submissions").update(patch).eq("id", submission.id);
      if (error) throw error;
      toast.success(markSubmitted ? "Form marked as complete" : "Saved");
      if (markSubmitted) onBack();
    } catch (e: any) {
      toast.error(e?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 bg-card/30 px-6 py-3.5">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground/60">
              Polaris / Forms{submission?.vessel_name ? ` / ${submission.vessel_name}` : ""}
            </div>
            <h1 className="mt-0.5 font-display text-[1.15rem] font-semibold tracking-tight">{form.title}</h1>
          </div>
        </div>
        {!readOnly && (
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => void save(false)} disabled={saving}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save
            </Button>
            <Button size="sm" className="gap-1.5" onClick={() => void save(true)} disabled={saving}>
              <CheckCircle2 className="h-3.5 w-3.5" /> Mark complete
            </Button>
          </div>
        )}
      </header>

      <div className="flex-1 overflow-auto px-6 py-5">
        <div className="mx-auto max-w-4xl">
          {readOnly && (
            <p className="mb-4 rounded-lg border border-border/60 bg-muted/20 px-4 py-2.5 text-[12.5px] text-muted-foreground">
              Blank preview — start a copy for a vessel to fill it in.
            </p>
          )}
          <FormRenderer sections={form.definition ?? []} data={data} onChange={setData} readOnly={readOnly} />
        </div>
      </div>
    </div>
  );
}

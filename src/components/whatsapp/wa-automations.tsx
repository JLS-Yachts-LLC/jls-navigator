/**
 * Automations — scheduled expiry reminders (crew visas, passports, vessel permits).
 *
 * Everything is off by default and stays off until a person turns it on, at three
 * levels: the Worker's master switch, each reminder, and each yacht per reminder.
 * The preview shows exactly what would go out today before anything is enabled.
 */
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Loader2, CalendarClock, Eye, Send, Save, Sparkles, ChevronDown, ChevronRight, Search, Power, AlertTriangle, CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import {
  AUTOMATION_FIELDS, PERMIT_LABEL, placeholderCount, placeholderContext, fillTemplate,
  type AutomationKind, type VariableSource,
} from "@/lib/whatsapp/shared";
import { db, waApi, Chip, fmtDate, Empty, type WaTemplate } from "./wa-common";
import { WaAutoReplies } from "./wa-auto-replies";

interface Automation {
  id: string;
  kind: AutomationKind;
  name: string;
  description: string | null;
  template_id: string | null;
  variable_map: VariableSource[];
  days_before: number[];
  enabled: boolean;
  options: { permit_types?: string[]; button_values?: string[] };
  last_run_at: string | null;
  last_run_summary: Record<string, any> | null;
}

export function WaAutomations({ canEdit }: { canEdit: boolean }) {
  const [rows, setRows] = useState<Automation[] | null>(null);
  const [templates, setTemplates] = useState<WaTemplate[]>([]);
  const [switches, setSwitches] = useState<{ master: boolean; sending: boolean } | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  async function load() {
    const [{ data: a }, { data: t }] = await Promise.all([
      db().from("wa_automations").select("*").order("name"),
      db().from("wa_templates").select("*").eq("category", "UTILITY").order("name"),
    ]);
    setRows((a ?? []) as Automation[]);
    setTemplates((t ?? []) as WaTemplate[]);
  }
  useEffect(() => {
    void load();
    void waApi<{ presence: Record<string, boolean> }>("status")
      .then((s) => setSwitches({ master: !!s.presence.automations_enabled, sending: !!s.presence.sending_enabled }))
      .catch(() => setSwitches(null));
  }, []);

  if (!rows) return <div className="grid place-items-center py-16"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Auto-replies</h3>
      <WaAutoReplies canEdit={canEdit} />

      <h3 className="pt-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Expiry reminders</h3>
      <div className={cn("rounded-xl border p-4 text-sm",
        switches?.master ? "border-emerald-500/40 bg-emerald-500/5" : "border-amber-500/40 bg-amber-500/5")}>
        <div className="flex items-start gap-2">
          <Power className={cn("mt-0.5 h-4 w-4 shrink-0", switches?.master ? "text-emerald-500" : "text-amber-500")} />
          <div>
            <p className="font-medium">
              Expiry reminders are {switches?.master ? "allowed" : "switched off"} for the whole platform
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {switches?.master
                ? "Reminders still only go out for reminders switched on below, to yachts switched on for them."
                : <>No expiry reminder sends while <code>WHATSAPP_AUTOMATIONS_ENABLED</code> is off (auto-replies above have their own switches). You can set everything up, preview it and send yourself a test first.</>}
              {switches && !switches.sending && " WhatsApp sending (WHATSAPP_SENDING_ENABLED) is also off."}
              {" "}Reminders run once a day at 10:00 Dubai time.
            </p>
          </div>
        </div>
      </div>

      {rows.map((a) => (
        <AutomationCard key={a.id} a={a} templates={templates} canEdit={canEdit}
          open={open === a.id} onToggleOpen={() => setOpen(open === a.id ? null : a.id)} onChanged={load} />
      ))}
    </div>
  );
}

function AutomationCard({ a, templates, canEdit, open, onToggleOpen, onChanged }: {
  a: Automation; templates: WaTemplate[]; canEdit: boolean; open: boolean; onToggleOpen: () => void; onChanged: () => void;
}) {
  const [templateId, setTemplateId] = useState(a.template_id ?? "");
  const [map, setMap] = useState<VariableSource[]>(a.variable_map ?? []);
  const [days, setDays] = useState((a.days_before ?? []).join(", "));
  const [permitTypes, setPermitTypes] = useState<string[]>(a.options?.permit_types ?? []);
  const [saving, setSaving] = useState(false);
  const [confirmOn, setConfirmOn] = useState(false);
  const [preview, setPreview] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    setTemplateId(a.template_id ?? ""); setMap(a.variable_map ?? []);
    setDays((a.days_before ?? []).join(", ")); setPermitTypes(a.options?.permit_types ?? []);
  }, [a]);

  const t = templates.find((x) => x.id === templateId) ?? null;
  const needed = t ? placeholderCount(t.body_text) : 0;
  const fields = AUTOMATION_FIELDS[a.kind];
  const dirty = templateId !== (a.template_id ?? "") || JSON.stringify(map) !== JSON.stringify(a.variable_map ?? [])
    || days !== (a.days_before ?? []).join(", ") || JSON.stringify(permitTypes) !== JSON.stringify(a.options?.permit_types ?? []);

  const problem = !t ? "Choose a template"
    : t.status !== "approved" ? `The template is ${t.status} — it needs Meta's approval first`
    : Array.from({ length: needed }, (_, i) => map[i]).some((s) => !s || ("field" in s ? !s.field : !s.text?.trim())) ? "Fill in every {{n}}"
    : null;

  function parseDays(): number[] | null {
    const n = days.split(/[\s,]+/).filter(Boolean).map(Number);
    if (!n.length || n.length > 6 || n.some((d) => !Number.isInteger(d) || d < 0 || d > 365)) return null;
    return [...new Set(n)].sort((x, y) => y - x);
  }

  async function save() {
    const d = parseDays();
    if (!d) { toast.error("Days before: up to 6 whole numbers between 0 and 365, e.g. 30, 14, 7"); return; }
    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await db().from("wa_automations").update({
      template_id: templateId || null, variable_map: map.slice(0, needed || map.length), days_before: d,
      options: { ...a.options, permit_types: permitTypes }, updated_by: u.user?.id ?? null,
    }).eq("id", a.id);
    setSaving(false);
    if (error) toast.error(error.message); else { toast.success("Saved"); onChanged(); }
  }

  async function setEnabled(on: boolean) {
    const { data: u } = await supabase.auth.getUser();
    const { error } = await db().from("wa_automations").update({ enabled: on, updated_by: u.user?.id ?? null }).eq("id", a.id);
    if (error) toast.error(error.message);
    else { toast.success(on ? `${a.name} reminders switched on` : `${a.name} reminders switched off`); onChanged(); }
  }

  async function starter() {
    try {
      const r = await waApi<{ name: string }>("automations/starter", { id: a.id });
      toast.success(`Draft template ${r.name} created`, { description: "Review it on the Templates tab, then Submit to Meta. It's linked here already." });
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't create it");
    }
  }

  const summary = a.last_run_summary;

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center gap-3 p-4">
        <button onClick={onToggleOpen} className="flex min-w-0 flex-1 items-start gap-2 text-left">
          {open ? <ChevronDown className="mt-0.5 h-4 w-4 shrink-0" /> : <ChevronRight className="mt-0.5 h-4 w-4 shrink-0" />}
          <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0">
            <span className="block font-medium">{a.name}</span>
            <span className="block text-xs text-muted-foreground">{a.description}</span>
            <span className="mt-1 flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
              <span>{(a.days_before ?? []).join(" / ")} days before</span>
              {a.template_id ? <span>· {templates.find((x) => x.id === a.template_id)?.name ?? "template"}</span> : <span>· no template yet</span>}
              {a.last_run_at && <span>· last run {fmtDate(a.last_run_at)}{summary ? `: ${summary.sent ?? 0} sent${summary.failed ? `, ${summary.failed} failed` : ""}${summary.problem ? ` — ${summary.problem}` : ""}` : ""}</span>}
            </span>
          </span>
        </button>
        <div className="flex items-center gap-2">
          <Chip t={a.enabled ? "green" : "grey"}>{a.enabled ? "On" : "Off"}</Chip>
          {canEdit && (
            <Switch checked={a.enabled} onCheckedChange={(v) => { if (v) setConfirmOn(true); else void setEnabled(false); }}
              aria-label={`Automatic ${a.name} reminders`} />
          )}
        </div>
      </div>

      {open && (
        <div className="space-y-5 border-t border-border p-4">
          {/* Template + mapping */}
          <div className="grid gap-5 lg:grid-cols-2">
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Template (Updates only)</Label>
                <div className="flex gap-2">
                  <select value={templateId} disabled={!canEdit} onChange={(e) => { setTemplateId(e.target.value); setMap([]); }}
                    className="h-8 flex-1 rounded-md border border-border bg-background px-2 text-sm">
                    <option value="">Choose a template…</option>
                    {templates.map((x) => <option key={x.id} value={x.id}>{x.name} — {x.status}</option>)}
                  </select>
                  {canEdit && (
                    <Button size="sm" variant="outline" className="h-8 gap-1 text-xs" onClick={() => void starter()} title="Create suggested wording as a draft">
                      <Sparkles className="h-3.5 w-3.5" /> Starter template
                    </Button>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Reminders are business updates, so they use an Updates (utility) template — and go only to contacts who agreed to updates.
                </p>
              </div>

              {t && needed > 0 && (
                <div className="space-y-2">
                  <Label>What goes in each blank</Label>
                  {Array.from({ length: needed }, (_, i) => {
                    const src = map[i];
                    const isText = !!src && "text" in src;
                    return (
                      <div key={i} className="space-y-0.5">
                        <p className="truncate text-[11px] text-muted-foreground">{placeholderContext(t.body_text, i + 1)}</p>
                        <div className="flex gap-2">
                          <select disabled={!canEdit} value={isText ? "__text" : src && "field" in src ? src.field : ""}
                            onChange={(e) => setMap((m) => { const n = [...m]; n[i] = e.target.value === "__text" ? { text: "" } : { field: e.target.value }; return n; })}
                            className="h-8 w-48 rounded-md border border-border bg-background px-2 text-xs">
                            <option value="">Choose…</option>
                            {fields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                            <option value="__text">Fixed text…</option>
                          </select>
                          {isText && (
                            <Input value={(src as { text: string }).text} disabled={!canEdit} className="h-8 flex-1"
                              placeholder="e.g. JLS Port Operations"
                              onChange={(e) => setMap((m) => { const n = [...m]; n[i] = { text: e.target.value }; return n; })} />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="space-y-3">
              {t && (
                <div>
                  <Label>Example</Label>
                  <div className="mt-1.5 max-w-sm rounded-xl rounded-tl-sm border border-border bg-background px-3 py-2 text-sm">
                    <p className="whitespace-pre-wrap">
                      {fillTemplate(t.body_text, Array.from({ length: needed }, (_, i) => {
                        const s = map[i];
                        if (!s) return `{{${i + 1}}}`;
                        return "field" in s ? fields.find((f) => f.key === s.field)?.sample ?? `{{${i + 1}}}` : s.text || `{{${i + 1}}}`;
                      }))}
                    </p>
                    {t.footer_text && <p className="mt-1 text-xs text-muted-foreground">{t.footer_text}</p>}
                  </div>
                </div>
              )}
              <div className="space-y-1.5">
                <Label>Days before expiry</Label>
                <Input value={days} disabled={!canEdit} onChange={(e) => setDays(e.target.value)} className="h-8 w-48" placeholder="30, 14, 7" />
                <p className="text-[11px] text-muted-foreground">One reminder at each stage. A document found at 10 days left gets the 14-day reminder once, then the 7-day one.</p>
              </div>
              {a.kind === "vessel_permit" && (
                <div className="space-y-1.5">
                  <Label>Permit types</Label>
                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                    {Object.entries(PERMIT_LABEL).map(([k, label]) => (
                      <label key={k} className="flex items-center gap-1.5 text-xs">
                        <Checkbox disabled={!canEdit} checked={permitTypes.includes(k)}
                          onCheckedChange={(v) => setPermitTypes((p) => (v ? [...p, k] : p.filter((x) => x !== k)))} />
                        {label}
                      </label>
                    ))}
                  </div>
                  <p className="text-[11px] text-muted-foreground">{permitTypes.length ? `Only these ${permitTypes.length}.` : "None ticked = all permit types."}</p>
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {canEdit && (
              <Button size="sm" onClick={() => void save()} disabled={saving || !dirty} className="gap-1.5">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save settings
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => setPreview(true)} className="gap-1.5" disabled={dirty}>
              <Eye className="h-4 w-4" /> Preview today's reminders
            </Button>
            {canEdit && (
              <Button size="sm" variant="outline" onClick={() => setTesting(true)} className="gap-1.5" disabled={dirty || !!problem}>
                <Send className="h-4 w-4" /> Send a test
              </Button>
            )}
            {dirty && <span className="text-[11px] text-amber-600">Save first to preview or test.</span>}
            {!dirty && problem && <span className="flex items-center gap-1 text-[11px] text-amber-600"><AlertTriangle className="h-3.5 w-3.5" />{problem}</span>}
          </div>

          <VesselSwitches a={a} canEdit={canEdit} />
          <RecentLog a={a} />
        </div>
      )}

      {confirmOn && (
        <Dialog open onOpenChange={(o) => { if (!o) setConfirmOn(false); }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Switch on automatic {a.name.toLowerCase()} reminders?</DialogTitle>
              <DialogDescription>
                Every day at 10:00 Dubai time, Polaris will WhatsApp the opted-in contacts of each yacht you've switched on below,
                {" "}{(a.days_before ?? []).join(", ")} days before an expiry. Yachts not switched on get nothing.
                {problem ? ` It won't send yet: ${problem.toLowerCase()}.` : ""}
                {" "}Check “Preview today's reminders” first.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setConfirmOn(false)}>Cancel</Button>
              <Button onClick={() => { setConfirmOn(false); void setEnabled(true); }}>Switch on</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      {preview && <PreviewDialog a={a} onClose={() => setPreview(false)} />}
      {testing && <TestDialog a={a} onClose={() => setTesting(false)} />}
    </div>
  );
}

// ─── Which yachts get this reminder ───────────────────────────────────────────

function VesselSwitches({ a, canEdit }: { a: Automation; canEdit: boolean }) {
  const [yachts, setYachts] = useState<Array<{ id: string; vessel_name: string | null }> | null>(null);
  const [on, setOn] = useState<Set<string>>(new Set());
  const [reach, setReach] = useState<Map<string, number>>(new Map());
  const [q, setQ] = useState("");
  const [onlyReachable, setOnlyReachable] = useState(false);

  async function load() {
    const [{ data: ys }, { data: opt }, { data: cs }] = await Promise.all([
      db().from("yachts").select("id, vessel_name, archive").order("vessel_name"),
      db().from("wa_automation_vessels").select("yacht_id, enabled").eq("automation_id", a.id),
      db().from("wa_contacts").select("yacht_id").eq("consent_status", "opted_in").eq("consent_updates", true)
        .not("phone_e164", "is", null).not("yacht_id", "is", null),
    ]);
    setYachts(((ys ?? []) as any[]).filter((y) => !y.archive));
    setOn(new Set(((opt ?? []) as any[]).filter((o) => o.enabled).map((o) => o.yacht_id)));
    const r = new Map<string, number>();
    for (const c of (cs ?? []) as any[]) r.set(c.yacht_id, (r.get(c.yacht_id) ?? 0) + 1);
    setReach(r);
  }
  useEffect(() => { void load(); }, [a.id]);

  async function set(ids: string[], enabled: boolean) {
    if (!ids.length) return;
    const { data: u } = await supabase.auth.getUser();
    const { error } = await db().from("wa_automation_vessels").upsert(
      ids.map((yacht_id) => ({ automation_id: a.id, yacht_id, enabled, updated_by: u.user?.id ?? null })),
      { onConflict: "automation_id,yacht_id" });
    if (error) { toast.error(error.message); return; }
    setOn((s) => { const n = new Set(s); ids.forEach((id) => (enabled ? n.add(id) : n.delete(id))); return n; });
  }

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (yachts ?? []).filter((y) => (!s || (y.vessel_name ?? "").toLowerCase().includes(s)) && (!onlyReachable || reach.get(y.id)));
  }, [yachts, q, onlyReachable, reach]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="flex-1 text-sm font-semibold">
          Yachts <span className="text-xs font-normal text-muted-foreground">— {on.size} switched on</span>
        </h4>
        <div className="relative w-52">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search yachts" className="h-7 pl-7 text-xs" />
        </div>
        <label className="flex items-center gap-1.5 text-xs">
          <Checkbox checked={onlyReachable} onCheckedChange={(v) => setOnlyReachable(!!v)} /> With opted-in contacts
        </label>
        {canEdit && (
          <>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => void set(shown.map((y) => y.id), true)}>Switch on shown</Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => void set(shown.map((y) => y.id), false)}>Switch off shown</Button>
          </>
        )}
      </div>
      {yachts === null ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : (
        <div className="grid max-h-72 gap-1 overflow-y-auto rounded-lg border border-border p-2 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((y) => (
            <label key={y.id} className="flex items-center justify-between gap-2 rounded-md px-2 py-1 hover:bg-muted/50">
              <span className="min-w-0">
                <span className="block truncate text-sm">{y.vessel_name}</span>
                <span className="block text-[10px] text-muted-foreground">
                  {reach.get(y.id) ? `${reach.get(y.id)} contact${reach.get(y.id) === 1 ? "" : "s"} opted in to updates` : "no opted-in contacts"}
                </span>
              </span>
              <Switch checked={on.has(y.id)} disabled={!canEdit} onCheckedChange={(v) => void set([y.id], v)} />
            </label>
          ))}
          {shown.length === 0 && <p className="p-3 text-xs text-muted-foreground">No yachts match.</p>}
        </div>
      )}
      <p className="text-[11px] text-muted-foreground">
        A yacht switched on still only gets reminders sent to its contacts who opted in to updates — link contacts to a yacht on the Contacts tab.
      </p>
    </div>
  );
}

// ─── What went out ────────────────────────────────────────────────────────────

function RecentLog({ a }: { a: Automation }) {
  const [rows, setRows] = useState<any[] | null>(null);
  useEffect(() => {
    void db().from("wa_automation_log").select("*, contact:wa_contacts(name), yacht:yachts(vessel_name)")
      .eq("automation_id", a.id).order("created_at", { ascending: false }).limit(25)
      .then(({ data }: any) => setRows(data ?? []));
  }, [a.id, a.last_run_at]);
  if (!rows?.length) return null;
  return (
    <div className="space-y-1.5">
      <h4 className="text-sm font-semibold">Recently sent</h4>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-xs">
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-border/60 last:border-0">
                <td className="px-2 py-1.5 text-muted-foreground">{fmtDate(r.created_at)}</td>
                <td className="px-2 py-1.5">{r.contact?.name}</td>
                <td className="px-2 py-1.5 text-muted-foreground">{r.yacht?.vessel_name}</td>
                <td className="px-2 py-1.5">{r.threshold}-day · expires {r.expiry_date}</td>
                <td className="px-2 py-1.5">
                  <Chip t={r.status === "sent" ? "green" : "red"}>{r.status === "failed" && r.detail === "sending" ? "interrupted" : r.status}</Chip>
                  {r.status === "failed" && r.detail && r.detail !== "sending" && <span className="ml-1 text-muted-foreground">{r.detail}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Preview ──────────────────────────────────────────────────────────────────

function PreviewDialog({ a, onClose }: { a: Automation; onClose: () => void }) {
  const [data, setData] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void waApi(`automations/preview?id=${a.id}`).then(setData).catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [a.id]);

  const items: any[] = data?.items ?? [];
  const willSend = items.filter((i) => i.vesselOn && i.recipients.some((r: any) => !r.alreadySent));
  const sw = data?.switches;

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{a.name} — due today</DialogTitle>
          <DialogDescription>
            What the daily run would do right now{data ? ` (${data.today})` : ""}. Nothing is sent from this screen.
          </DialogDescription>
        </DialogHeader>
        {error ? <p className="text-sm text-red-500">{error}</p> : !data ? <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" /> : (
          <div className="space-y-3 text-sm">
            <div className="flex flex-wrap gap-1.5 text-xs">
              <SwitchChip on={sw.master} label="Platform switch" />
              <SwitchChip on={sw.sending} label="WhatsApp sending" />
              <SwitchChip on={sw.reminder} label="This reminder" />
              {sw.problem && <Chip t="amber">{sw.problem}</Chip>}
            </div>
            <p>
              <strong>{data.total}</strong> document{data.total === 1 ? "" : "s"} in a reminder stage today ·{" "}
              <strong>{willSend.length}</strong> would send (yacht switched on, with an opted-in contact, not already reminded).
            </p>
            {items.length === 0 ? <Empty title="Nothing due today" /> : (
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-xs">
                  <thead className="border-b border-border bg-muted/40 text-left text-[10px] uppercase tracking-wide text-muted-foreground">
                    <tr><th className="px-2 py-1.5">Document</th><th className="px-2 py-1.5">Yacht</th><th className="px-2 py-1.5">Expires</th><th className="px-2 py-1.5">Stage</th><th className="px-2 py-1.5">Goes to</th></tr>
                  </thead>
                  <tbody>
                    {items.map((it) => (
                      <tr key={it.sourceId} className="border-b border-border/60 align-top last:border-0">
                        <td className="px-2 py-1.5">
                          {it.label}
                          {it.example && <details className="mt-0.5 text-muted-foreground"><summary className="cursor-pointer">wording</summary><p className="mt-1 whitespace-pre-wrap">{it.example}</p></details>}
                        </td>
                        <td className="px-2 py-1.5">{it.vessel}{!it.vesselOn && <span className="block text-amber-600">yacht not switched on</span>}</td>
                        <td className="px-2 py-1.5">{it.fields.expiry_date}<span className="block text-muted-foreground">{it.daysLeft} days</span></td>
                        <td className="px-2 py-1.5">{it.threshold}-day</td>
                        <td className="px-2 py-1.5">
                          {it.recipients.length === 0 ? <span className="text-muted-foreground">no opted-in contacts</span>
                            : it.recipients.map((r: any) => (
                              <span key={r.contactId} className="block">{r.name}{r.alreadySent && <span className="text-muted-foreground"> — already reminded</span>}</span>
                            ))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function SwitchChip({ on, label }: { on: boolean; label: string }) {
  return <Chip t={on ? "green" : "grey"}>{on ? <CheckCircle2 className="h-3 w-3" /> : <Power className="h-3 w-3" />}{label}: {on ? "on" : "off"}</Chip>;
}

// ─── Test send ────────────────────────────────────────────────────────────────

function TestDialog({ a, onClose }: { a: Automation; onClose: () => void }) {
  const [contacts, setContacts] = useState<any[] | null>(null);
  const [cid, setCid] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void db().from("wa_contacts").select("id, name, phone_e164").eq("consent_status", "opted_in").eq("consent_updates", true)
      .not("phone_e164", "is", null).order("name").then(({ data }: any) => setContacts(data ?? []));
  }, []);
  async function send() {
    setBusy(true);
    try {
      const r = await waApi<{ used: string }>("automations/test", { id: a.id, contactId: cid });
      toast.success("Test reminder sent", { description: `Used ${r.used}. It isn't counted as the real reminder.` });
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Not sent");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Send a test {a.name.toLowerCase()} reminder</DialogTitle>
          <DialogDescription>Goes now, to the contact you choose — usually yourself. Uses a document due today, or example details if none is.</DialogDescription>
        </DialogHeader>
        <select value={cid} onChange={(e) => setCid(e.target.value)} className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm">
          <option value="">{contacts === null ? "Loading…" : contacts.length ? "Choose a contact (opted in to updates)…" : "No contacts opted in to updates"}</option>
          {(contacts ?? []).map((c) => <option key={c.id} value={c.id}>{c.name} — {c.phone_e164}</option>)}
        </select>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => void send()} disabled={!cid || busy}>{busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}Send test</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

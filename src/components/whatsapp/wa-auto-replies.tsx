/**
 * Auto-replies — Polaris's own answers to incoming WhatsApp messages:
 * a reply for each invite button, and an away message outside office hours.
 * All off by default. The sending lives in lib/whatsapp/auto-replies.server.
 */
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, MessageSquareReply, Moon, Save, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { personalise, SAMPLE_RECIPIENT, answerHeadcount, type WaButton } from "@/lib/whatsapp/shared";
import { db, Chip, type WaTemplate } from "./wa-common";

interface Rule {
  id: string;
  kind: "button" | "away";
  template_id: string | null;
  button_text: string | null;
  reply_text: string;
  enabled: boolean;
  options: { days?: number[]; start?: string; end?: string; outside_hours_only?: boolean; cooldown_hours?: number };
}

const OPT_OUT_RE = /stop|unsubscribe|opt.?out/i;
const NEGATIVE_RE = /can'?t|cannot|\bnot\b|\bno\b|decline|unable|sorry|won'?t/i;
const TOKENS_HINT = "You can use {{first_name}}, {{name}} and {{vessel}} — filled in for each person.";

/** A sensible first draft for a button's reply. */
function suggestion(label: string, buttons: WaButton[]): string {
  if (NEGATIVE_RE.test(label)) return "Sorry you can't make it, {{first_name}} — thanks for letting us know. We hope to see you next time!";
  if (answerHeadcount(label, buttons) > 1) return "Thanks {{first_name}} — that's you and your guest down. See you there! 🔥";
  return "Thanks {{first_name}} — we've got you down. See you there! 🔥";
}

async function me() {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

export function WaAutoReplies({ canEdit }: { canEdit: boolean }) {
  const [rules, setRules] = useState<Rule[] | null>(null);
  const [templates, setTemplates] = useState<WaTemplate[]>([]);

  async function load() {
    const [{ data: r }, { data: t }] = await Promise.all([
      db().from("wa_auto_replies").select("*"),
      db().from("wa_templates").select("*").order("updated_at", { ascending: false }),
    ]);
    setRules((r ?? []) as Rule[]);
    // Invites = templates with answer buttons other than the opt-out.
    setTemplates(((t ?? []) as WaTemplate[]).filter((x) =>
      (x.buttons ?? []).some((b) => b.type === "QUICK_REPLY" && !OPT_OUT_RE.test(b.text))));
  }
  useEffect(() => { void load(); }, []);

  if (!rules) return <div className="grid place-items-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  const away = rules.find((r) => r.kind === "away") ?? null;

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 rounded-xl border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          Polaris's own auto-replies. Switch off the <strong>Instant reply</strong> and <strong>Away message</strong> in Meta Business Suite
          (or Greeting / Away message in the WhatsApp Business app) so clients don't get two. Auto-replies never answer STOP or other opt-outs,
          and they don't mark a conversation as read — staff still see it in the Inbox.
        </span>
      </div>
      <ButtonReplies rules={rules} templates={templates} canEdit={canEdit} onChanged={load} />
      {away && <AwayMessage rule={away} canEdit={canEdit} onChanged={load} />}
    </div>
  );
}

// ─── Replies to invite buttons ────────────────────────────────────────────────

function ButtonReplies({ rules, templates, canEdit, onChanged }: { rules: Rule[]; templates: WaTemplate[]; canEdit: boolean; onChanged: () => void }) {
  const [tid, setTid] = useState<string>("");
  useEffect(() => { if (!tid && templates[0]) setTid(templates[0].id); }, [templates, tid]);
  const t = templates.find((x) => x.id === tid) ?? null;
  const answers = useMemo(() => (t?.buttons ?? []).filter((b) => b.type === "QUICK_REPLY" && !OPT_OUT_RE.test(b.text)).map((b) => b.text), [t]);
  const onCount = rules.filter((r) => r.kind === "button" && r.enabled).length;

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <MessageSquareReply className="h-4 w-4 text-muted-foreground" />
        <span className="flex-1">
          <span className="block font-medium">Replies to invite buttons</span>
          <span className="block text-xs text-muted-foreground">When someone taps an answer on an invite, reply straight away. {onCount ? `${onCount} on.` : "All off."}</span>
        </span>
        {templates.length > 0 && (
          <select value={tid} onChange={(e) => setTid(e.target.value)} className="h-8 rounded-md border border-border bg-background px-2 text-sm">
            {templates.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        )}
      </div>
      {!t ? (
        <p className="text-xs text-muted-foreground">No templates with answer buttons yet.</p>
      ) : (
        <div className="space-y-3">
          {answers.map((a) => (
            <ButtonRule key={`${t.id}:${a}`} template={t} answer={a} canEdit={canEdit} onChanged={onChanged}
              rule={rules.find((r) => r.kind === "button" && r.template_id === t.id && (r.button_text ?? "").toLowerCase() === a.toLowerCase()) ?? null} />
          ))}
          <p className="text-[11px] text-muted-foreground">{TOKENS_HINT} Each copy of an invite you've sent uses these — including ones already sent.</p>
        </div>
      )}
    </div>
  );
}

function ButtonRule({ template, answer, rule, canEdit, onChanged }: {
  template: WaTemplate; answer: string; rule: Rule | null; canEdit: boolean; onChanged: () => void;
}) {
  const [text, setText] = useState(rule?.reply_text || suggestion(answer, template.buttons ?? []));
  const [busy, setBusy] = useState(false);
  useEffect(() => { setText(rule?.reply_text || suggestion(answer, template.buttons ?? [])); }, [rule?.id, answer, template.id]);
  const dirty = (rule?.reply_text ?? "") !== text;

  async function save(enabled: boolean) {
    if (enabled && !text.trim()) { toast.error("Write the reply first"); return; }
    setBusy(true);
    const row = { reply_text: text.trim(), enabled, updated_by: await me() };
    const { error } = rule
      ? await db().from("wa_auto_replies").update(row).eq("id", rule.id)
      : await db().from("wa_auto_replies").insert({ ...row, kind: "button", template_id: template.id, button_text: answer });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(enabled ? `Auto-reply to "${answer}" is on` : `Auto-reply to "${answer}" saved (off)`);
    onChanged();
  }

  return (
    <div className="rounded-lg border border-border p-3">
      <div className="mb-1.5 flex items-center gap-2">
        <Chip t={NEGATIVE_RE.test(answer) ? "amber" : "green"}>{answer}</Chip>
        <span className="flex-1 text-[11px] text-muted-foreground">→ reply</span>
        {canEdit && (
          <Switch checked={!!rule?.enabled} disabled={busy} onCheckedChange={(v) => void save(v)} aria-label={`Auto-reply to ${answer}`} />
        )}
      </div>
      <Textarea rows={2} value={text} disabled={!canEdit} onChange={(e) => setText(e.target.value.slice(0, 1024))} />
      <div className="mt-1 flex items-center gap-2">
        <p className="flex-1 truncate text-[11px] text-muted-foreground">Preview: {personalise(text, SAMPLE_RECIPIENT)}</p>
        {canEdit && dirty && (
          <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" disabled={busy} onClick={() => void save(!!rule?.enabled)}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── Away message ─────────────────────────────────────────────────────────────

const DAYS: Array<[number, string]> = [[1, "Mon"], [2, "Tue"], [3, "Wed"], [4, "Thu"], [5, "Fri"], [6, "Sat"], [7, "Sun"]];

function AwayMessage({ rule, canEdit, onChanged }: { rule: Rule; canEdit: boolean; onChanged: () => void }) {
  const o = rule.options ?? {};
  const [text, setText] = useState(rule.reply_text);
  const [days, setDays] = useState<number[]>(o.days ?? [1, 2, 3, 4, 5]);
  const [start, setStart] = useState(o.start ?? "08:00");
  const [end, setEnd] = useState(o.end ?? "17:00");
  const [outsideOnly, setOutsideOnly] = useState(o.outside_hours_only !== false);
  const [cooldown, setCooldown] = useState(o.cooldown_hours ?? 12);
  const [busy, setBusy] = useState(false);

  const options = { days: [...days].sort(), start, end, outside_hours_only: outsideOnly, cooldown_hours: cooldown };
  const dirty = text !== rule.reply_text || JSON.stringify(options) !== JSON.stringify({
    days: [...(o.days ?? [1, 2, 3, 4, 5])].sort(), start: o.start ?? "08:00", end: o.end ?? "17:00",
    outside_hours_only: o.outside_hours_only !== false, cooldown_hours: o.cooldown_hours ?? 12,
  });

  async function save(enabled: boolean) {
    if (enabled && !text.trim()) { toast.error("Write the away message first"); return; }
    if (!/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end) || start >= end) { toast.error("Office hours: the start must be before the end"); return; }
    setBusy(true);
    const { error } = await db().from("wa_auto_replies").update({ reply_text: text.trim(), enabled, options, updated_by: await me() }).eq("id", rule.id);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(enabled ? "Away message is on" : "Away message saved (off)");
    onChanged();
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <Moon className="h-4 w-4 text-muted-foreground" />
        <span className="flex-1">
          <span className="block font-medium">Away message</span>
          <span className="block text-xs text-muted-foreground">
            Replies to anything else people write {outsideOnly ? "outside office hours" : "at any time"} — never to button taps, at most once every {cooldown} hours per person,
            and not if a member of staff has replied in that time.
          </span>
        </span>
        <Chip t={rule.enabled ? "green" : "grey"}>{rule.enabled ? "On" : "Off"}</Chip>
        {canEdit && <Switch checked={rule.enabled} disabled={busy} onCheckedChange={(v) => void save(v)} aria-label="Away message" />}
      </div>
      <Textarea rows={3} value={text} disabled={!canEdit} onChange={(e) => setText(e.target.value.slice(0, 1024))} />
      <p className="mt-1 text-[11px] text-muted-foreground">{TOKENS_HINT}</p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-xs">Office hours (Dubai time)</Label>
          <div className="flex flex-wrap gap-1">
            {DAYS.map(([n, label]) => (
              <button key={n} type="button" disabled={!canEdit}
                onClick={() => setDays((d) => (d.includes(n) ? d.filter((x) => x !== n) : [...d, n]))}
                className={cn("rounded-md border px-2 py-1 text-xs", days.includes(n) ? "border-primary bg-primary/10" : "border-border text-muted-foreground")}>
                {label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 text-xs">
            <Input type="time" value={start} disabled={!canEdit} onChange={(e) => setStart(e.target.value)} className="h-8 w-28" />
            to
            <Input type="time" value={end} disabled={!canEdit} onChange={(e) => setEnd(e.target.value)} className="h-8 w-28" />
          </div>
        </div>
        <div className="space-y-2 text-xs">
          <label className="flex items-center gap-2">
            <Checkbox checked={outsideOnly} disabled={!canEdit} onCheckedChange={(v) => setOutsideOnly(!!v)} /> Only outside office hours
          </label>
          <label className="flex items-center gap-2">
            At most once every
            <select value={cooldown} disabled={!canEdit} onChange={(e) => setCooldown(Number(e.target.value))}
              className="h-8 rounded-md border border-border bg-background px-2 text-xs">
              {[2, 4, 8, 12, 24, 48].map((h) => <option key={h} value={h}>{h} hours</option>)}
            </select>
            per person
          </label>
        </div>
      </div>
      {canEdit && dirty && (
        <div className="mt-3 flex justify-end">
          <Button size="sm" className="gap-1.5" disabled={busy} onClick={() => void save(rule.enabled)}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * Responses — who's said what to an invite, across every way it went out.
 *
 * An "invite" is an approved template with quick-reply buttons (I'll be there
 * / Can't make it). It may have gone out in one or more sends and as one-off
 * templates from the Inbox; this gathers every copy, one row per person, and
 * sorts them by answer:
 *
 *   - a button they tapped (or a reply quoting the invite) — WhatsApp links it
 *     to the exact message, so the latest wins if they answer twice;
 *   - anything else they wrote back within 3 weeks of the invite, shown so
 *     staff can read it and mark the answer;
 *   - an answer staff set by hand (wa_rsvp_answers) — a phone call, a word at
 *     the marina — which takes precedence over WhatsApp.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Download, Loader2, MessageSquareText, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { db, Chip, Empty, fmtDate, type WaTemplate } from "./wa-common";
import { answerHeadcount, type WaButton } from "@/lib/whatsapp/shared";

const OPT_OUT_RE = /stop|unsubscribe|opt.?out/i;
const NEGATIVE_RE = /can'?t|cannot|\bnot\b|\bno\b|decline|unable|sorry|regret|won'?t/i;
const WROTE_BACK_DAYS = 21;

const NONE = "__none__";
const TEXT = "__text__";
const UNDELIVERED = "__undelivered__";

type Invite = {
  id: string; contact_id: string | null; phone_e164: string | null; wa_message_id: string | null;
  status: string; sent_at: string | null; queued_at: string; campaign_id: string | null;
  campaign?: { name: string } | null;
  contact?: { name: string | null; email: string | null; yacht?: { vessel_name: string | null } | null } | null;
};
type Person = {
  key: string; contactId: string | null; name: string; vessel: string | null; email: string | null; phone: string | null;
  invitedAt: string | null; via: string[]; delivered: boolean; read: boolean;
  answerKey: string;               // a button's text, TEXT, NONE or UNDELIVERED
  text: string | null;             // what they wrote, for TEXT (or a hint under NONE)
  at: string | null;               // when they answered
  source: "button" | "quoted" | "wrote" | "staff" | null;
  setBy: string | null; note: string | null;
};

const toneFor = (label: string): "green" | "amber" | "red" =>
  OPT_OUT_RE.test(label) ? "red" : NEGATIVE_RE.test(label) ? "amber" : "green";

function csvCell(v: unknown) {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function WaResponses({ canEdit }: { canEdit: boolean }) {
  const [templates, setTemplates] = useState<Array<WaTemplate & { invited: number }> | null>(null);
  const [templateId, setTemplateId] = useState<string | null>(null);

  // Invites = templates with quick-reply answers (other than the opt-out) that have gone out.
  useEffect(() => {
    void (async () => {
      const [{ data: ts }, { data: sent }] = await Promise.all([
        db().from("wa_templates").select("*").order("updated_at", { ascending: false }),
        db().from("wa_messages").select("template_id").in("kind", ["campaign", "template"]).not("template_id", "is", null),
      ]);
      const count = new Map<string, number>();
      for (const m of (sent ?? []) as any[]) count.set(m.template_id, (count.get(m.template_id) ?? 0) + 1);
      const list = ((ts ?? []) as WaTemplate[])
        .filter((t) => (t.buttons ?? []).some((b) => b.type === "QUICK_REPLY" && !OPT_OUT_RE.test(b.text)) && count.has(t.id))
        .map((t) => ({ ...t, invited: count.get(t.id) ?? 0 }));
      setTemplates(list);
      setTemplateId((cur) => cur ?? list[0]?.id ?? null);
    })();
  }, []);

  if (templates === null) return <div className="grid place-items-center py-16"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  if (templates.length === 0) {
    return (
      <Empty title="No invites sent yet">
        Responses gathers the answers to any template with reply buttons — like "I'll be there" / "Can't make it" — once it's been sent.
      </Empty>
    );
  }
  const template = templates.find((t) => t.id === templateId) ?? templates[0];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs text-muted-foreground" htmlFor="wa-resp-template">Invite</label>
        <select id="wa-resp-template" value={template.id} onChange={(e) => setTemplateId(e.target.value)}
                className="h-9 min-w-[240px] rounded-md border border-border bg-background px-2 text-sm">
          {templates.map((t) => <option key={t.id} value={t.id}>{t.name.replace(/_/g, " ")} · {t.invited} sent</option>)}
        </select>
      </div>
      <InviteResponses key={template.id} template={template} canEdit={canEdit} />
    </div>
  );
}

function InviteResponses({ template, canEdit }: { template: WaTemplate; canEdit: boolean }) {
  const [people, setPeople] = useState<Person[] | null>(null);
  const [filter, setFilter] = useState<string>("all");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);

  const answers = useMemo(() => (template.buttons ?? []).filter((b) => b.type === "QUICK_REPLY").map((b) => b.text), [template]);
  const markable = answers.filter((a) => !OPT_OUT_RE.test(a));

  const load = useCallback(async () => {
    setLoading(true);
    const { data: msgs, error } = await db().from("wa_messages")
      .select("id, contact_id, phone_e164, wa_message_id, status, sent_at, queued_at, campaign_id, campaign:wa_campaigns(name), contact:wa_contacts(name, email, yacht:yachts(vessel_name))")
      .eq("template_id", template.id).in("kind", ["campaign", "template"]).order("queued_at");
    if (error) { toast.error(error.message); setLoading(false); return; }
    const invites = (msgs ?? []) as Invite[];
    const wamids = invites.map((m) => m.wa_message_id).filter(Boolean) as string[];
    const contactIds = [...new Set(invites.map((m) => m.contact_id).filter(Boolean))] as string[];
    const firstSent = invites.reduce<string | null>((min, m) => (m.sent_at && (!min || m.sent_at < min) ? m.sent_at : min), null);

    // Answers linked to an invite (button taps, quoted replies)…
    const linked: any[] = [];
    for (let i = 0; i < wamids.length; i += 150) {
      const { data } = await db().from("wa_inbound").select("context_wamid, contact_id, from_phone, type, body, button_payload, received_at")
        .in("context_wamid", wamids.slice(i, i + 150)).order("received_at");
      linked.push(...(data ?? []));
    }
    // …anything else the same people wrote after the invite…
    const loose: any[] = [];
    if (firstSent) {
      for (let i = 0; i < contactIds.length; i += 150) {
        const { data } = await db().from("wa_inbound").select("contact_id, type, body, context_wamid, received_at")
          .in("contact_id", contactIds.slice(i, i + 150)).gte("received_at", firstSent).order("received_at");
        loose.push(...(data ?? []));
      }
    }
    // …and answers staff have set by hand.
    const { data: manual } = await db().from("wa_rsvp_answers").select("contact_id, answer, note, set_by_name, set_at").eq("template_id", template.id);
    const manualBy = new Map(((manual ?? []) as any[]).map((r) => [r.contact_id, r]));

    const wamidSet = new Set(wamids);
    const byWamid = new Map(invites.filter((m) => m.wa_message_id).map((m) => [m.wa_message_id!, m]));
    const out = new Map<string, Person>();
    for (const m of invites) {
      const key = m.contact_id ?? m.phone_e164 ?? m.id;
      const p = out.get(key) ?? {
        key, contactId: m.contact_id, name: m.contact?.name || m.phone_e164 || "Unknown", vessel: m.contact?.yacht?.vessel_name ?? null,
        email: m.contact?.email ?? null, phone: m.phone_e164, invitedAt: null, via: [], delivered: false, read: false,
        answerKey: NONE, text: null, at: null, source: null, setBy: null, note: null,
      };
      const via = m.campaign?.name ?? "One-off from the Inbox";
      if (!p.via.includes(via)) p.via.push(via);
      if (m.sent_at && (!p.invitedAt || m.sent_at < p.invitedAt)) p.invitedAt = m.sent_at;
      if (["sent", "delivered", "read"].includes(m.status)) p.delivered = true;
      if (m.status === "read") p.read = true;
      out.set(key, p);
    }
    // Linked answers in time order — the latest wins.
    for (const r of linked) {
      const inv = byWamid.get(r.context_wamid);
      if (!inv) continue;
      const p = out.get(inv.contact_id ?? inv.phone_e164 ?? inv.id);
      const text = String(r.body ?? r.button_payload ?? "").trim();
      if (!p || !text) continue;
      const isButton = r.type === "button" || r.type === "interactive";
      p.answerKey = isButton ? text : TEXT;
      p.text = isButton ? null : text;
      p.at = r.received_at; p.source = isButton ? "button" : "quoted";
    }
    // Free text that didn't quote the invite — only for people with no linked answer.
    for (const r of loose) {
      if (r.context_wamid && wamidSet.has(r.context_wamid)) continue;
      const p = out.get(r.contact_id);
      const text = String(r.body ?? "").trim();
      if (!p || !text || p.source === "button" || p.source === "quoted" || !p.invitedAt) continue;
      if (r.received_at < p.invitedAt || Date.parse(r.received_at) - Date.parse(p.invitedAt) > WROTE_BACK_DAYS * 86400000) continue;
      p.answerKey = TEXT; p.text = text; p.at = r.received_at; p.source = "wrote";
    }
    for (const p of out.values()) {
      const m = p.contactId ? manualBy.get(p.contactId) : null;
      if (m) {
        p.answerKey = m.answer; p.at = m.set_at; p.source = "staff"; p.setBy = m.set_by_name; p.note = m.note;
      } else if (p.answerKey === NONE && !p.delivered) {
        p.answerKey = UNDELIVERED;
      }
    }
    setPeople([...out.values()]);
    setLoading(false);
  }, [template.id]);

  useEffect(() => {
    void load();
    const t = setInterval(() => { if (!document.hidden) void load(); }, 30_000);
    return () => clearInterval(t);
  }, [load]);

  const mark = async (p: Person, answer: string) => {
    if (!p.contactId) return;
    setSaving(p.key);
    try {
      if (!answer) {
        const { error } = await db().from("wa_rsvp_answers").delete().eq("template_id", template.id).eq("contact_id", p.contactId);
        if (error) throw error;
      } else {
        const { data: { user } } = await supabase.auth.getUser();
        let name: string | null = null;
        if (user) {
          const { data: prof } = await db().from("profiles").select("display_name, first_name, last_name").eq("id", user.id).maybeSingle();
          name = prof?.display_name || [prof?.first_name, prof?.last_name].filter(Boolean).join(" ") || user.email || null;
        }
        const { error } = await db().from("wa_rsvp_answers").upsert({
          template_id: template.id, contact_id: p.contactId, answer,
          note: p.source === "wrote" || p.source === "quoted" ? (p.text ?? "").slice(0, 500) || null : p.note,
          set_by: user?.id ?? null, set_by_name: name, set_at: new Date().toISOString(),
        }, { onConflict: "template_id,contact_id" });
        if (error) throw error;
      }
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not save the answer");
    } finally {
      setSaving(null);
    }
  };

  // How many people each answer stands for ("Bringing a +1" = 2). Read from the
  // button label unless staff set it; saved on the template, which needs no review.
  const [buttons, setButtons] = useState<WaButton[]>(template.buttons ?? []);
  useEffect(() => { setButtons(template.buttons ?? []); }, [template]);
  const headcount = (answer: string) => answerHeadcount(answer, buttons);
  const setHeadcount = async (answer: string, n: number) => {
    const next = buttons.map((b) => (b.type === "QUICK_REPLY" && b.text === answer ? { ...b, people: n } : b));
    setButtons(next);
    const { error } = await db().from("wa_templates").update({ buttons: next }).eq("id", template.id);
    if (error) { toast.error(error.message); setButtons(template.buttons ?? []); }
  };

  if (people === null) return <div className="grid place-items-center py-16"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  // Every answer on the template, then any that are no longer on it (edited since), then the rest.
  const count = (k: string) => people.filter((p) => p.answerKey === k).length;
  const extra = [...new Set(people.map((p) => p.answerKey))].filter((k) => ![...answers, TEXT, NONE, UNDELIVERED].includes(k));
  const cards: Array<{ key: string; label: string; tone: "green" | "amber" | "red" | "blue" | "grey" }> = [
    ...[...answers, ...extra].map((a) => ({ key: a, label: a, tone: toneFor(a) })),
    { key: TEXT, label: "Wrote back — check", tone: "blue" },
    { key: NONE, label: "No answer yet", tone: "grey" },
    ...(count(UNDELIVERED) ? [{ key: UNDELIVERED, label: "Didn't reach them", tone: "red" as const }] : []),
  ];
  const order = new Map(cards.map((c, i) => [c.key, i]));
  const shown = people
    .filter((p) => filter === "all" || p.answerKey === filter)
    .sort((a, b) => (order.get(a.answerKey) ?? 99) - (order.get(b.answerKey) ?? 99) || a.name.localeCompare(b.name));
  const answered = people.filter((p) => ![NONE, UNDELIVERED].includes(p.answerKey)).length;
  const reached = people.filter((p) => p.delivered).length;
  const coming = answers.find((a) => toneFor(a) === "green");
  const notComing = answers.find((a) => toneFor(a) === "amber");
  // Everyone who said yes in any form ("I'll be there", "Bringing a +1"), counted in people.
  const yesAnswers = [...answers, ...extra].filter((a) => toneFor(a) === "green");
  const yesReplies = yesAnswers.reduce((n, a) => n + count(a), 0);
  const yesPeople = yesAnswers.reduce((n, a) => n + count(a) * headcount(a), 0);

  const label = (k: string) => (k === TEXT ? "Wrote back" : k === NONE ? "No answer yet" : k === UNDELIVERED ? "Didn't reach them" : k);
  const download = () => {
    const rows = [["Name", "Vessel", "Email", "WhatsApp", "Answer", "People", "What they wrote", "Answered", "How", "Note", "Sent via"]];
    for (const p of shown) {
      rows.push([
        p.name, p.vessel ?? "", p.email ?? "", p.phone ?? "", label(p.answerKey),
        toneFor(p.answerKey) === "green" && ![TEXT, NONE, UNDELIVERED].includes(p.answerKey) ? String(headcount(p.answerKey)) : "",
        p.text ?? "",
        p.at ? new Date(p.at).toLocaleString() : "",
        p.source === "staff" ? `Set by ${p.setBy ?? "staff"}` : p.source === "button" ? "Tapped a button" : p.source ? "Wrote back" : "",
        p.note ?? "", p.via.join("; "),
      ]);
    }
    const blob = new Blob(["﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${template.name.replace(/_/g, " ")} - responses.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  return (
    <div className="space-y-4">
      {/* Headline */}
      <div className="rounded-xl border border-border p-4">
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
          {coming && (
            <div>
              <span className="text-3xl font-semibold tabular-nums text-emerald-500">{yesPeople}</span>{" "}
              <span className="text-sm text-muted-foreground">
                {yesPeople === 1 ? "person" : "people"} coming{yesPeople !== yesReplies ? ` (${yesReplies} ${yesReplies === 1 ? "reply" : "replies"}, guests included)` : ""}
              </span>
            </div>
          )}
          {notComing && <div><span className="text-3xl font-semibold tabular-nums text-amber-500">{count(notComing)}</span> <span className="text-sm text-muted-foreground">can't make it</span></div>}
          <div><span className="text-3xl font-semibold tabular-nums">{count(NONE) + count(TEXT)}</span> <span className="text-sm text-muted-foreground">still to confirm</span></div>
          <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
            {people.length} invited · {reached} reached · {answered} answered{reached ? ` (${Math.round((answered / reached) * 100)}%)` : ""}
            <button type="button" onClick={() => void load()} title="Refresh" className="rounded p-1 hover:text-foreground">
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            </button>
          </div>
        </div>
        <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{template.body_text.replace(/\{\{\w+\}\}/g, "…")}</p>
      </div>

      {/* Answer boxes — tap one to see who */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {cards.map((c) => (
          <button key={c.key} type="button" onClick={() => setFilter(filter === c.key ? "all" : c.key)}
                  className={cn("rounded-xl border p-3 text-left transition", filter === c.key ? "border-primary bg-primary/10" : "border-border hover:bg-muted/40")}>
            <span className="block text-xl font-semibold tabular-nums">{count(c.key)}</span>
            <Chip t={c.tone}>{c.label}</Chip>
            {c.tone === "green" && headcount(c.key) !== 1 && (
              <span className="mt-1 block text-[11px] text-muted-foreground">= {count(c.key) * headcount(c.key)} people (×{headcount(c.key)})</span>
            )}
          </button>
        ))}
      </div>

      {/* How many people each "yes" stands for */}
      {canEdit && yesAnswers.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
          <span>Each answer counts as:</span>
          {yesAnswers.map((a) => (
            <label key={a} className="flex items-center gap-1.5">
              <span className="text-foreground">{a}</span>
              <select value={headcount(a)} onChange={(e) => void setHeadcount(a, Number(e.target.value))}
                      className="h-7 rounded-md border border-border bg-background px-1.5 text-xs">
                {Array.from({ length: 11 }, (_, n) => <option key={n} value={n}>{n} {n === 1 ? "person" : "people"}</option>)}
              </select>
            </label>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <p className="flex-1 text-xs text-muted-foreground">
          {filter === "all" ? "Everyone invited, grouped by answer." : `Showing: ${label(filter)}.`}{" "}
          Answers from the buttons come in by themselves. If someone writes back or answers another way, mark it here.
        </p>
        {filter !== "all" && <Button size="sm" variant="ghost" onClick={() => setFilter("all")}>Show everyone</Button>}
        <Button size="sm" variant="outline" className="gap-1.5" onClick={download}><Download className="h-4 w-4" /> Download</Button>
      </div>

      {shown.length === 0 ? (
        <Empty title="Nobody here yet" />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/40 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr><th className="px-3 py-2">Name</th><th className="px-3 py-2">Vessel</th><th className="px-3 py-2">Answer</th><th className="px-3 py-2">When</th>{canEdit && <th className="px-3 py-2">Mark as</th>}</tr>
            </thead>
            <tbody>
              {shown.map((p) => (
                <tr key={p.key} className="border-b border-border/60 align-top last:border-0">
                  <td className="px-3 py-2">
                    <div className="font-medium">{p.name}</div>
                    <div className="text-[11px] text-muted-foreground">{p.phone ?? ""}{p.via.length > 1 ? ` · invited ${p.via.length}×` : ""}</div>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{p.vessel ?? "—"}</td>
                  <td className="px-3 py-2">
                    <Chip t={p.answerKey === TEXT ? "blue" : p.answerKey === NONE ? "grey" : p.answerKey === UNDELIVERED ? "red" : toneFor(p.answerKey)}>{label(p.answerKey)}</Chip>
                    {p.answerKey === NONE && p.read && <span className="ml-1.5 text-[11px] text-muted-foreground">read it</span>}
                    {p.text && p.answerKey === TEXT && (
                      <div className="mt-1 flex max-w-md items-start gap-1 text-xs text-muted-foreground">
                        <MessageSquareText className="mt-0.5 h-3 w-3 shrink-0" /> <span className="line-clamp-3">"{p.text}"</span>
                      </div>
                    )}
                    {p.source === "staff" && (
                      <div className="mt-1 text-[11px] text-muted-foreground">Set by {p.setBy ?? "staff"}{p.note ? ` — "${p.note}"` : ""}</div>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">{p.at ? fmtDate(p.at) : "—"}</td>
                  {canEdit && (
                    <td className="px-3 py-2">
                      {p.contactId ? (
                        <select aria-label={`Answer for ${p.name}`} disabled={saving === p.key}
                                value={p.source === "staff" ? p.answerKey : ""}
                                onChange={(e) => void mark(p, e.target.value)}
                                className="h-8 rounded-md border border-border bg-background px-2 text-xs disabled:opacity-50">
                          <option value="">{p.source === "staff" ? "Clear — use WhatsApp" : "From WhatsApp"}</option>
                          {markable.map((a) => <option key={a} value={a}>{a}</option>)}
                        </select>
                      ) : <span className="text-xs text-muted-foreground">—</span>}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

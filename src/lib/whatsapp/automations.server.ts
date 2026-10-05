/**
 * Expiry reminders over WhatsApp — crew visas, crew passports, vessel permits.
 *
 * Nothing sends unless ALL of these are on (each is off by default):
 *   1. WHATSAPP_AUTOMATIONS_ENABLED = "true" on the Worker (master switch)
 *   2. WHATSAPP_SENDING_ENABLED = "true" (the general WhatsApp send switch)
 *   3. the reminder's own toggle (wa_automations.enabled)
 *   4. the yacht's opt-in for that reminder (wa_automation_vessels.enabled)
 * …and then only to that yacht's contacts who opted in to updates, using an
 * approved Utility template.
 *
 * Each document is reminded once per stage (e.g. 30 / 14 / 7 days before):
 * wa_automation_log is claimed BEFORE sending, so a re-run, an overlapping run
 * or a crash can never message anyone twice — at worst one reminder is missed.
 *
 *   GET  /api/whatsapp/automations/preview?id=…   what would send today (view)
 *   POST /api/whatsapp/automations/test           one sample reminder to a contact (edit)
 */
import { createClient } from "@supabase/supabase-js";
import { requireAccess } from "@/lib/auth/requireAccess.server";
import { waConfig, sendingEnabled, automationsEnabled, sendTemplate, MetaError } from "@/lib/whatsapp/cloud-api.server";
import { templateExtras } from "@/lib/whatsapp/api.server";
import {
  AUTOMATION_FIELDS, STARTER_TEMPLATES, dueThreshold, permitLabel, placeholderCount, fillTemplate, personalise,
  type AutomationKind, type VariableSource,
} from "@/lib/whatsapp/shared";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function admin(): any {
  return createClient(process.env.SUPABASE_URL ?? "", process.env.SUPABASE_SERVICE_ROLE_KEY ?? "", {
    auth: { persistSession: false },
  });
}

/** Per run, across all reminders — keeps a run well inside a Worker's subrequest budget. */
const MAX_SENDS_PER_RUN = 120;
const DAY = 86_400_000;

/** Today's date in Dubai (UTC+4), as YYYY-MM-DD — expiries are calendar dates. */
function dubaiToday(): string {
  return new Date(Date.now() + 4 * 3_600_000).toISOString().slice(0, 10);
}
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY);
const fmtDay = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

function chunks<T>(arr: T[], n = 150): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

export interface DueItem {
  sourceId: string;
  yachtId: string;
  expiry: string;
  daysLeft: number;
  threshold: number;
  label: string; // for the preview: "John Doe — crew visa"
  fields: Record<string, string>;
}

const visaLabel = (t: string | null) => (/multiple/i.test(t ?? "") ? "multiple-entry crew visa" : "crew visa");

/** Documents of this kind whose expiry falls in a reminder stage today. */
async function collectDue(db: any, a: any, today: string): Promise<DueItem[]> {
  const stages: number[] = a.days_before?.length ? a.days_before : [30, 14, 7];
  const until = addDays(today, Math.max(...stages));
  const raw: Array<Omit<DueItem, "daysLeft" | "threshold">> = [];

  if (a.kind === "crew_visa") {
    const { data } = await db.from("visa_applications")
      .select("id, yacht_id, crew_member_id, passport_number, visa_type, visa_expiry, given_name, surname")
      .eq("status", "approved").not("yacht_id", "is", null)
      .gte("visa_expiry", today).lte("visa_expiry", until).limit(2000);
    const rows = (data ?? []) as any[];
    // A newer visa for the same person (by passport or crew record) means it's been renewed.
    const passports = [...new Set(rows.map((r) => r.passport_number).filter(Boolean))];
    const crewIds = [...new Set(rows.map((r) => r.crew_member_id).filter(Boolean))];
    const newer: any[] = [];
    for (const c of chunks(passports)) {
      const { data: n } = await db.from("visa_applications").select("id, passport_number, crew_member_id, visa_expiry")
        .in("passport_number", c).neq("status", "cancelled").gt("visa_expiry", today);
      newer.push(...(n ?? []));
    }
    for (const c of chunks(crewIds)) {
      const { data: n } = await db.from("visa_applications").select("id, passport_number, crew_member_id, visa_expiry")
        .in("crew_member_id", c).neq("status", "cancelled").gt("visa_expiry", today);
      newer.push(...(n ?? []));
    }
    for (const r of rows) {
      const renewed = newer.some((n) => n.id !== r.id && n.visa_expiry > r.visa_expiry
        && ((r.passport_number && n.passport_number === r.passport_number) || (r.crew_member_id && n.crew_member_id === r.crew_member_id)));
      if (renewed) continue;
      const crew = [r.given_name, r.surname].filter(Boolean).join(" ").trim() || "a crew member";
      raw.push({
        sourceId: `visa:${r.id}`, yachtId: r.yacht_id, expiry: r.visa_expiry, label: `${crew} — ${visaLabel(r.visa_type)}`,
        fields: { crew_name: crew, visa_type: visaLabel(r.visa_type) },
      });
    }
  }

  if (a.kind === "crew_passport") {
    const { data } = await db.from("crew_passports")
      .select("id, crew_id, expiry_date, first_name, last_name, crew:crew_members(yacht_id, full_name, first_name, last_name, status)")
      .gte("expiry_date", today).lte("expiry_date", until).limit(2000);
    const rows = ((data ?? []) as any[]).filter((r) => r.crew?.yacht_id && ["active", "on_leave"].includes(r.crew?.status));
    const crewIds = [...new Set(rows.map((r) => r.crew_id).filter(Boolean))];
    const newer: any[] = [];
    for (const c of chunks(crewIds)) {
      const { data: n } = await db.from("crew_passports").select("id, crew_id, expiry_date").in("crew_id", c).gt("expiry_date", today);
      newer.push(...(n ?? []));
    }
    for (const r of rows) {
      if (newer.some((n) => n.id !== r.id && n.crew_id === r.crew_id && n.expiry_date > r.expiry_date)) continue;
      const crew = (r.crew?.full_name || [r.first_name ?? r.crew?.first_name, r.last_name ?? r.crew?.last_name].filter(Boolean).join(" ")).trim()
        || "a crew member";
      raw.push({
        sourceId: `passport:${r.id}`, yachtId: r.crew.yacht_id, expiry: r.expiry_date, label: `${crew} — passport`,
        fields: { crew_name: crew },
      });
    }
  }

  if (a.kind === "vessel_permit") {
    let q = db.from("permits").select("id, yacht_id, permit_type, permit_number, expiry_date")
      .eq("status", "active").not("yacht_id", "is", null).gte("expiry_date", today).lte("expiry_date", until).limit(2000);
    const types: string[] = Array.isArray(a.options?.permit_types) ? a.options.permit_types : [];
    if (types.length) q = q.in("permit_type", types);
    const { data } = await q;
    const rows = (data ?? []) as any[];
    // A newer permit of the same type for the yacht — issued or in progress — means it's being renewed.
    const yachtIds = [...new Set(rows.map((r) => r.yacht_id))];
    const newer: any[] = [];
    for (const c of chunks(yachtIds)) {
      const { data: n } = await db.from("permits").select("id, yacht_id, permit_type, expiry_date, status")
        .in("yacht_id", c).in("status", ["active", "pending"]).gt("expiry_date", today);
      newer.push(...(n ?? []));
    }
    for (const r of rows) {
      if (newer.some((n) => n.id !== r.id && n.yacht_id === r.yacht_id && n.permit_type === r.permit_type && n.expiry_date > r.expiry_date)) continue;
      const label = permitLabel(r.permit_type);
      raw.push({
        sourceId: `permit:${r.id}`, yachtId: r.yacht_id, expiry: r.expiry_date, label: `${label}${r.permit_number ? ` ${r.permit_number}` : ""}`,
        fields: { permit_type: label, permit_number: r.permit_number || "—" },
      });
    }
  }

  const out: DueItem[] = [];
  for (const r of raw) {
    const daysLeft = daysBetween(today, r.expiry);
    const threshold = dueThreshold(daysLeft, stages);
    if (threshold == null) continue;
    out.push({
      ...r, daysLeft, threshold,
      fields: { ...r.fields, expiry_date: fmtDay(r.expiry), days_left: String(daysLeft) },
    });
  }
  return out;
}

export interface PlannedItem extends DueItem {
  vessel: string;
  vesselOn: boolean;
  recipients: Array<{ contactId: string; name: string; phone: string; alreadySent: boolean }>;
}

/** Everything due today for one reminder, with who would get it and why not. */
export async function planAutomation(db: any, a: any, today = dubaiToday()): Promise<PlannedItem[]> {
  const due = await collectDue(db, a, today);
  if (!due.length) return [];
  const yachtIds = [...new Set(due.map((d) => d.yachtId))];
  const [{ data: yachts }, { data: optins }, { data: contacts }] = await Promise.all([
    db.from("yachts").select("id, vessel_name").in("id", yachtIds),
    db.from("wa_automation_vessels").select("yacht_id, enabled").eq("automation_id", a.id).in("yacht_id", yachtIds),
    db.from("wa_contacts").select("id, name, phone_e164, yacht_id")
      .in("yacht_id", yachtIds).eq("consent_status", "opted_in").eq("consent_updates", true).not("phone_e164", "is", null),
  ]);
  const logged: any[] = [];
  for (const c of chunks(due.map((d) => d.sourceId), 100)) {
    const { data } = await db.from("wa_automation_log").select("source_id, threshold, contact_id")
      .eq("automation_id", a.id).in("source_id", c);
    logged.push(...(data ?? []));
  }
  const vesselName = new Map(((yachts ?? []) as any[]).map((y) => [y.id, y.vessel_name ?? "your yacht"]));
  const on = new Set(((optins ?? []) as any[]).filter((o) => o.enabled).map((o) => o.yacht_id));
  const sent = new Set(logged.map((l) => `${l.source_id}|${l.threshold}|${l.contact_id}`));
  return due.map((d) => ({
    ...d,
    vessel: vesselName.get(d.yachtId) ?? "your yacht",
    vesselOn: on.has(d.yachtId),
    fields: { ...d.fields, vessel_name: vesselName.get(d.yachtId) ?? "your yacht" },
    recipients: ((contacts ?? []) as any[]).filter((c) => c.yacht_id === d.yachtId).map((c) => ({
      contactId: c.id, name: c.name, phone: c.phone_e164, alreadySent: sent.has(`${d.sourceId}|${d.threshold}|${c.id}`),
    })),
  })).sort((x, y) => x.daysLeft - y.daysLeft);
}

/** The template values for one recipient: mapped fields, or fixed text (which may use {{name}} etc.). */
function valuesFor(map: VariableSource[], needed: number, fields: Record<string, string>, who: { name: string; vessel: string }) {
  const all: Record<string, string> = {
    ...fields, contact_name: who.name || "there", contact_first_name: (who.name || "").split(/\s+/)[0] || "there",
  };
  return Array.from({ length: needed }, (_, i) => {
    const src = map[i];
    const v = !src ? "" : "field" in src ? all[src.field] ?? "" : personalise(src.text, who);
    // Meta rejects an empty parameter, and newlines/tabs inside one.
    return (v || "—").replace(/[\n\t]+/g, " ").replace(/ {4,}/g, "   ");
  });
}

/** Why a reminder can't send right now, or null. Settings problems, not switches. */
function configProblem(a: any, t: any): string | null {
  if (!t) return "no template chosen";
  if (t.status !== "approved") return `template ${t.name} is ${t.status}, not approved`;
  if (t.category !== "UTILITY") return "expiry reminders must use an Updates (utility) template";
  const needed = placeholderCount(t.body_text);
  const map: VariableSource[] = Array.isArray(a.variable_map) ? a.variable_map : [];
  for (let i = 0; i < needed; i++) {
    const src = map[i];
    if (!src || ("field" in src ? !src.field : !String(src.text ?? "").trim())) return `{{${i + 1}}} isn't filled in`;
    if ("field" in src && !AUTOMATION_FIELDS[a.kind as AutomationKind].some((f) => f.key === src.field)) return `{{${i + 1}}} uses an unknown field`;
  }
  return null;
}

async function sendOne(db: any, cfg: any, a: any, t: any, extras: any, item: PlannedItem, r: PlannedItem["recipients"][number], log: boolean) {
  const needed = placeholderCount(t.body_text);
  const who = { name: r.name, vessel: item.vessel };
  const values = valuesFor(a.variable_map ?? [], needed, item.fields, who);
  if (log) {
    // Claim first: a duplicate claim fails on the unique key, so nobody is messaged twice.
    const { error: claimErr } = await db.from("wa_automation_log").insert({
      automation_id: a.id, source_id: item.sourceId, threshold: item.threshold, contact_id: r.contactId,
      yacht_id: item.yachtId, expiry_date: item.expiry, status: "failed", detail: "sending",
    });
    if (claimErr) return "skipped" as const;
  }
  const now = new Date().toISOString();
  try {
    const { data: ok } = await db.rpc("wa_can_message", { p_contact_id: r.contactId, p_category: "UTILITY" });
    if (ok) throw new Error(ok);
    const wamid = await sendTemplate(cfg, {
      toE164: r.phone, name: t.name, language: t.language, bodyValues: values,
      header: extras.header, urlButtons: extras.urlButtons.map((b: any) => ({ index: b.index, value: personalise(b.value, who) })),
    });
    const { data: msg } = await db.from("wa_messages").insert({
      contact_id: r.contactId, kind: "template", template_id: t.id, body: fillTemplate(t.body_text, values),
      phone_e164: r.phone, status: "sent", queued_at: now, sent_at: now, wa_message_id: wamid,
    }).select("id").single();
    if (log) {
      await db.from("wa_automation_log").update({ status: "sent", detail: null, message_id: msg?.id ?? null })
        .eq("automation_id", a.id).eq("source_id", item.sourceId).eq("threshold", item.threshold).eq("contact_id", r.contactId);
    }
    return "sent" as const;
  } catch (e) {
    const detail = (e instanceof Error ? e.message : String(e)).slice(0, 300);
    if (log) {
      await db.from("wa_automation_log").update({ status: "failed", detail })
        .eq("automation_id", a.id).eq("source_id", item.sourceId).eq("threshold", item.threshold).eq("contact_id", r.contactId);
    }
    return { failed: detail };
  }
}

/** The scheduled run. Returns a summary; a no-op unless every switch is on. */
export async function runExpiryReminders() {
  if (!automationsEnabled()) return { ran: false, reason: "WHATSAPP_AUTOMATIONS_ENABLED is off" };
  const cfg = waConfig();
  if (!cfg) return { ran: false, reason: "WhatsApp isn't connected" };
  if (!sendingEnabled()) return { ran: false, reason: "WHATSAPP_SENDING_ENABLED is off" };
  const db = admin();
  const { data: autos } = await db.from("wa_automations").select("*, template:wa_templates(*)").eq("enabled", true);
  const results: Record<string, unknown> = {};
  let budget = MAX_SENDS_PER_RUN;
  for (const a of (autos ?? []) as any[]) {
    const summary = { sent: 0, failed: 0, waiting_on_vessel: 0, no_recipients: 0, capped: 0, problem: null as string | null, at: new Date().toISOString() };
    const problem = configProblem(a, a.template);
    if (problem) {
      summary.problem = problem;
    } else {
      try {
        const extras = await templateExtras(db, cfg, a.template, { buttonValues: (a.options?.button_values ?? []).map(String) });
        for (const item of await planAutomation(db, a)) {
          if (!item.vesselOn) { summary.waiting_on_vessel++; continue; }
          if (!item.recipients.length) { summary.no_recipients++; continue; }
          for (const r of item.recipients.filter((x) => !x.alreadySent)) {
            if (budget <= 0) { summary.capped++; continue; }
            budget--;
            const res = await sendOne(db, cfg, a, a.template, extras, item, r, true);
            if (res === "sent") summary.sent++; else if (res !== "skipped") summary.failed++;
          }
        }
      } catch (e) {
        summary.problem = e instanceof Error ? e.message : String(e);
      }
    }
    await db.from("wa_automations").update({ last_run_at: new Date().toISOString(), last_run_summary: summary }).eq("id", a.id);
    results[a.kind] = summary;
  }
  return { ran: true, results };
}

// ─── HTTP ─────────────────────────────────────────────────────────────────────

/** What this reminder would send if it ran now — ignores the switches but reports them. */
export async function whatsappAutomationPreviewHandler(request: Request): Promise<Response> {
  const access = await requireAccess(request, { module: "communications", level: "view" });
  if (!access.ok) return access.response;
  const id = new URL(request.url).searchParams.get("id") ?? "";
  const db = admin();
  const { data: a } = await db.from("wa_automations").select("*, template:wa_templates(*)").eq("id", id).maybeSingle();
  if (!a) return json({ error: "Reminder not found" }, 404);
  try {
    const items = await planAutomation(db, a);
    const needed = a.template ? placeholderCount(a.template.body_text) : 0;
    return json({
      today: dubaiToday(),
      switches: {
        master: automationsEnabled(), sending: sendingEnabled(), reminder: !!a.enabled,
        problem: configProblem(a, a.template),
      },
      items: items.slice(0, 300).map((it) => ({
        ...it,
        // One example of the exact wording, for the first recipient (or a placeholder name).
        example: a.template ? fillTemplate(a.template.body_text,
          valuesFor(a.variable_map ?? [], needed, it.fields, { name: it.recipients[0]?.name ?? "Captain", vessel: it.vessel })) : null,
      })),
      total: items.length,
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
}

/**
 * Send one reminder to a chosen opted-in contact, now — to check the wording on
 * a real phone. Uses the first document due today (or example values). It isn't
 * logged as a reminder, so the real one still goes when the time comes.
 */
export async function whatsappAutomationTestHandler(request: Request): Promise<Response> {
  const access = await requireAccess(request, { module: "communications", level: "edit" });
  if (!access.ok) return access.response;
  const cfg = waConfig();
  if (!cfg) return json({ error: "WhatsApp isn't connected yet." }, 409);
  if (!sendingEnabled()) return json({ error: "Sending is switched off (WHATSAPP_SENDING_ENABLED)." }, 409);
  const { id, contactId } = (await request.json().catch(() => ({}))) as { id?: string; contactId?: string };
  const db = admin();
  const { data: a } = await db.from("wa_automations").select("*, template:wa_templates(*)").eq("id", id).maybeSingle();
  if (!a) return json({ error: "Reminder not found" }, 404);
  const problem = configProblem(a, a.template);
  if (problem) return json({ error: `Can't send yet: ${problem}.` }, 409);
  const { data: c } = await db.from("wa_contacts").select("id, name, phone_e164, yacht:yachts(vessel_name)").eq("id", contactId).maybeSingle();
  if (!c?.phone_e164) return json({ error: "That contact has no WhatsApp number." }, 400);

  const due = (await planAutomation(db, a))[0];
  const sample: Record<string, string> = Object.fromEntries(AUTOMATION_FIELDS[a.kind as AutomationKind].map((f) => [f.key, f.sample]));
  const vessel = c.yacht?.vessel_name ?? sample.vessel_name;
  const item: PlannedItem = due ?? {
    sourceId: "test", yachtId: "", expiry: "", daysLeft: 14, threshold: 14, label: "example",
    fields: { ...sample, vessel_name: vessel }, vessel, vesselOn: true, recipients: [],
  };
  try {
    const extras = await templateExtras(db, cfg, a.template, { buttonValues: (a.options?.button_values ?? []).map(String) });
    const res = await sendOne(db, cfg, a, a.template, extras, item,
      { contactId: c.id, name: c.name, phone: c.phone_e164, alreadySent: false }, false);
    if (res !== "sent") return json({ error: typeof res === "object" ? res.failed : "Not sent" }, 422);
    return json({ ok: true, used: due ? `the ${due.label} reminder due today` : "example values" });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, e instanceof MetaError ? 422 : 500);
  }
}

/** Starter wording for a reminder, saved as a draft Utility template ready to submit. */
export async function whatsappAutomationStarterHandler(request: Request): Promise<Response> {
  const access = await requireAccess(request, { module: "communications", level: "edit" });
  if (!access.ok) return access.response;
  const { id } = (await request.json().catch(() => ({}))) as { id?: string };
  const db = admin();
  const { data: a } = await db.from("wa_automations").select("id, kind, template_id").eq("id", id).maybeSingle();
  if (!a) return json({ error: "Reminder not found" }, 404);
  const s = STARTER_TEMPLATES[a.kind as AutomationKind];
  const samples = s.map.map((m) => ("field" in m ? AUTOMATION_FIELDS[a.kind as AutomationKind].find((f) => f.key === m.field)?.sample ?? "example" : m.text));
  let { data: t } = await db.from("wa_templates").select("id").eq("name", s.name).eq("language", "en").maybeSingle();
  if (!t) {
    const ins = await db.from("wa_templates").insert({
      name: s.name, language: "en", category: "UTILITY", header_format: "TEXT", body_text: s.body,
      footer_text: "Reply STOP to opt out", sample_values: samples, buttons: [], status: "draft",
    }).select("id").single();
    if (ins.error) return json({ error: ins.error.message }, 500);
    t = ins.data;
  }
  await db.from("wa_automations").update({ template_id: t!.id, variable_map: s.map, updated_by: access.claims.userId }).eq("id", a.id);
  return json({ ok: true, templateId: t!.id, name: s.name });
}

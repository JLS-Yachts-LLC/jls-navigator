/**
 * Polaris auto-replies, sent from the webhook as a client's message arrives:
 *
 *   - Invite buttons: tapping "I'll be there" on a template can get its own
 *     answer ("Thanks {{first_name}} — see you there!"). Matched by the exact
 *     message the tap answers, so it's always the right invite.
 *   - Away message: anything else the client writes, outside office hours
 *     (Dubai time), at most once per cooldown, and never after staff have
 *     replied in that time.
 *
 * Never for STOP / "Stop promotions" or any other opt-out, never for a message
 * replayed by Meta, and only when the rule is switched on (all are off by
 * default) and WhatsApp sending is on. Free text — allowed because the client's
 * own message has just opened the 24-hour window.
 */
import { waConfig, sendingEnabled, sendText } from "@/lib/whatsapp/cloud-api.server";
import { personalise, recipientOf } from "@/lib/whatsapp/shared";

export interface AwayOptions {
  /** ISO weekdays the office is open: 1 = Monday … 7 = Sunday. */
  days?: number[];
  start?: string; // "08:00"
  end?: string;   // "17:00"
  outside_hours_only?: boolean;
  cooldown_hours?: number;
}

const DOW: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
const toMinutes = (hhmm: string | undefined, fallback: number) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm ?? "");
  return m ? Number(m[1]) * 60 + Number(m[2]) : fallback;
};

/** Is the office open right now, in Dubai? */
export function officeOpen(o: AwayOptions, at = new Date()): boolean {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dubai", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(at).map((p) => [p.type, p.value]));
  const day = DOW[parts.weekday] ?? 0;
  const now = Number(parts.hour) * 60 + Number(parts.minute);
  const days = Array.isArray(o.days) && o.days.length ? o.days : [1, 2, 3, 4, 5];
  return days.includes(day) && now >= toMinutes(o.start, 8 * 60) && now < toMinutes(o.end, 17 * 60);
}

interface Inbound {
  contactId: string | null;
  fromPhone: string;
  type: string | null;
  text: string | null;
  contextWamid: string | null;
  /** Set when the message was an opt-out. */
  action: string | null;
  receivedAt: string;
}

export async function maybeAutoReply(db: any, inb: Inbound): Promise<void> {
  if (!inb.contactId || inb.action) return;
  // Meta retries and replays: only answer something that's just arrived.
  if (Date.now() - Date.parse(inb.receivedAt) > 10 * 60_000) return;
  const cfg = waConfig();
  if (!cfg || !sendingEnabled()) return;

  const isButton = inb.type === "button" || inb.type === "interactive";
  let reply: string | null = null;

  if (isButton) {
    if (!inb.contextWamid || !inb.text) return;
    const { data: orig } = await db.from("wa_messages").select("template_id").eq("wa_message_id", inb.contextWamid).maybeSingle();
    if (!orig?.template_id) return;
    const { data: rules } = await db.from("wa_auto_replies").select("button_text, reply_text")
      .eq("kind", "button").eq("template_id", orig.template_id).eq("enabled", true);
    const tapped = inb.text.trim().toLowerCase();
    const rule = ((rules ?? []) as any[]).find((r) => String(r.button_text).trim().toLowerCase() === tapped);
    if (!rule?.reply_text?.trim()) return;
    // Tapped twice in quick succession: answer once.
    const { count: recent } = await db.from("wa_messages").select("id", { count: "exact", head: true })
      .eq("contact_id", inb.contactId).eq("auto_reply", true).gte("queued_at", new Date(Date.now() - 2 * 60_000).toISOString());
    if (recent) return;
    reply = rule.reply_text;
  } else {
    const { data: away } = await db.from("wa_auto_replies").select("reply_text, options")
      .eq("kind", "away").eq("enabled", true).maybeSingle();
    if (!away?.reply_text?.trim()) return;
    const o = (away.options ?? {}) as AwayOptions;
    if (o.outside_hours_only !== false && officeOpen(o)) return;
    // Once per cooldown — and not if staff have replied in that time.
    const since = new Date(Date.now() - Math.max(1, Number(o.cooldown_hours ?? 12)) * 3_600_000).toISOString();
    const { count: answered } = await db.from("wa_messages").select("id", { count: "exact", head: true })
      .eq("contact_id", inb.contactId).eq("kind", "reply").gte("queued_at", since);
    if (answered) return;
    reply = away.reply_text;
  }

  const { data: c } = await db.from("wa_contacts").select("name, first_name, last_name, yacht:yachts(vessel_name)")
    .eq("id", inb.contactId).maybeSingle();
  const text = personalise(reply!, recipientOf(c ?? {})).slice(0, 4096);
  const now = new Date().toISOString();
  try {
    const wamid = await sendText(cfg, { toE164: inb.fromPhone, text });
    await db.from("wa_messages").insert({
      contact_id: inb.contactId, kind: "reply", auto_reply: true, body: text, phone_e164: inb.fromPhone,
      status: "sent", queued_at: now, sent_at: now, wa_message_id: wamid,
    });
  } catch (e) {
    const msg = (e instanceof Error ? e.message : String(e)).slice(0, 500);
    console.error("[wa-auto-reply] not sent:", msg);
    await db.from("wa_messages").insert({
      contact_id: inb.contactId, kind: "reply", auto_reply: true, body: text, phone_e164: inb.fromPhone,
      status: "failed", queued_at: now, failed_at: now, error_message: msg,
    }).then(() => {}, () => {});
  }
}

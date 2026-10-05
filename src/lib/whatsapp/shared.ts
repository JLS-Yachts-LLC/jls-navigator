/**
 * WhatsApp — the parts the browser and the server both need.
 *
 * Kept free of server imports so the opt-in page, the Communications screens and
 * the Worker all use the same wording, the same number rules and the same idea
 * of what "STOP" means.
 */

// ─── Opt-in wording ───────────────────────────────────────────────────────────
//
// Meta's policy: an opt-in must state that the person is agreeing to receive
// messages, and name the business they're agreeing to hear from. What the
// person was shown is stored with their consent, so the wording is versioned:
// change it and bump the version, and old consents still say what they agreed to.

export const OPTIN_WORDING_VERSION = "2026-10-05";

export const OPTIN_CATEGORY_TEXT = {
  updates: "Updates about your vessel — permits, documents, arrivals and the services we're handling for you.",
  marketing: "News and offers from JLS Yachts.",
} as const;

export const OPTIN_STOP_TEXT =
  "You can stop at any time by replying STOP, by tapping “Stop promotions” on a promotional message, or by telling us.";

/** The exact statement a person agrees to, stored verbatim with their consent. */
export function optinStatement(opts: { phone: string; updates: boolean; marketing: boolean }): string {
  const kinds = [
    opts.updates ? `• ${OPTIN_CATEGORY_TEXT.updates}` : null,
    opts.marketing ? `• ${OPTIN_CATEGORY_TEXT.marketing}` : null,
  ].filter(Boolean).join("\n");
  return [
    `I agree to receive WhatsApp messages from JLS Yachts at ${opts.phone} about:`,
    kinds,
    OPTIN_STOP_TEXT,
  ].join("\n");
}

// ─── Phone numbers ────────────────────────────────────────────────────────────

/**
 * Best-effort E.164 from a number as people actually type it — "+971 0561390990",
 * "+33(0)6 01174227", "00971 50 …". Returns null when it can't be sure.
 *
 * Needs the dial codes (country_dial_codes) to know where the country code ends,
 * which is what makes the trunk zero safe to drop: "+971 05…" is +97105…, which
 * no UAE mobile is. Italy is the exception — its leading 0 is part of the number.
 *
 * Imported numbers are only ever suggestions. The client confirms their own on
 * the opt-in page, and only that confirmed number is trusted.
 */
export function toE164(raw: string | null | undefined, dialCodes: string[]): string | null {
  if (!raw) return null;
  let s = String(raw).trim().replace(/\(0\)/g, "");
  s = s.replace(/[^\d+]/g, "");
  if (s.startsWith("00")) s = "+" + s.slice(2);
  if (!s.startsWith("+")) return null; // no country code: don't guess
  let digits = s.slice(1).replace(/\+/g, "");
  if (!digits || digits.startsWith("0")) return null;

  // Longest matching dial code wins (+1 vs +1242, +97 vs +971).
  const codes = dialCodes
    .map((c) => c.replace(/\D/g, ""))
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  const cc = codes.find((c) => digits.startsWith(c));
  if (cc && cc !== "39" && digits[cc.length] === "0") {
    digits = cc + digits.slice(cc.length + 1);
  }
  return /^[1-9]\d{6,14}$/.test(digits) ? `+${digits}` : null;
}

/** Display form: +971 50 123 4567 is beyond us without per-country rules; keep it simple. */
export const phoneLabel = (e164: string | null | undefined) => e164 ?? "—";

// ─── Opting out by message ────────────────────────────────────────────────────

/**
 * Inbound replies that mean "stop messaging me". Matched on the whole message,
 * not a substring: "can you stop by the boat at 3?" is not an opt-out.
 */
const STOP_ALL = new Set(["stop", "stop all", "unsubscribe", "opt out", "optout", "opt-out", "end", "quit"]);
const STOP_MARKETING = new Set(["stop promotions", "stop promotion"]);

export function stopIntent(text: string | null | undefined): "all" | "marketing" | null {
  const t = String(text ?? "").trim().toLowerCase().replace(/[.!]+$/, "").replace(/\s+/g, " ");
  if (STOP_MARKETING.has(t)) return "marketing";
  if (STOP_ALL.has(t)) return "all";
  return null;
}

// ─── Templates ────────────────────────────────────────────────────────────────

export type TemplateCategory = "MARKETING" | "UTILITY";

/** Highest {{n}} placeholder in a template body. */
export function placeholderCount(body: string): number {
  let max = 0;
  for (const m of body.matchAll(/\{\{\s*(\d+)\s*\}\}/g)) max = Math.max(max, Number(m[1]));
  return max;
}

/** Meta template names: lowercase letters, numbers, underscores. */
export function toTemplateName(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 512);
}

/** The quick-reply button every marketing template carries, so opting out never needs a block. */
export const MARKETING_OPT_OUT_BUTTON = "Stop promotions";

/** Fill {{1}}… for a preview or a send. "{{name}}" inside a value becomes the contact's name. */
export function fillTemplate(body: string, values: string[], contactName?: string): string {
  return body.replace(/\{\{\s*(\d+)\s*\}\}/g, (_, n) => {
    const v = values[Number(n) - 1] ?? `{{${n}}}`;
    return contactName ? v.replace(/\{\{\s*name\s*\}\}/gi, contactName) : v;
  });
}

export const CONSENT_LABEL: Record<string, string> = {
  none: "Not invited",
  invited: "Invited",
  opted_in: "Opted in",
  opted_out: "Opted out",
};

/**
 * WhatsApp's customer service window: free-text replies are allowed for 24 hours
 * after the client's last message. Outside it, only an approved template can be sent.
 */
export const SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;

export function windowRemaining(lastInboundAt: string | null | undefined, now = Date.now()): number {
  if (!lastInboundAt) return 0;
  return Math.max(0, Date.parse(lastInboundAt) + SERVICE_WINDOW_MS - now);
}

// ─── Template buttons ─────────────────────────────────────────────────────────

export type WaButton =
  | { type: "QUICK_REPLY"; text: string }
  | { type: "URL"; text: string; url: string; example?: string }
  | { type: "PHONE_NUMBER"; text: string; phone_number: string };

const OPT_OUT_RE = /stop|unsubscribe|opt.?out/i;

/** Does a template give the reader a way to opt out? Required for marketing. */
export function hasOptOut(t: { buttons?: WaButton[] | null; footer_text?: string | null }): boolean {
  return (t.buttons ?? []).some((b) => b.type === "QUICK_REPLY" && OPT_OUT_RE.test(b.text))
    || OPT_OUT_RE.test(t.footer_text ?? "");
}

/**
 * Meta wants quick replies grouped together, ahead of link and call buttons.
 * Marketing templates always carry the opt-out quick reply.
 */
export function normalizeButtons(buttons: WaButton[], category: TemplateCategory): WaButton[] {
  const quick = buttons.filter((b) => b.type === "QUICK_REPLY");
  const rest = buttons.filter((b) => b.type !== "QUICK_REPLY");
  if (category === "MARKETING" && !quick.some((b) => OPT_OUT_RE.test(b.text))) {
    quick.push({ type: "QUICK_REPLY", text: MARKETING_OPT_OUT_BUTTON });
  }
  return [...quick, ...rest];
}

/** What Meta would reject, in plain words — or null. */
export function buttonsError(buttons: WaButton[]): string | null {
  if (buttons.length > 10) return "At most 10 buttons.";
  if (buttons.filter((b) => b.type === "URL").length > 2) return "At most 2 website buttons.";
  if (buttons.filter((b) => b.type === "PHONE_NUMBER").length > 1) return "At most 1 call button.";
  for (const b of buttons) {
    if (!b.text.trim()) return "Every button needs a label.";
    if (b.text.length > 25) return `"${b.text}" is too long — button labels are limited to 25 characters.`;
    if (b.type === "URL") {
      if (!/^https:\/\/[^\s]+$/i.test(b.url)) return `"${b.text}": the link must start with https://`;
      const vars = b.url.match(/\{\{\s*\d+\s*\}\}/g) ?? [];
      if (vars.length > 1 || (vars.length === 1 && !/\{\{\s*1\s*\}\}$/.test(b.url))) {
        return `"${b.text}": a link can have one {{1}}, and only at the very end.`;
      }
      if (vars.length && !b.example?.trim()) return `"${b.text}": give an example for the {{1}} part of the link.`;
    }
    if (b.type === "PHONE_NUMBER" && !/^\+[1-9]\d{6,14}$/.test(b.phone_number.replace(/[\s-]/g, ""))) {
      return `"${b.text}": enter the phone number with its country code, e.g. +97143313555.`;
    }
  }
  return null;
}

/** Indexes of link buttons whose URL ends in {{1}} — each needs a value per send. */
export const dynamicUrlButtons = (buttons: WaButton[] | null | undefined) =>
  (buttons ?? []).flatMap((b, i) => (b.type === "URL" && /\{\{\s*1\s*\}\}$/.test(b.url) ? [i] : []));

export type HeaderFormat = "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT";

export const HEADER_MEDIA: Record<Exclude<HeaderFormat, "TEXT">, { accept: string; label: string; maxMb: number }> = {
  IMAGE: { accept: "image/jpeg,image/png", label: "Image (JPG or PNG, up to 5 MB)", maxMb: 5 },
  VIDEO: { accept: "video/mp4,video/3gpp", label: "Video (MP4, up to 16 MB)", maxMb: 16 },
  DOCUMENT: { accept: "application/pdf", label: "PDF document (up to 16 MB)", maxMb: 16 },
};

// ─── Personalisation ──────────────────────────────────────────────────────────

/** Fields staff can drop into a template's values; filled in per recipient at send. */
export const PERSONAL_TOKENS = [
  { token: "{{name}}", label: "Name", sample: "Captain Smith" },
  { token: "{{first_name}}", label: "First name", sample: "Captain" },
  { token: "{{vessel}}", label: "Yacht name", sample: "M/Y Serenity" },
] as const;

const TOKEN_RE = /\{\{\s*(name|first_name|vessel|yacht)\s*\}\}/gi;

/**
 * Fill personal fields into a value. Missing data falls back to something that
 * still reads naturally ("there", "your yacht") — Meta rejects empty parameters.
 */
export function personalise(value: string, who: { name?: string | null; vessel?: string | null }): string {
  const name = (who.name ?? "").trim();
  const vessel = (who.vessel ?? "").trim();
  return value.replace(TOKEN_RE, (_, k: string) => {
    switch (k.toLowerCase()) {
      case "name": return name || "there";
      case "first_name": return name.split(/\s+/)[0] || "there";
      default: return vessel || "your yacht";
    }
  });
}

export const SAMPLE_RECIPIENT = { name: "Captain Smith", vessel: "M/Y Serenity" };

/** The words around {{n}} in a template body — shows what each value box fills. */
export function placeholderContext(body: string, n: number, span = 28): string {
  const m = new RegExp(`\{\{\s*${n}\s*\}\}`).exec(body);
  if (!m) return `{{${n}}}`;
  const before = body.slice(Math.max(0, m.index - span), m.index).replace(/\s+/g, " ");
  const after = body.slice(m.index + m[0].length, m.index + m[0].length + span).replace(/\s+/g, " ");
  return `${m.index > span ? "…" : ""}${before}{{${n}}}${after}${m.index + m[0].length + span < body.length ? "…" : ""}`;
}

// ─── Expiry reminders (automations) ───────────────────────────────────────────

export type AutomationKind = "crew_visa" | "crew_passport" | "vessel_permit";

export interface AutomationField { key: string; label: string; sample: string }

const COMMON_FIELDS: AutomationField[] = [
  { key: "contact_name", label: "Recipient name", sample: "Captain Smith" },
  { key: "contact_first_name", label: "Recipient first name", sample: "Captain" },
  { key: "vessel_name", label: "Yacht name", sample: "M/Y Serenity" },
  { key: "expiry_date", label: "Expiry date", sample: "19 Oct 2026" },
  { key: "days_left", label: "Days left", sample: "14" },
];

/** What each reminder can put into its template's {{1}}, {{2}}… */
export const AUTOMATION_FIELDS: Record<AutomationKind, AutomationField[]> = {
  crew_visa: [{ key: "crew_name", label: "Crew member", sample: "John Doe" }, { key: "visa_type", label: "Visa type", sample: "employment visa" }, ...COMMON_FIELDS],
  crew_passport: [{ key: "crew_name", label: "Crew member", sample: "John Doe" }, ...COMMON_FIELDS],
  vessel_permit: [{ key: "permit_type", label: "Permit", sample: "gate pass" }, { key: "permit_number", label: "Permit number", sample: "GP-10234" }, ...COMMON_FIELDS],
};

export const PERMIT_LABEL: Record<string, string> = {
  cruising_mothership: "cruising permit", cruising_tenders: "tender cruising permit", sanitation: "sanitation certificate",
  dma: "DMA permit", gate_pass: "gate pass", tdra: "TDRA licence", navigation_license: "navigation licence",
  exit_entry: "exit & entry permit",
};
export const permitLabel = (t: string | null | undefined) =>
  (t && PERMIT_LABEL[t]) || (t ? t.replace(/_/g, " ") : "permit");

export type VariableSource = { field: string } | { text: string };

/** Starter wording for each reminder — saved as a draft template to submit to Meta. */
export const STARTER_TEMPLATES: Record<AutomationKind, { name: string; body: string; map: VariableSource[] }> = {
  crew_visa: {
    name: "crew_visa_expiry_reminder",
    body: "Hello {{1}}, this is a reminder from JLS Yachts that the UAE {{2}} for {{3}} on {{4}} expires on {{5}} ({{6}} days from today). Reply here and we'll arrange the renewal.",
    map: [{ field: "contact_name" }, { field: "visa_type" }, { field: "crew_name" }, { field: "vessel_name" }, { field: "expiry_date" }, { field: "days_left" }],
  },
  crew_passport: {
    name: "crew_passport_expiry_reminder",
    body: "Hello {{1}}, this is a reminder from JLS Yachts that the passport for {{2}} on {{3}} expires on {{4}}. A valid passport is needed for UAE visa renewals — reply here if you need any help.",
    map: [{ field: "contact_name" }, { field: "crew_name" }, { field: "vessel_name" }, { field: "expiry_date" }],
  },
  vessel_permit: {
    name: "vessel_permit_expiry_reminder",
    body: "Hello {{1}}, this is a reminder from JLS Yachts that the {{2}} for {{3}} expires on {{4}} ({{5}} days from today). Reply here and we'll arrange the renewal.",
    map: [{ field: "contact_name" }, { field: "permit_type" }, { field: "vessel_name" }, { field: "expiry_date" }, { field: "days_left" }],
  },
};

/**
 * Which reminder stage an expiry is in: the smallest threshold at or above the
 * days left. A missed day still sends (at most once per stage); an expiry
 * already past, or further out than every threshold, gets nothing.
 */
export function dueThreshold(daysLeft: number, thresholds: number[]): number | null {
  if (daysLeft < 0) return null;
  const at = [...thresholds].sort((a, b) => a - b).find((t) => daysLeft <= t);
  return at ?? null;
}

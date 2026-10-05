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

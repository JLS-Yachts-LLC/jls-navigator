/**
 * WhatsApp Business Platform (Cloud API) — the calls Polaris makes to Meta.
 *
 * Configuration is Worker secrets only, set in Cloudflare by whoever owns the
 * Meta account — never the database, never the browser:
 *
 *   WHATSAPP_ACCESS_TOKEN      permanent System User token (whatsapp_business_messaging
 *                              + whatsapp_business_management)
 *   WHATSAPP_PHONE_NUMBER_ID   the sending number's ID, from WhatsApp Manager / API Setup
 *   WHATSAPP_WABA_ID           the WhatsApp Business Account ID (templates live here)
 *   WHATSAPP_APP_SECRET        the Meta app's secret — verifies webhook signatures
 *   WHATSAPP_VERIFY_TOKEN      any string you choose; entered again in the Meta app's
 *                              webhook settings so Meta can prove the endpoint is ours
 *   WHATSAPP_SENDING_ENABLED   "true" to actually send. Off by default, like EMAIL_ENABLED:
 *                              everything else works, and a send says plainly why it didn't.
 *   WHATSAPP_GRAPH_VERSION     optional, default v23.0
 */

const env = (k: string) => ((process.env[k] as string | undefined) ?? "").trim();

export interface WaConfig {
  token: string;
  phoneNumberId: string;
  wabaId: string;
  version: string;
}

export function waConfig(): WaConfig | null {
  const token = env("WHATSAPP_ACCESS_TOKEN");
  const phoneNumberId = env("WHATSAPP_PHONE_NUMBER_ID");
  const wabaId = env("WHATSAPP_WABA_ID");
  if (!token || !phoneNumberId || !wabaId) return null;
  return { token, phoneNumberId, wabaId, version: env("WHATSAPP_GRAPH_VERSION") || "v23.0" };
}

export const sendingEnabled = () => /^(true|1|yes)$/i.test(env("WHATSAPP_SENDING_ENABLED"));

/** Which settings are present — names only, never values. */
export function configPresence() {
  return {
    access_token: !!env("WHATSAPP_ACCESS_TOKEN"),
    phone_number_id: !!env("WHATSAPP_PHONE_NUMBER_ID"),
    waba_id: !!env("WHATSAPP_WABA_ID"),
    app_secret: !!env("WHATSAPP_APP_SECRET"),
    verify_token: !!env("WHATSAPP_VERIFY_TOKEN"),
    sending_enabled: sendingEnabled(),
  };
}

export class MetaError extends Error {
  constructor(message: string, public code?: string | number, public status?: number) {
    super(message);
  }
}

async function graph(cfg: WaConfig, path: string, init: RequestInit = {}): Promise<any> {
  const res = await fetch(`https://graph.facebook.com/${cfg.version}/${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${cfg.token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(20_000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body?.error) {
    const e = body?.error ?? {};
    // Meta's user-facing text is the useful part; the code goes alongside.
    throw new MetaError(e.error_user_msg || e.message || `Meta returned ${res.status}`, e.code, res.status);
  }
  return body;
}

/** The connected number, as Meta knows it. */
export async function phoneInfo(cfg: WaConfig) {
  return graph(cfg, `${cfg.phoneNumberId}?fields=display_phone_number,verified_name,quality_rating,messaging_limit_tier`);
}

export interface TemplateDef {
  name: string;
  language: string;
  category: "MARKETING" | "UTILITY";
  header_text?: string | null;
  body_text: string;
  footer_text?: string | null;
  sample_values: string[];
  buttons: string[]; // quick replies
}

/** Submit a template for Meta's review. Returns Meta's id and initial status. */
export async function createTemplate(cfg: WaConfig, t: TemplateDef): Promise<{ id: string; status: string }> {
  const components: any[] = [];
  if (t.header_text) components.push({ type: "HEADER", format: "TEXT", text: t.header_text });
  components.push({
    type: "BODY",
    text: t.body_text,
    ...(t.sample_values.length ? { example: { body_text: [t.sample_values] } } : {}),
  });
  if (t.footer_text) components.push({ type: "FOOTER", text: t.footer_text });
  if (t.buttons.length) {
    components.push({ type: "BUTTONS", buttons: t.buttons.map((text) => ({ type: "QUICK_REPLY", text })) });
  }
  const out = await graph(cfg, `${cfg.wabaId}/message_templates`, {
    method: "POST",
    body: JSON.stringify({ name: t.name, language: t.language, category: t.category, components }),
  });
  return { id: String(out.id), status: String(out.status ?? "PENDING") };
}

/** Every template on the account, with Meta's current verdict. */
export async function listTemplates(cfg: WaConfig): Promise<Array<{
  id: string; name: string; language: string; status: string; category: string; rejected_reason?: string;
}>> {
  const out: any[] = [];
  let path = `${cfg.wabaId}/message_templates?fields=id,name,language,status,category,rejected_reason&limit=200`;
  for (let page = 0; page < 10 && path; page++) {
    const r = await graph(cfg, path);
    out.push(...(r.data ?? []));
    const next: string | undefined = r.paging?.next;
    path = next ? next.replace(/^https:\/\/graph\.facebook\.com\/v[\d.]+\//, "") : "";
  }
  return out;
}

/** Send one approved template to one number. Returns Meta's message id. */
export async function sendTemplate(cfg: WaConfig, opts: {
  toE164: string; name: string; language: string; bodyValues: string[];
}): Promise<string> {
  const components = opts.bodyValues.length
    ? [{ type: "body", parameters: opts.bodyValues.map((text) => ({ type: "text", text })) }]
    : [];
  const out = await graph(cfg, `${cfg.phoneNumberId}/messages`, {
    method: "POST",
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: opts.toE164.replace(/^\+/, ""),
      type: "template",
      template: { name: opts.name, language: { code: opts.language }, ...(components.length ? { components } : {}) },
    }),
  });
  const id = out?.messages?.[0]?.id;
  if (!id) throw new MetaError("Meta accepted the request but returned no message id");
  return String(id);
}

/**
 * Prove a webhook came from Meta: X-Hub-Signature-256 is an HMAC-SHA256 of the
 * raw body with the app secret. Compared in constant time.
 */
export async function verifySignature(rawBody: string, header: string | null): Promise<boolean> {
  const secret = env("WHATSAPP_APP_SECRET");
  if (!secret || !header?.startsWith("sha256=")) return false;
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const expected = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  const given = header.slice(7).toLowerCase();
  if (given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

export const verifyToken = () => env("WHATSAPP_VERIFY_TOKEN");

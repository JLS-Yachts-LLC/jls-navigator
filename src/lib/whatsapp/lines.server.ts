/**
 * WhatsApp "lines" — the numbers Polaris speaks for.
 *
 * A number can also be linked in WhatsApp Manager (Meta's own route, no Embedded
 * Signup) under a WhatsApp Business Account the Worker's System User token can
 * reach — token_source 'env' on a non-default line: same token, its own number.
 *
 * The office number is the default line: its credentials are the Worker secrets
 * (waConfig()), and every message row defaults to it, so code that predates
 * lines keeps working. Other numbers — the Training number, onboarded by
 * Embedded Signup with Coexistence — have their own phone number id, WABA and a
 * token in wa_line_tokens (server only).
 *
 * The webhook routes each change by value.metadata.phone_number_id; replies and
 * media go out through the line the conversation belongs to. A message for a
 * number we don't recognise is never treated as the office number's.
 */
import { waConfig, type WaConfig } from "@/lib/whatsapp/cloud-api.server";

export interface WaLine {
  id: string;
  label: string;
  phone_number_id: string | null;
  waba_id: string | null;
  display_phone: string | null;
  verified_name: string | null;
  is_default: boolean;
  token_source: "env" | "stored";
  coexistence: boolean;
  status: "pending" | "connected" | "disconnected";
  auto_replies_enabled: boolean;
  human_pause_hours: number;
  onboarded_at: string | null;
  contacts_sync_requested_at: string | null;
  history_sync_requested_at: string | null;
}

const env = (k: string) => ((process.env[k] as string | undefined) ?? "").trim();

export async function loadLines(db: any): Promise<WaLine[]> {
  const { data } = await db.from("wa_lines").select("*").order("is_default", { ascending: false }).order("created_at");
  return (data ?? []) as WaLine[];
}

export async function defaultLine(db: any): Promise<WaLine | null> {
  const { data } = await db.from("wa_lines").select("*").eq("is_default", true).maybeSingle();
  return (data as WaLine) ?? null;
}

export async function lineById(db: any, id: string | null | undefined): Promise<WaLine | null> {
  if (!id) return defaultLine(db);
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await db.from("wa_lines").select("*").eq("id", id).maybeSingle();
  return (data as WaLine) ?? null;
}

/**
 * The line a webhook change is about. The office line is matched by the Worker's
 * WHATSAPP_PHONE_NUMBER_ID (and remembers it, so it shows in the Setup list).
 * A change with no metadata at all is the office line, as before lines existed.
 * Anything else unrecognised returns null — the caller must drop it.
 */
export async function lineForPhoneNumberId(db: any, pid: string | null | undefined, lines?: WaLine[]): Promise<WaLine | null> {
  const all = lines ?? await loadLines(db);
  const office = all.find((l) => l.is_default) ?? null;
  if (!pid) return office;
  const hit = all.find((l) => l.phone_number_id === pid);
  if (hit) return hit;
  if (office && pid === env("WHATSAPP_PHONE_NUMBER_ID")) {
    if (!office.phone_number_id) {
      await db.from("wa_lines").update({ phone_number_id: pid }).eq("id", office.id).then(() => {}, () => {});
      office.phone_number_id = pid;
    }
    return office;
  }
  return null;
}

/** The line a WABA-level change (account_update) is about. */
export function lineForWaba(lines: WaLine[], wabaId: string | null | undefined): WaLine | null {
  if (!wabaId) return null;
  return lines.find((l) => l.waba_id === wabaId) ?? null;
}

/** Credentials for sending as this line. Null when it can't send (no token / disconnected). */
export async function configForLine(db: any, line: WaLine | null): Promise<WaConfig | null> {
  if (!line) return null;
  if (line.is_default) return waConfig();
  if (line.status === "disconnected" || !line.phone_number_id || !line.waba_id) return null;
  // A number linked in WhatsApp Manager (Meta's own route) under an account the
  // Worker's System User token can reach: same token, this line's number.
  if (line.token_source === "env") {
    const base = waConfig();
    return base ? { ...base, phoneNumberId: line.phone_number_id, wabaId: line.waba_id } : null;
  }
  const { data } = await db.from("wa_line_tokens").select("access_token").eq("line_id", line.id).maybeSingle();
  if (!data?.access_token) return null;
  const base = waConfig();
  return {
    token: String(data.access_token),
    phoneNumberId: line.phone_number_id,
    wabaId: line.waba_id,
    version: base?.version ?? (env("WHATSAPP_GRAPH_VERSION") || "v23.0"),
  };
}

/** A line by id (null/absent = the office) and its credentials, or why it can't send. */
export async function resolveLine(db: any, lineId: string | null | undefined):
  Promise<{ line: WaLine; cfg: WaConfig } | { error: string; status: number }> {
  const line = await lineById(db, lineId);
  if (!line) return { error: "That WhatsApp number isn't set up in Polaris.", status: 404 };
  if (line.status === "disconnected") return { error: `${line.label} is disconnected — reconnect it on the Setup tab.`, status: 409 };
  const cfg = await configForLine(db, line);
  if (!cfg) return { error: line.is_default ? "WhatsApp isn't connected yet — see the Setup tab." : `${line.label} has no working connection — see the Setup tab.`, status: 409 };
  return { line, cfg };
}

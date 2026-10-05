/**
 * Overview — is WhatsApp connected, is the number healthy, and what is set up.
 * Shows which Worker secrets are present by name only; values never leave the server.
 */
import { useEffect, useState } from "react";
import { Copy, CheckCircle2, XCircle, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { db, waApi, Chip } from "./wa-common";

interface Status {
  connected: boolean;
  presence: Record<string, boolean>;
  number: {
    display_phone_number?: string; verified_name?: string; quality_rating?: string; messaging_limit_tier?: string;
    name_status?: string; new_name_status?: string;
  } | null;
  error: string | null;
  account: { name: string | null; apps: Array<{ id: string; name: string }> } | null;
  account_error: string | null;
  webhook_url: string;
}

const SECRETS: Array<[string, string, string]> = [
  ["access_token", "WHATSAPP_ACCESS_TOKEN", "Permanent System User token from Meta Business Settings"],
  ["phone_number_id", "WHATSAPP_PHONE_NUMBER_ID", "WhatsApp Manager → your number → Phone number ID"],
  ["waba_id", "WHATSAPP_WABA_ID", "WhatsApp Manager → Account → WhatsApp Business Account ID"],
  ["app_secret", "WHATSAPP_APP_SECRET", "Meta app → App settings → Basic → App secret (verifies webhooks)"],
  ["verify_token", "WHATSAPP_VERIFY_TOKEN", "Any phrase you choose — enter the same in the Meta app's webhook settings"],
  ["sending_enabled", "WHATSAPP_SENDING_ENABLED", "Set to true when you're ready to send for real"],
  ["automations_enabled", "WHATSAPP_AUTOMATIONS_ENABLED", "In wrangler.jsonc — \"true\" allows the daily expiry reminders (off by default)"],
];

export function WaOverview() {
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [counts, setCounts] = useState<Record<string, number>>({});

  async function load() {
    setLoading(true);
    try {
      setStatus(await waApi<Status>("status"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load status");
    }
    const [{ data: contacts }, { count: lists }, { data: templates }] = await Promise.all([
      db().from("wa_contacts").select("consent_status"),
      db().from("wa_lists").select("id", { count: "exact", head: true }).eq("archived", false),
      db().from("wa_templates").select("status"),
    ]);
    const c: Record<string, number> = { contacts: 0, opted_in: 0, invited: 0, opted_out: 0, lists: lists ?? 0, approved: 0 };
    for (const r of (contacts ?? []) as any[]) { c.contacts++; c[r.consent_status] = (c[r.consent_status] ?? 0) + 1; }
    for (const r of (templates ?? []) as any[]) if (r.status === "approved") c.approved++;
    setCounts(c);
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  const [subscribing, setSubscribing] = useState(false);
  async function subscribe() {
    setSubscribing(true);
    try {
      await waApi("subscribe", {});
      toast.success("Webhooks linked", { description: "Meta now delivers this number's messages and receipts to Polaris." });
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't link webhooks");
    } finally {
      setSubscribing(false);
    }
  }

  if (loading && !status) {
    return <div className="grid place-items-center py-20 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  }

  const p = status?.presence ?? {};
  const quality = status?.number?.quality_rating;

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Contacts" value={counts.contacts} />
        <Stat label="Opted in" value={counts.opted_in} tone="green" sub={`${counts.invited ?? 0} invited · ${counts.opted_out ?? 0} opted out`} />
        <Stat label="Lists" value={counts.lists} />
        <Stat label="Approved templates" value={counts.approved} />
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold">WhatsApp Business connection</h2>
            {status?.connected && status.number ? (
              <>
              <p className="mt-1 text-sm text-muted-foreground">
                Sending as <strong className="text-foreground">{status.number.verified_name}</strong>{" "}
                ({status.number.display_phone_number})
                {quality && <> · quality <Chip t={quality === "GREEN" ? "green" : quality === "YELLOW" ? "amber" : "red"}>{quality.toLowerCase()}</Chip></>}
                {status.number.messaging_limit_tier && <> · limit {status.number.messaging_limit_tier.replace("TIER_", "").toLowerCase()} / day</>}
              </p>
              <NameStatus current={status.number.name_status} pending={status.number.new_name_status} />
              </>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">
                {status?.error ? `Meta refused the connection: ${status.error}` : "Not connected yet. Everything else can be set up meanwhile."}
              </p>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={() => void load()} className="gap-1.5">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>

        {status?.connected && (
          <div className="mt-4 rounded-lg border border-border p-3 text-sm">
            {status.account ? (
              <>
                <p>
                  WhatsApp account: <strong>{status.account.name ?? "—"}</strong>
                </p>
                {status.account.apps.length > 0 ? (
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                    Messages and receipts are delivered to: {status.account.apps.map((a) => a.name || a.id).join(", ")}
                  </p>
                ) : (
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-amber-600">
                    <XCircle className="h-3.5 w-3.5" />
                    No app receives this account's messages yet — replies won't reach Polaris.
                  </p>
                )}
                <Button size="sm" variant="outline" className="mt-2 h-7 text-xs" disabled={subscribing} onClick={() => void subscribe()}>
                  {subscribing && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
                  {status.account.apps.length ? "Re-link webhooks" : "Link webhooks to Polaris"}
                </Button>
              </>
            ) : (
              <p className="text-xs text-red-500">
                Couldn't read the WhatsApp account{status.account_error ? `: ${status.account_error}` : ""}. Check WHATSAPP_WABA_ID and that the token has access to that account.
              </p>
            )}
          </div>
        )}

        <div className="mt-4 grid gap-1.5">
          {SECRETS.map(([key, name, hint]) => (
            <div key={key} className="flex items-start gap-2 text-sm">
              {p[key] ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/50" />}
              <span>
                <code className="text-xs">{name}</code>
                <span className="ml-2 text-xs text-muted-foreground">{hint}</span>
              </span>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          These are Worker secrets, set in Cloudflare — Polaris never stores or shows their values.
        </p>

        {status?.webhook_url && (
          <div className="mt-4 rounded-lg border border-border bg-muted/30 p-3 text-sm">
            <p className="text-xs text-muted-foreground">
              Webhook URL — paste into your Meta app (WhatsApp → Configuration), with the same verify token, and
              subscribe to <code>messages</code>, <code>message_template_status_update</code> and <code>user_preferences</code>:
            </p>
            <div className="mt-1.5 flex items-center gap-2">
              <code className="truncate text-xs">{status.webhook_url}</code>
              <Button size="sm" variant="ghost" className="h-7 gap-1"
                onClick={() => { void navigator.clipboard.writeText(status.webhook_url); toast.success("Copied"); }}>
                <Copy className="h-3.5 w-3.5" /> Copy
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card p-5 text-sm">
        <h2 className="font-semibold">How this stays within WhatsApp's rules</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
          <li><strong className="text-foreground">Nobody is messaged without opt-in.</strong> Clients agree through the emailed link, or staff record a consent given by phone or in person — with a note saying how.</li>
          <li><strong className="text-foreground">Updates and offers are agreed separately</strong>, and a send only reaches people who agreed to that kind of message.</li>
          <li><strong className="text-foreground">Opt-outs are automatic.</strong> A STOP reply, the "Stop promotions" button on every marketing message, or Meta's own control — all recorded and honoured immediately, even mid-send.</li>
          <li><strong className="text-foreground">Every consent change is kept</strong> with when, how, and the exact wording the person saw.</li>
          <li><strong className="text-foreground">Messages you start use Meta-approved templates</strong> only.</li>
        </ul>
      </div>
    </div>
  );
}

/** Meta's review of the business display name — clients see the name in chats once it's approved. */
const NAME_STATUS: Record<string, { label: string; t: "green" | "amber" | "red" | "grey" }> = {
  APPROVED: { label: "approved", t: "green" },
  AVAILABLE_WITHOUT_REVIEW: { label: "approved", t: "green" },
  PENDING_REVIEW: { label: "in review", t: "amber" },
  DECLINED: { label: "declined", t: "red" },
  EXPIRED: { label: "expired", t: "red" },
  NONE: { label: "not submitted", t: "grey" },
};

function NameStatus({ current, pending }: { current?: string; pending?: string }) {
  if (!current && !pending) return null;
  const now = current ? NAME_STATUS[current] ?? { label: current.toLowerCase().replace(/_/g, " "), t: "grey" as const } : null;
  const next = pending && pending !== "NONE"
    ? NAME_STATUS[pending] ?? { label: pending.toLowerCase().replace(/_/g, " "), t: "grey" as const } : null;
  return (
    <p className="mt-1 text-xs text-muted-foreground">
      Display name {now && <Chip t={now.t}>{now.label}</Chip>}
      {next && <> · requested change <Chip t={next.t}>{next.label}</Chip></>}
      {now?.t !== "green" && " — until it's approved, clients who haven't saved the number see “Unknown user” in chats."}
    </p>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value?: number; sub?: string; tone?: "green" }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${tone === "green" ? "text-emerald-500" : ""}`}>{value ?? 0}</p>
      {sub && <p className="mt-0.5 text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

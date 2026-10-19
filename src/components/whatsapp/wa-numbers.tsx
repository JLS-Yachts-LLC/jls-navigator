/**
 * WhatsApp → Setup → Numbers.
 *
 * Every WhatsApp number Polaris speaks for, and for each one:
 *   · who can use it — "Read" (see its conversations as they arrive) or
 *     "Read & send" (also reply, send templates, assign and close chats);
 *   · whether Polaris may auto-reply from it, and how long bots stay quiet after
 *     a person replies (in Polaris or on the phone);
 *   · for a number connected by Embedded Signup: the contacts and chat-history
 *     imports Meta allows once, within 24 hours of connecting.
 *
 * "Connect a WhatsApp Business app number" runs Meta's Embedded Signup with
 * Coexistence: the number keeps working in the WhatsApp Business app on the
 * phone, and Polaris sends and receives as it too. Global admins only.
 *
 * The office number also counts everyone with the Communications permission
 * (view → read, edit → read & send), as before; every other number is members-only.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, Plus, Phone, Trash2, UserPlus, Users, RefreshCw, AlertCircle, CheckCircle2, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAccess } from "@/lib/auth/useAccess";
import { cn } from "@/lib/utils";
import { db, waApi, Chip, fmtDate, lineName, type WaLine } from "./wa-common";

type Member = { line_id: string; user_id: string; level: "view" | "send" };
type Person = { id: string; display_name: string | null };

const SYNC_WINDOW_MS = 24 * 3_600_000;

export function WaNumbers({ onChanged }: { onChanged?: () => void }) {
  const { isGlobalAdmin, canAccessModule } = useAccess();
  const canManage = canAccessModule("communications", "admin");
  const [lines, setLines] = useState<WaLine[] | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [connecting, setConnecting] = useState(false);

  const load = useCallback(async () => {
    const [{ data: ls }, { data: ms }, { data: ps }] = await Promise.all([
      db().from("wa_lines").select("*").order("is_default", { ascending: false }).order("created_at"),
      db().from("wa_line_members").select("line_id, user_id, level"),
      db().from("profiles").select("id, display_name").order("display_name"),
    ]);
    setLines((ls ?? []) as WaLine[]);
    setMembers((ms ?? []) as Member[]);
    setPeople((ps ?? []) as Person[]);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const changed = async () => { await load(); onChanged?.(); };

  if (lines === null) return <div className="grid place-items-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Phone className="h-4 w-4 text-primary" />
        <h3 className="font-semibold">Numbers</h3>
        <p className="flex-1 text-xs text-muted-foreground">Each WhatsApp number, and who can read or send from it.</p>
        {isGlobalAdmin && (
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setConnecting(true)}>
            <Plus className="h-4 w-4" /> Connect a WhatsApp Business app number
          </Button>
        )}
      </div>
      {lines.map((l) => (
        <LineCard key={l.id} line={l} members={members.filter((m) => m.line_id === l.id)} people={people}
          canManage={canManage} isGlobalAdmin={isGlobalAdmin} onChanged={changed} />
      ))}
      {connecting && <ConnectDialog onClose={() => setConnecting(false)} onConnected={() => { setConnecting(false); void changed(); }} />}
    </section>
  );
}

function LineCard({ line, members, people, canManage, isGlobalAdmin, onChanged }: {
  line: WaLine; members: Member[]; people: Person[]; canManage: boolean; isGlobalAdmin: boolean; onChanged: () => Promise<void>;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [adding, setAdding] = useState("");
  const [addLevel, setAddLevel] = useState<"view" | "send">("send");
  const [label, setLabel] = useState(line.label);
  const personName = (id: string) => people.find((p) => p.id === id)?.display_name ?? "Staff member";

  async function call(key: string, path: string, body: unknown, ok?: string) {
    setBusy(key);
    try { await waApi(path, body); if (ok) toast.success(ok); await onChanged(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "That didn't work"); }
    finally { setBusy(null); }
  }
  const setMember = (userId: string, level: "view" | "send" | null) =>
    call(`m:${userId}`, "lines/members", { lineId: line.id, userId, level },
      level ? `${personName(userId)} can ${level === "send" ? "read and send" : "read"} on ${line.label}` : `${personName(userId)} removed from ${line.label}`);

  const inWindow = !!line.onboarded_at && Date.now() - Date.parse(line.onboarded_at) < SYNC_WINDOW_MS;
  const candidates = people.filter((p) => !members.some((m) => m.user_id === p.id));

  return (
    <div className="rounded-lg border border-border/70 p-3">
      <div className="flex flex-wrap items-center gap-2">
        {canManage ? (
          <Input value={label} onChange={(e) => setLabel(e.target.value)} className="h-8 w-56 font-medium"
            onBlur={() => { if (label.trim() && label.trim() !== line.label) void call("label", "lines/update", { lineId: line.id, label }, "Renamed"); }} />
        ) : <span className="font-medium">{line.label}</span>}
        <span className="text-sm text-muted-foreground">{line.display_phone ?? "number not reported yet"}</span>
        {line.is_default && <Chip t="grey">Office · broadcasts &amp; automations</Chip>}
        {line.status === "connected" ? <Chip t="green">Connected</Chip>
          : line.status === "disconnected" ? <Chip t="red" title={line.disconnect_reason ?? undefined}>Disconnected</Chip>
          : <Chip t="amber">Pending</Chip>}
        {line.coexistence && <Chip t="grey" title="Also in use in the WhatsApp Business app on the phone">Business app + Polaris</Chip>}
      </div>

      {line.status === "pending" && (
        <div className="mt-2 space-y-1.5 text-xs">
          <p className="text-amber-500">
            Not connected yet — people can be added now; connecting this number takes this entry over, keeping its name and people.
          </p>
          <p className="text-muted-foreground">
            Added and verified it in WhatsApp Manager? Add it here — Polaris finds it, registers it if needed, and connects it.
            (For a number still in the WhatsApp Business app, do this straight away: its contacts and chat-history imports
            must be requested within 24 hours of linking.)
          </p>
          {isGlobalAdmin && (
            <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" disabled={!!busy}
              onClick={async () => {
                setBusy("adopt");
                try {
                  const r = await waApi<{ coexistence?: boolean; registered?: boolean; contacts?: { ok: boolean; error?: string }; history?: { ok: boolean; error?: string } }>("lines/adopt", { lineId: line.id });
                  toast.success(`${line.label} connected`, {
                    description: r.coexistence
                      ? `Contacts import ${r.contacts?.ok ? "requested" : `not requested — ${r.contacts?.error}`}; history import ${r.history?.ok ? "requested" : `not requested — ${r.history?.error}`}`
                      : `Now on WhatsApp through Polaris${r.registered ? " (registered with Meta)" : ""}. Message it from a phone to test.`,
                    duration: 12000,
                  });
                  await onChanged();
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Couldn't find the number", { duration: 15000 });
                } finally { setBusy(null); }
              }}>
              {busy === "adopt" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Add from WhatsApp Manager
            </Button>
          )}
        </div>
      )}

      {line.status === "disconnected" && (
        <p className="mt-2 flex items-start gap-1.5 text-xs text-red-500">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Disconnected {fmtDate(line.disconnected_at)}{line.disconnect_reason ? ` — ${line.disconnect_reason}` : ""}.
          A Coexistence number drops off if the WhatsApp Business app on the phone isn't opened for about 14 days. Connect it again to restore it.
        </p>
      )}

      {/* The one-time imports after connecting — only a number still in the WhatsApp Business app has any */}
      {!line.is_default && line.onboarded_at && line.coexistence && (
        <div className="mt-2 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
          <p>
            Contacts: {line.contacts_sync_requested_at ? <span className="text-foreground">requested {fmtDate(line.contacts_sync_requested_at)}</span>
              : line.contacts_sync_error ? <span className="text-red-500">failed — {line.contacts_sync_error}</span> : "not requested"}
            {!line.contacts_sync_requested_at && isGlobalAdmin && inWindow && (
              <Button size="sm" variant="link" className="h-auto px-1 text-xs" disabled={!!busy}
                onClick={() => void call("sc", "onboard/sync", { lineId: line.id, kind: "contacts" }, "Contacts import requested")}>Try again</Button>
            )}
          </p>
          <p>
            Chat history: {line.history_declined ? "not shared from the phone"
              : line.history_sync_requested_at ? <span className="text-foreground">{line.history_progress != null ? `${line.history_progress}% imported` : "requested — arriving"}</span>
              : line.history_sync_error ? <span className="text-red-500">failed — {line.history_sync_error}</span> : "not requested"}
            {!line.history_sync_requested_at && !line.history_declined && isGlobalAdmin && inWindow && (
              <Button size="sm" variant="link" className="h-auto px-1 text-xs" disabled={!!busy}
                onClick={() => void call("sh", "onboard/sync", { lineId: line.id, kind: "history" }, "History import requested")}>Try again</Button>
            )}
          </p>
          {inWindow && (!line.contacts_sync_requested_at || !line.history_sync_requested_at) && (
            <p className="text-amber-500 sm:col-span-2">
              Meta allows these imports only until {new Date(Date.parse(line.onboarded_at) + SYNC_WINDOW_MS).toLocaleString()}.
            </p>
          )}
        </div>
      )}

      {/* Automatic replies */}
      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
        <label className="inline-flex items-center gap-1.5">
          <input type="checkbox" checked={line.auto_replies_enabled} disabled={!canManage || !!busy}
            onChange={(e) => void call("ar", "lines/update", { lineId: line.id, autoReplies: e.target.checked },
              e.target.checked ? "Auto-replies allowed on this number" : "Auto-replies off for this number")} />
          Polaris auto-replies from this number
        </label>
        <label className="inline-flex items-center gap-1.5 text-muted-foreground">
          Quiet for
          <select value={line.human_pause_hours} disabled={!canManage || !!busy}
            onChange={(e) => void call("ph", "lines/update", { lineId: line.id, pauseHours: Number(e.target.value) })}
            className="h-7 rounded-md border border-border bg-background px-1.5 text-foreground">
            {[0, 1, 2, 4, 8, 12, 24, 48].map((h) => <option key={h} value={h}>{h} h</option>)}
          </select>
          after a person replies (in Polaris or on the phone)
        </label>
      </div>

      {/* Who can use it */}
      <div className="mt-3 border-t border-border/60 pt-3">
        <p className="mb-2 flex items-center gap-1.5 text-xs font-medium"><Users className="h-3.5 w-3.5" /> Who can use this number</p>
        <p className="mb-2 text-[11px] text-muted-foreground">
          Global admins can always use every number.
          {line.is_default && " Everyone with the Communications permission can too (view → read, edit → read & send)."}
          {!line.is_default && " Nobody else sees its conversations unless listed here."}
        </p>
        {members.length === 0 ? <p className="text-xs text-muted-foreground">No one added yet.</p> : (
          <ul className="divide-y divide-border/50 rounded-md border border-border/60">
            {members.map((m) => (
              <li key={m.user_id} className="flex items-center gap-2 px-2.5 py-1.5 text-sm">
                <span className="flex-1 truncate">{personName(m.user_id)}</span>
                <select value={m.level} disabled={!canManage || busy === `m:${m.user_id}`}
                  onChange={(e) => void setMember(m.user_id, e.target.value as "view" | "send")}
                  className="h-7 rounded-md border border-border bg-background px-1.5 text-xs">
                  <option value="view">Read</option>
                  <option value="send">Read &amp; send</option>
                </select>
                {canManage && (
                  <button title="Remove" disabled={busy === `m:${m.user_id}`} onClick={() => void setMember(m.user_id, null)}
                    className="rounded p-1 text-muted-foreground hover:text-red-500">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {canManage && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <select value={adding} onChange={(e) => setAdding(e.target.value)}
              className="h-8 min-w-[220px] rounded-md border border-border bg-background px-2 text-sm">
              <option value="">Add a person…</option>
              {candidates.map((p) => <option key={p.id} value={p.id}>{p.display_name ?? "—"}</option>)}
            </select>
            <select value={addLevel} onChange={(e) => setAddLevel(e.target.value as "view" | "send")}
              className="h-8 rounded-md border border-border bg-background px-2 text-sm">
              <option value="view">Read</option>
              <option value="send">Read &amp; send</option>
            </select>
            <Button size="sm" variant="outline" className="h-8 gap-1.5" disabled={!adding || !!busy}
              onClick={() => { const id = adding; setAdding(""); void setMember(id, addLevel); }}>
              <UserPlus className="h-4 w-4" /> Add
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Embedded Signup (Coexistence) ────────────────────────────────────────────

declare global {
  interface Window { FB?: any; fbAsyncInit?: () => void }
}

/** Only Meta's own pages may talk to us through postMessage. */
const META_ORIGINS = new Set(["https://www.facebook.com", "https://web.facebook.com", "https://business.facebook.com"]);

function loadFacebookSdk(appId: string, version: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const init = () => {
      window.FB!.init({ appId, autoLogAppEvents: true, xfbml: false, version });
      resolve();
    };
    if (window.FB) { init(); return; }
    window.fbAsyncInit = init;
    if (!document.getElementById("facebook-jssdk")) {
      const s = document.createElement("script");
      s.id = "facebook-jssdk";
      s.src = "https://connect.facebook.net/en_US/sdk.js";
      s.async = true; s.defer = true; s.crossOrigin = "anonymous";
      s.onerror = () => reject(new Error("Couldn't load Facebook's sign-in script — check the connection or an ad blocker."));
      document.body.appendChild(s);
    }
    setTimeout(() => { if (!window.FB) reject(new Error("Facebook's sign-in script didn't start.")); }, 15_000);
  });
}

type Result = {
  ok: boolean; line?: { label: string; display_phone: string }; platform_type?: string | null; is_on_biz_app?: boolean | null;
  contacts?: { ok: boolean; error?: string }; history?: { ok: boolean; error?: string };
  error?: string; code?: string | null; fbtrace_id?: string | null;
};

function ConnectDialog({ onClose, onConnected }: { onClose: () => void; onConnected: () => void }) {
  const [stage, setStage] = useState<"preparing" | "ready" | "signing" | "saving" | "done" | "failed">("preparing");
  const [label, setLabel] = useState("Training");
  const [problem, setProblem] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const cfg = useRef<{ sessionId: string; configId: string } | null>(null);
  const info = useRef<{ wabaId?: string; phoneNumberId?: string }>({});

  // Start a session and load Facebook's SDK, so the button can open the pop-up
  // straight from the click (browsers block pop-ups opened any later).
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const s = await waApi<{ sessionId: string; appId: string; configId: string; graphVersion: string }>("onboard/start", {});
        await loadFacebookSdk(s.appId, s.graphVersion);
        if (!alive) return;
        cfg.current = { sessionId: s.sessionId, configId: s.configId };
        setStage("ready");
      } catch (e) {
        if (!alive) return;
        setProblem(e instanceof Error ? e.message : String(e));
        setStage("failed");
      }
    })();
    return () => { alive = false; };
  }, []);

  // What the pop-up reports: the account and number chosen, a cancel, or an error.
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (!META_ORIGINS.has(event.origin)) return;
      let data: any;
      try { data = typeof event.data === "string" ? JSON.parse(event.data) : event.data; } catch { return; }
      if (data?.type !== "WA_EMBEDDED_SIGNUP") return;
      if (data.data?.waba_id) info.current.wabaId = String(data.data.waba_id);
      if (data.data?.phone_number_id) info.current.phoneNumberId = String(data.data.phone_number_id);
      if (cfg.current) void waApi("onboard/event", { sessionId: cfg.current.sessionId, message: data }).catch(() => {});
      if (data.event === "CANCEL" && (data.data?.error_message || data.data?.error_code)) {
        setProblem(`Meta reported a problem: ${data.data.error_message ?? ""}${data.data.error_code ? ` (code ${data.data.error_code})` : ""}`);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  function start() {
    if (!cfg.current || !window.FB) return;
    setProblem(null);
    setStage("signing");
    window.FB.login((response: any) => {
      const code = response?.authResponse?.code;
      if (!code) {
        setStage("ready");
        setProblem((p) => p ?? "The sign-in was closed before it finished — nothing was connected.");
        return;
      }
      // The code is only good for ~30 seconds: hand it straight to the server.
      setStage("saving");
      void waApi<Result>("onboard/complete", {
        sessionId: cfg.current!.sessionId, code, label,
        wabaId: info.current.wabaId, phoneNumberId: info.current.phoneNumberId,
      }).then((r) => { setResult(r); setStage("done"); toast.success("WhatsApp number connected"); })
        .catch((e) => { setProblem(e instanceof Error ? e.message : String(e)); setStage("failed"); });
    }, {
      config_id: cfg.current.configId,
      response_type: "code",
      override_default_response_type: true,
      extras: { setup: {}, featureType: "whatsapp_business_app_onboarding" },
    });
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o && stage !== "saving") (stage === "done" ? onConnected : onClose)(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Link2 className="h-4 w-4" /> Connect a WhatsApp Business app number</DialogTitle>
          <DialogDescription>
            For a number already in the WhatsApp Business app on a phone. It keeps working there, and Polaris can send and
            receive as it too.
          </DialogDescription>
        </DialogHeader>

        {stage === "done" && result ? (
          <div className="space-y-2 text-sm">
            <p className="flex items-center gap-2 font-medium text-emerald-500"><CheckCircle2 className="h-4 w-4" /> {result.line?.label} {result.line?.display_phone} is connected.</p>
            {result.platform_type && <p className="text-xs text-muted-foreground">Meta reports it on {result.platform_type}{result.is_on_biz_app ? ", still in the Business app" : ""}.</p>}
            <p className="text-xs">Contacts import: {result.contacts?.ok ? "requested" : `not requested — ${result.contacts?.error}`}</p>
            <p className="text-xs">Chat history import: {result.history?.ok ? "requested — it arrives over the next minutes" : `not requested — ${result.history?.error}`}</p>
            <p className="text-xs text-muted-foreground">Next: choose who can use it (Numbers → Who can use this number).</p>
          </div>
        ) : (
          <div className="space-y-3 text-sm">
            <ol className="list-decimal space-y-1 pl-5 text-xs text-muted-foreground">
              <li>Have the phone with the WhatsApp Business app to hand, online, and updated.</li>
              <li>Press <span className="text-foreground">Continue with Facebook</span>, sign in as an admin of JLS's Meta business, choose the business, and pick <span className="text-foreground">connect your existing WhatsApp Business app</span>.</li>
              <li>Enter the number. On the phone, WhatsApp shows a message or a QR code: tap <span className="text-foreground">Connect</span>, confirm, and choose whether to share chat history.</li>
              <li>Finish the pop-up. Polaris then imports the contacts and history Meta sends (allowed once, within 24 hours).</li>
            </ol>
            <label className="block text-xs">
              <span className="mb-1 block text-muted-foreground">Name for this number in Polaris</span>
              <Input value={label} onChange={(e) => setLabel(e.target.value.slice(0, 80))} className="h-8" />
            </label>
            {problem && (
              <p className="flex items-start gap-1.5 rounded-md border border-red-500/40 bg-red-500/10 px-2 py-1.5 text-xs text-red-500">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {problem}
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          {stage === "done" ? (
            <Button onClick={onConnected}>Done</Button>
          ) : (
            <>
              <Button variant="outline" onClick={onClose} disabled={stage === "saving"}>Cancel</Button>
              <Button onClick={start} disabled={stage !== "ready" || !label.trim()} className={cn("gap-1.5")}>
                {stage === "preparing" || stage === "signing" || stage === "saving" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="hidden" />}
                {stage === "saving" ? "Connecting…" : stage === "signing" ? "Waiting for Meta…" : "Continue with Facebook"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

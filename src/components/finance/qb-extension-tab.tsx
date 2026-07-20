/**
 * Finance → QB Extension — self-service distribution + telemetry for the
 * "Attach Prof Inv to Sales Order" Chrome extension.
 *
 * The QuickBooks API cannot see Sales Orders, so a browser extension attaches
 * the generated Prof Inv PDF via the team's own signed-in QBO session. This tab:
 *   - hands out the extension zip + install steps
 *   - manages the shared access token (integration_settings 'qbo_extension')
 *   - shows who has it installed (heartbeats) and any errors it reported
 */
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Download, KeyRound, Copy, RefreshCw, Loader2, Puzzle, CheckCircle2, XCircle, AlertTriangle,
} from "lucide-react";

type InstallRow = { name: string; version: string | null; last_seen: string; first_seen: string };
type EventRow = { name: string | null; version: string | null; event: string; message: string | null; page: string | null; created_at: string };

const fmtWhen = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export function QbExtensionTab() {
  const [token, setToken] = useState<string>("");
  const [loadingToken, setLoadingToken] = useState(true);
  const [saving, setSaving] = useState(false);
  const [installs, setInstalls] = useState<InstallRow[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const [{ data: cfg }, { data: inst }, { data: evs }] = await Promise.all([
      (supabase as any).from("integration_settings").select("config").eq("integration_name", "qbo_extension").maybeSingle(),
      (supabase as any).from("qb_ext_installs").select("*").order("last_seen", { ascending: false }),
      (supabase as any).from("qb_ext_events").select("*").order("created_at", { ascending: false }).limit(30),
    ]);
    setToken(String(cfg?.config?.token ?? ""));
    setInstalls((inst ?? []) as InstallRow[]);
    setEvents((evs ?? []) as EventRow[]);
    setLoadingToken(false);
    setLoading(false);
  }
  useEffect(() => { void load(); }, []);

  async function generateToken() {
    if (token && !confirm("Generate a NEW token? Everyone with the extension will need to paste the new one into their Options.")) return;
    setSaving(true);
    const fresh = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
    const { error } = await (supabase as any).from("integration_settings").upsert(
      { integration_name: "qbo_extension", config: { token: fresh }, enabled: true, updated_at: new Date().toISOString() },
      { onConflict: "integration_name" },
    );
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    setToken(fresh);
    toast.success("Token generated — share it with the team via their extension Options");
  }

  async function copyToken() {
    await navigator.clipboard.writeText(token);
    toast.success("Token copied");
  }

  const errors = useMemo(() => events.filter(e => e.event === "error" || e.event === "attach-fail"), [events]);
  const activity = useMemo(() => events.filter(e => e.event === "attach-ok" || e.event === "install"), [events]);

  return (
    <div className="space-y-5">
      {/* What it is + download */}
      <div className="rounded-xl border border-border bg-card/60 p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <Puzzle className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold">Attach Prof Inv to Sales Order — Chrome extension</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              QuickBooks' API cannot see Sales Orders, so this extension adds an <strong>Attach Prof Inv</strong> button
              to Sales Order pages in QuickBooks that attaches the Polaris-generated Pro-Forma PDF using your own
              signed-in session. The button sits beside the attachment box — drag it anywhere; double-click to snap it back.
            </p>
            <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
              <li>Download and unzip the extension folder somewhere permanent (e.g. Documents).</li>
              <li>Open the extensions page — paste <code className="rounded bg-muted px-1">edge://extensions</code> (Edge) or <code className="rounded bg-muted px-1">chrome://extensions</code> (Chrome) into the address bar (browsers block sites from opening it directly).</li>
              <li>Enable <strong>Developer mode</strong> → <strong>Load unpacked</strong> → select the unzipped folder.</li>
              <li>Click the puzzle icon → find the extension → <strong>Options</strong> → enter your name + paste the access token below → Save.</li>
            </ol>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <a
                href="/downloads/qbo-profinv.zip"
                download
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
              >
                <Download className="h-4 w-4" /> Download extension (v1.1)
              </a>
              <button
                onClick={() => { void navigator.clipboard.writeText("edge://extensions"); toast.success("Copied — paste it into the address bar"); }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground hover:bg-accent"
              >
                <Copy className="h-3.5 w-3.5" /> Copy edge://extensions
              </button>
            </div>
            <p className="mt-3 text-xs text-muted-foreground/80">
              One-click install via the Edge Add-ons store is being set up — once the listing is approved, this
              button becomes “Get it for Edge” and updates install automatically.
            </p>
          </div>
        </div>
      </div>

      {/* Access token */}
      <div className="rounded-xl border border-border bg-card/60 p-5">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold"><KeyRound className="h-4 w-4 text-primary" /> Access token</div>
        <p className="mb-3 text-xs text-muted-foreground">
          Shared token the extension uses to fetch Prof Inv PDFs from Polaris. It grants access to Prof Inv documents only.
        </p>
        {loadingToken ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <code className="max-w-[420px] truncate rounded-md border border-border bg-background px-3 py-2 text-xs">
              {token || "— no token yet — generate one to enable the extension —"}
            </code>
            {token && (
              <button onClick={copyToken} className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-xs hover:bg-accent">
                <Copy className="h-3.5 w-3.5" /> Copy
              </button>
            )}
            <button onClick={generateToken} disabled={saving} className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-xs hover:bg-accent disabled:opacity-50">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} {token ? "Regenerate" : "Generate token"}
            </button>
          </div>
        )}
      </div>

      {/* Installs + telemetry */}
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card/60 p-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm font-semibold">Installed by ({installs.length})</div>
            <button onClick={() => void load()} className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground hover:bg-accent">
              <RefreshCw className={loading ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} /> Refresh
            </button>
          </div>
          {installs.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No installs reported yet — heartbeats appear after the extension is configured and used.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-[10.5px] uppercase tracking-wide text-muted-foreground">
                <tr><th className="py-1.5">Who</th><th className="py-1.5">Version</th><th className="py-1.5">Last active</th></tr>
              </thead>
              <tbody>
                {installs.map((i) => (
                  <tr key={i.name} className="border-t border-border/40">
                    <td className="py-2 font-medium">{i.name}</td>
                    <td className="py-2 text-muted-foreground">{i.version || "—"}</td>
                    <td className="py-2 text-muted-foreground">{fmtWhen(i.last_seen)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="rounded-xl border border-border bg-card/60 p-5">
          <div className="mb-3 text-sm font-semibold">Recent activity & errors</div>
          {events.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Nothing reported yet.</p>
          ) : (
            <div className="max-h-[340px] space-y-2 overflow-auto pr-1">
              {[...errors, ...activity].sort((a, b) => (a.created_at < b.created_at ? 1 : -1)).slice(0, 25).map((e, i) => (
                <div key={i} className="flex items-start gap-2 rounded-lg border border-border/50 bg-background/40 px-3 py-2 text-xs">
                  {e.event === "attach-ok" ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
                    : e.event === "install" ? <Puzzle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-400" />
                    : e.event === "attach-fail" ? <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
                    : <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-400" />}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{e.name || "unnamed"}</span>
                      <span className="text-muted-foreground">{e.event}</span>
                      <span className="ml-auto shrink-0 text-muted-foreground/60">{fmtWhen(e.created_at)}</span>
                    </div>
                    {e.message && <div className="mt-0.5 break-words text-muted-foreground">{e.message}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

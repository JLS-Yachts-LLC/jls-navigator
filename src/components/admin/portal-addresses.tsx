/**
 * Portal addresses — give a client vessel its own Client Portal address,
 * e.g. aquila.polaris.jlsyachts.com, with their logo on the sign-in page.
 *
 * Two steps per vessel: set the address here (and switch it on), and add the
 * same address as a Custom Domain on the Worker in Cloudflare — which also
 * issues its certificate. "Live" means the address resolves.
 */
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Globe, Loader2, Copy, ExternalLink, CheckCircle2, Clock, ChevronDown, ChevronRight, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";

interface Row {
  yachtId: string;
  vessel: string | null;
  logo: string | null;
  logins: number;
  slug: string | null;
  enabled: boolean;
  suggested: string;
  url: string | null;
  live: boolean;
}

async function call(method: "GET" | "POST", body?: unknown) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch("/api/admin/portal-domains", {
    method,
    headers: { Authorization: `Bearer ${session?.access_token ?? ""}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok || out.error) throw new Error(out.error ?? `Request failed (${res.status})`);
  return out;
}

const copy = (text: string, what: string) => { void navigator.clipboard.writeText(text); toast.success(`${what} copied`); };

export function PortalAddresses() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [base, setBase] = useState("polaris.jlsyachts.com");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await call("GET");
      setRows(r.rows);
      setBase(r.base);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't load portal addresses");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { if (open && !rows) void load(); }, [open, rows, load]);

  const enabledCount = (rows ?? []).filter((r) => r.enabled).length;

  return (
    <div className="mb-4 rounded-xl border border-border bg-card/50">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 px-4 py-3 text-left">
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        <Globe className="h-4 w-4 text-primary" />
        <span className="flex-1">
          <span className="block text-sm font-semibold">Portal addresses</span>
          <span className="block text-xs text-muted-foreground">
            Give a client their own address, e.g. <span className="font-mono">aquila.{base}</span>, with their logo on the sign-in page.
            {rows && ` ${enabledCount} switched on.`}
          </span>
        </span>
      </button>

      {open && (
        <div className="space-y-3 border-t border-border p-4">
          <div className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
            <p className="font-medium text-foreground">Two steps per client</p>
            <ol className="mt-1 list-decimal space-y-0.5 pl-4">
              <li>Choose the address below and switch it on.</li>
              <li>
                In Cloudflare: <strong>Workers &amp; Pages → jls-navigator → Settings → Domains &amp; Routes → Add → Custom Domain</strong>,
                paste the address, and save. Cloudflare adds the certificate itself; it's usually live within a few minutes.
              </li>
            </ol>
            <p className="mt-1">Do both before sending the client their login, so their link works first time. The address is branding — each login still only ever sees its own vessel.</p>
          </div>

          <div className="flex justify-end">
            <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={() => void load()} disabled={loading}>
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Check again
            </Button>
          </div>

          {rows === null ? (
            <div className="grid place-items-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : rows.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">No vessels have portal logins yet.</p>
          ) : (
            <div className="divide-y divide-border rounded-lg border border-border">
              {rows.map((r) => <AddressRow key={r.yachtId} row={r} base={base} onChanged={load} />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AddressRow({ row, base, onChanged }: { row: Row; base: string; onChanged: () => void }) {
  const [slug, setSlug] = useState(row.slug ?? row.suggested);
  const [busy, setBusy] = useState(false);
  const host = `${slug || "…"}.${base}`;
  const dirty = (row.slug ?? "") !== slug;

  async function save(enabled: boolean) {
    setBusy(true);
    try {
      const r = await call("POST", { yachtId: row.yachtId, slug, enabled });
      toast.success(enabled ? `${row.vessel}'s address is on` : "Saved", {
        description: r.live ? `${host} is live.` : `Now add ${host} as a Custom Domain on the Worker in Cloudflare.`,
      });
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm(`Remove ${row.slug}.${base}? Anyone opening it will be sent to the main portal. Also remove the Custom Domain in Cloudflare.`)) return;
    setBusy(true);
    try { await call("POST", { yachtId: row.yachtId, action: "remove" }); onChanged(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't remove"); }
    finally { setBusy(false); }
  }

  return (
    <div className="flex flex-wrap items-center gap-3 px-3 py-2.5">
      <div className="flex h-9 w-14 shrink-0 items-center justify-center">
        {row.logo ? <img src={row.logo} alt="" className="max-h-full max-w-full object-contain" /> : <Globe className="h-4 w-4 text-muted-foreground" />}
      </div>
      <div className="min-w-[140px] flex-1">
        <div className="text-sm font-medium">{row.vessel}</div>
        <div className="text-[11px] text-muted-foreground">{row.logins} portal login{row.logins === 1 ? "" : "s"}</div>
      </div>
      <div className="flex items-center gap-1">
        <Input value={slug} disabled={busy} onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
          className="h-8 w-36 text-right font-mono text-xs" maxLength={40} aria-label="Address" />
        <span className="font-mono text-xs text-muted-foreground">.{base}</span>
      </div>
      <div className="flex w-28 items-center gap-1 text-[11px]">
        {!row.slug ? <span className="text-muted-foreground">Not set</span>
          : row.live ? <span className="flex items-center gap-1 text-emerald-500"><CheckCircle2 className="h-3.5 w-3.5" /> Live</span>
          : <span className="flex items-center gap-1 text-amber-500" title="Add it as a Custom Domain in Cloudflare"><Clock className="h-3.5 w-3.5" /> Not live yet</span>}
      </div>
      <div className="flex items-center gap-1.5">
        {row.slug && !dirty ? (
          <Switch checked={row.enabled} disabled={busy} onCheckedChange={(v) => void save(v)} aria-label="Address on" />
        ) : (
          <Button size="sm" className="h-7 text-xs" disabled={busy || slug.length < 2} onClick={() => void save(row.enabled)}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : row.slug ? "Save" : "Set"}
          </Button>
        )}
        <Button size="sm" variant="ghost" className="h-7 px-2" title="Copy address for Cloudflare" onClick={() => copy(host, "Address")} disabled={!slug}>
          <Copy className="h-3.5 w-3.5" />
        </Button>
        {row.url && row.live && row.enabled && (
          <Button size="sm" variant="ghost" className="h-7 px-2" title="Open their sign-in page" onClick={() => window.open(`${row.url}/portal`, "_blank", "noopener")}>
            <ExternalLink className="h-3.5 w-3.5" />
          </Button>
        )}
        {row.slug && (
          <Button size="sm" variant="ghost" className="h-7 px-2 text-red-500" title="Remove address" onClick={() => void remove()} disabled={busy}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}

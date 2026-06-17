import { useQuery } from "@tanstack/react-query";
import { getIntegrationsStatus, type IntegrationsStatus } from "@/lib/integrations.server";
import { useDevAccess } from "@/lib/dev-access";
import {
  Plug, ShieldOff, CheckCircle2, XCircle, Loader2, Copy, AlertTriangle, Cloud,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const REQUIRED_PERMS: { perm: string; purpose: string; have?: boolean }[] = [
  { perm: "Sites.Read.All / Files.Read.All", purpose: "Read SharePoint lists & download files (vessel images)", have: true },
  { perm: "Sites.ReadWrite.All", purpose: "Write Crew List items & Sign-On/Off events back to SharePoint" },
  { perm: "Files.ReadWrite.All", purpose: "Write the Visa Excel tracker & upload crew documents" },
  { perm: "Sites.Manage.All", purpose: "Auto-create the 'Crew Sign On Off' list" },
];

const copy = (v: string) => { navigator.clipboard.writeText(v); toast.success("Copied"); };
const fmt = (d: string | null) => d ? new Date(d).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "never";

export function IntegrationsPage() {
  const devAccess = useDevAccess();
  const { data, isLoading, error } = useQuery<IntegrationsStatus>({
    queryKey: ["integrations-status"],
    enabled: devAccess,
    queryFn: () => (getIntegrationsStatus as any)(),
  });

  if (!devAccess) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <ShieldOff className="h-10 w-10 text-muted-foreground/40" />
        <p className="font-display text-base font-semibold">Integrations is restricted</p>
        <p className="max-w-sm text-sm text-muted-foreground">You need the Dev role or admin access to view integrations.</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-border/70 bg-card/30 px-6 py-3.5">
        <div className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground/60">Polaris / Developer</div>
        <h1 className="mt-0.5 flex items-center gap-2 font-display text-[1.25rem] font-semibold tracking-tight">
          <Plug className="h-5 w-5 text-primary" /> Integrations
        </h1>
      </header>

      <div className="flex-1 overflow-auto px-6 py-5">
        <div className="mx-auto max-w-4xl space-y-6">
          {isLoading ? (
            <div className="flex h-40 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : error ? (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-300">
              Could not load integration status. {(error as Error)?.message}
            </div>
          ) : data ? (
            <>
              {/* SharePoint connection */}
              <section className="rounded-xl border border-border bg-card p-5 shadow-[0_2px_12px_-4px_rgba(0,0,0,0.4)]">
                <div className="mb-3 flex items-center gap-2">
                  <Cloud className="h-4 w-4 text-primary" />
                  <h2 className="font-display text-sm font-semibold">Microsoft SharePoint / Graph</h2>
                  <StatusPill ok={data.sharepoint.configured} okLabel="Connected" badLabel="Not configured" />
                </div>
                <dl className="grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
                  <Field label="Application (client) ID" value={data.sharepoint.clientId} mono onCopy={copy} />
                  <Field label="Directory (tenant) ID" value={data.sharepoint.tenantId} mono onCopy={copy} />
                  <Field label="Site" value={data.sharepoint.siteUrl} />
                  <Field label="Client secret" value={data.sharepoint.secretConfigured ? "Configured" : "Missing"} />
                </dl>

                <div className="mt-4 border-t border-border/60 pt-4">
                  <h3 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    <AlertTriangle className="h-3 w-3 text-amber-400" /> Required Graph application permissions
                  </h3>
                  <div className="space-y-1.5">
                    {REQUIRED_PERMS.map((p) => (
                      <div key={p.perm} className="flex items-start gap-2 text-[12.5px]">
                        {p.have
                          ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
                          : <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/40" />}
                        <div>
                          <code className="rounded bg-muted px-1.5 py-px font-mono text-[11px]">{p.perm}</code>
                          <span className="ml-2 text-muted-foreground">{p.purpose}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="mt-2 text-[11px] text-muted-foreground/70">
                    Grant in Azure → Entra ID → App registrations → this app → API permissions, then “Grant admin consent”.
                  </p>
                </div>
              </section>

              {/* Sync configs */}
              <section className="rounded-xl border border-border bg-card p-5 shadow-[0_2px_12px_-4px_rgba(0,0,0,0.4)]">
                <h2 className="mb-3 font-display text-sm font-semibold">SharePoint Sync Lists <span className="text-muted-foreground">({data.syncs.length})</span></h2>
                {data.syncs.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No sync lists configured.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-left text-[10.5px] uppercase tracking-wide text-muted-foreground">
                          <th className="py-2 pr-3 font-semibold">List → Target</th>
                          <th className="px-3 py-2 font-semibold">Enabled</th>
                          <th className="px-3 py-2 font-semibold">Last sync</th>
                          <th className="px-3 py-2 font-semibold">Synced / Errors</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.syncs.map((s) => (
                          <tr key={s.name} className="border-b border-border/40 align-top">
                            <td className="py-2.5 pr-3">
                              <div className="font-medium">{s.listName ?? s.name}</div>
                              <div className="font-mono text-[11px] text-muted-foreground">{s.syncTarget}</div>
                            </td>
                            <td className="px-3 py-2.5">
                              <StatusPill ok={s.enabled} okLabel="On" badLabel="Off" />
                            </td>
                            <td className="px-3 py-2.5 text-[12px] text-muted-foreground">{fmt(s.lastSyncedAt)}</td>
                            <td className="px-3 py-2.5">
                              <span className="text-emerald-400">{s.lastSynced ?? 0}</span>
                              <span className="text-muted-foreground"> / </span>
                              <span className={cn((s.lastErrors ?? 0) > 0 ? "text-red-400" : "text-muted-foreground")}>{s.lastErrors ?? 0}</span>
                              {!!s.errorSample?.length && (
                                <div className="mt-1 max-w-md text-[10.5px] text-red-400/80">{s.errorSample[0]}</div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, mono, onCopy }: { label: string; value: string | null; mono?: boolean; onCopy?: (v: string) => void }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground/70">{label}</dt>
      <dd className={cn("mt-0.5 flex items-center gap-1.5 text-sm", mono && "font-mono text-[12.5px]")}>
        <span className="truncate">{value ?? "—"}</span>
        {value && onCopy && (
          <button onClick={() => onCopy(value)} className="shrink-0 text-muted-foreground/50 hover:text-foreground" title="Copy">
            <Copy className="h-3 w-3" />
          </button>
        )}
      </dd>
    </div>
  );
}

function StatusPill({ ok, okLabel, badLabel }: { ok: boolean; okLabel: string; badLabel: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-semibold",
      ok ? "bg-emerald-500/15 text-emerald-400" : "bg-muted text-muted-foreground")}>
      {ok ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}{ok ? okLabel : badLabel}
    </span>
  );
}

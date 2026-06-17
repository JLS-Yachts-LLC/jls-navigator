import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type SyncStatus = {
  name: string;
  listName: string | null;
  syncTarget: string | null;
  enabled: boolean;
  lastSyncedAt: string | null;
  lastSynced: number | null;
  lastErrors: number | null;
  errorSample: string[] | null;
};

export type IntegrationsStatus = {
  sharepoint: {
    configured: boolean;
    clientId: string | null;
    tenantId: string | null;
    siteUrl: string | null;
    secretConfigured: boolean;
  };
  syncs: SyncStatus[];
};

/** Read-only integration status for the Developer → Integrations page. Runs on the
 *  worker with the service role; strips the client secret before returning. */
export const getIntegrationsStatus = createServerFn({ method: "GET" })
  // @ts-expect-error — TanStack Start v1 serverFn handler typing
  .handler(async (): Promise<IntegrationsStatus> => {
    const db = supabaseAdmin as any;
    const { data: row } = await db
      .from("integration_settings").select("config").eq("integration_name", "sharepoint").maybeSingle();
    const cfg = row?.config ?? {};

    const { data: syncs } = await db
      .from("sharepoint_sync_configs")
      .select("name, list_name, sync_target, enabled, last_synced_at, last_sync_synced, last_sync_errors, last_sync_error_sample")
      .order("sync_target");

    return {
      sharepoint: {
        configured: !!(cfg.client_id && cfg.tenant_id && cfg.site_url),
        clientId: cfg.client_id ?? null,
        tenantId: cfg.tenant_id ?? null,
        siteUrl: cfg.tenant_url ?? cfg.site_url ?? null,
        secretConfigured: !!cfg.client_secret,
      },
      syncs: (syncs ?? []).map((s: any) => ({
        name: s.name,
        listName: s.list_name,
        syncTarget: s.sync_target,
        enabled: !!s.enabled,
        lastSyncedAt: s.last_synced_at,
        lastSynced: s.last_sync_synced,
        lastErrors: s.last_sync_errors,
        errorSample: s.last_sync_error_sample ?? null,
      })),
    };
  });

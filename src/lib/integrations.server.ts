import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getSpSyncs, syncById, downloadPendingImages } from "@/lib/sharepoint-sync.server";

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

// ─── "Sync all" support (Developer → Integrations) ────────────────────────────

/** The list of enabled sync configs, so the client can drive them one at a time. */
export const getEnabledSyncs = createServerFn({ method: "GET" })
  // @ts-expect-error — TanStack Start v1 serverFn handler typing
  .handler(async (): Promise<Array<{ id: string; label: string }>> => {
    const syncs = await getSpSyncs().catch(() => []);
    return syncs.filter((s) => s.enabled).map((s) => ({ id: s.id!, label: s.listName ?? s.name }));
  });

/** Run a single list sync by id (client loops over getEnabledSyncs to "sync all"). */
export const syncOneList = createServerFn({ method: "POST" })
  // @ts-expect-error — TanStack Start v1 serverFn handler typing
  .handler(async (ctx: { data: { id: string } }): Promise<{ synced: number; errors: number }> => {
    return syncById(ctx.data.id);
  });

/**
 * Download a bounded batch of pending yacht images and report progress.
 * The client calls this repeatedly until `remaining` is 0 or a batch makes no
 * progress (the leftover are vessels with no usable image in SharePoint).
 * Returns failure reasons with vessel names so the cause is visible in the UI.
 */
export const syncImagesBatch = createServerFn({ method: "POST" })
  // @ts-expect-error — TanStack Start v1 serverFn handler typing
  .handler(async (ctx: { data?: { offset?: number } }): Promise<{ downloaded: number; processed: number; remaining: number; failures: Array<{ vessel: string; reason: string }> }> => {
    const offset = Math.max(0, Number(ctx?.data?.offset ?? 0));
    const res = await downloadPendingImages(12, offset);

    const db = supabaseAdmin as any;
    // Pending = anything without a downloaded image — unlinked yachts included
    // (the batch now links them to SharePoint on the fly).
    const { count } = await db
      .from("yachts")
      .select("id", { count: "exact", head: true })
      .or("vessel_image.is.null,vessel_image.like.{*");

    const failIds = res.results.filter((r) => !r.ok).map((r) => r.id);
    let failures: Array<{ vessel: string; reason: string }> = [];
    if (failIds.length) {
      const { data } = await db.from("yachts").select("id, vessel_name").in("id", failIds);
      const nameById = new Map((data ?? []).map((y: any) => [y.id, y.vessel_name]));
      failures = res.results
        .filter((r) => !r.ok)
        .map((r) => ({ vessel: (nameById.get(r.id) as string) ?? r.id, reason: r.reason ?? "unknown error" }));
    }
    return { downloaded: res.downloaded, processed: res.processed, remaining: count ?? 0, failures };
  });

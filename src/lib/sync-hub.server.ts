/**
 * Sync Centre — one view over every scheduled sync with an external platform:
 * SharePoint lists (+push-back +yacht images), QuickBooks Online documents,
 * MyShipTracking / AIS positions, the Visa ⇄ Excel tracker two-way sync and
 * ShipSync ⇄ SharePoint. Status reads + "run now" dispatch.
 */
import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const db = supabaseAdmin as any;

export type SyncHubStatus = {
  spLists: Array<{
    id: string | null; name: string; listName: string | null; syncTarget: string | null;
    enabled: boolean; lastSyncedAt: string | null; lastSynced: number | null; lastErrors: number | null;
  }>;
  imagesPending: number;
  qbo: { lastRun: string | null; detail: string | null };
  mst: { lastPosition: string | null; tracked: number };
  visa: { lastRun: string | null; detail: string | null };
  shipsync: { lastRun: string | null; detail: string | null };
};

/** Run a query, but never let one failing source blank the whole page. */
async function safe<T>(p: PromiseLike<T>): Promise<T | null> {
  try { return await p; } catch { return null; }
}

// POST (not GET) — matches the serverFn invocation pattern proven elsewhere in
// the app; the GET variant resolved empty on the deployed worker.
export const getSyncHubStatus = createServerFn({ method: "POST" })
  .handler(async (): Promise<SyncHubStatus> => {
    const [lists, imagesCount, qboState, mstLast, mstCount, visaRun, shipsyncState] = await Promise.all([
      safe(db.from("sharepoint_sync_configs")
        .select("id, name, list_name, sync_target, enabled, last_synced_at, last_sync_synced, last_sync_errors")
        .order("sync_target")),
      safe(db.from("yachts").select("id", { count: "exact", head: true })
        .or("vessel_image.is.null,vessel_image.like.{*")),
      safe(db.from("qbo_sync_state").select("*").limit(1).maybeSingle()),
      safe(db.from("yachts").select("ais_position_at").not("ais_position_at", "is", null)
        .order("ais_position_at", { ascending: false }).limit(1).maybeSingle()),
      safe(db.from("yachts").select("id", { count: "exact", head: true }).not("ais_position_at", "is", null)),
      safe(db.from("visa_sync_runs").select("started_at, finished_at, summary, error, ok")
        .order("started_at", { ascending: false }).limit(1).maybeSingle()),
      safe(db.from("shipsync_sync_state").select("*").limit(1).maybeSingle()),
    ]);

    const qboRow = (qboState as any)?.data ?? null;
    const visaRow = (visaRun as any)?.data ?? null;
    const shipRow = (shipsyncState as any)?.data ?? null;

    return {
      spLists: ((lists as any)?.data ?? []).map((s: any) => ({
        id: s.id ?? null, name: s.name, listName: s.list_name, syncTarget: s.sync_target,
        enabled: !!s.enabled, lastSyncedAt: s.last_synced_at,
        lastSynced: s.last_sync_synced, lastErrors: s.last_sync_errors,
      })),
      imagesPending: (imagesCount as any)?.count ?? 0,
      qbo: {
        lastRun: qboRow?.last_run_at ?? null,
        detail: qboRow
          ? [
              qboRow.last_count != null ? `last batch: ${qboRow.last_count} document(s)` : null,
              qboRow.last_full_at ? `full sync: ${qboRow.last_full_at}` : null,
              qboRow.last_error ? `last error: ${qboRow.last_error}` : null,
            ].filter(Boolean).join(" · ") || null
          : null,
      },
      mst: { lastPosition: (mstLast as any)?.data?.ais_position_at ?? null, tracked: (mstCount as any)?.count ?? 0 },
      visa: {
        lastRun: visaRow?.finished_at ?? visaRow?.started_at ?? null,
        detail: visaRow
          ? (visaRow.error ?? (visaRow.summary ? JSON.stringify(visaRow.summary) : null))
          : null,
      },
      shipsync: {
        lastRun: shipRow?.last_push_at ?? shipRow?.updated_at ?? null,
        detail: shipRow
          ? [
              shipRow.pushed != null ? `pushed: ${shipRow.pushed}` : null,
              shipRow.errors ? `errors: ${shipRow.errors}` : null,
            ].filter(Boolean).join(" · ") || null
          : null,
      },
    };
  });

export type RunSyncResult = { ok: boolean; detail: string };

/** Run one sync immediately. Dispatches to the same functions the crons use. */
export const runSyncNow = createServerFn({ method: "POST" })
  // @ts-expect-error — TanStack Start v1 serverFn handler typing
  .handler(async (ctx: { data: { key: string; id?: string; offset?: number } }): Promise<RunSyncResult> => {
    const { key, id, offset } = ctx.data;
    const summarise = (v: unknown) => {
      const s = typeof v === "string" ? v : JSON.stringify(v);
      return s.length > 400 ? s.slice(0, 400) + "…" : s;
    };
    try {
      switch (key) {
        case "sp-list": {
          if (!id) return { ok: false, detail: "Missing list id" };
          const { syncById } = await import("@/lib/sharepoint-sync.server");
          return { ok: true, detail: summarise(await syncById(id)) };
        }
        case "sp-pushback": {
          const { pushChangedRecords } = await import("@/lib/sharepoint-sync.server");
          return { ok: true, detail: summarise(await pushChangedRecords()) };
        }
        case "images": {
          const { downloadPendingImages } = await import("@/lib/sharepoint-sync.server");
          const r = await downloadPendingImages(12, Math.max(0, offset ?? 0));
          return { ok: true, detail: summarise({ downloaded: r.downloaded, processed: r.processed, failures: r.results.filter((x) => !x.ok).map((x) => x.reason).slice(0, 3) }) };
        }
        case "qbo": {
          const { syncQboDocuments } = await import("@/lib/qb/sync.server");
          return { ok: true, detail: summarise(await syncQboDocuments({})) };
        }
        case "mst": {
          const { syncMyShipTracking } = await import("@/lib/myshiptracking.server");
          return { ok: true, detail: summarise(await syncMyShipTracking({ extended: false })) };
        }
        case "ais": {
          const { syncAisPositions } = await import("@/lib/aisstream.server");
          return { ok: true, detail: summarise(await syncAisPositions()) };
        }
        case "visa-2way": {
          const { runTwoWaySyncTick } = await import("@/lib/visa/excel-sync.server");
          return { ok: true, detail: summarise(await runTwoWaySyncTick()) };
        }
        case "shipsync-import": {
          const { importShipSyncFromSharePoint } = await import("@/lib/shipsync/sharepoint.server");
          return { ok: true, detail: summarise(await importShipSyncFromSharePoint({})) };
        }
        case "shipsync-push": {
          const { pushShipSyncToSharePoint } = await import("@/lib/shipsync/sharepoint.server");
          return { ok: true, detail: summarise(await pushShipSyncToSharePoint({})) };
        }
        default:
          return { ok: false, detail: `Unknown sync: ${key}` };
      }
    } catch (e: any) {
      return { ok: false, detail: e?.message ?? String(e) };
    }
  });

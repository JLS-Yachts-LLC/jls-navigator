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

/** Best-effort "when did this last run" from whatever timestamp a state table has. */
function lastStamp(row: Record<string, any> | null | undefined): string | null {
  if (!row) return null;
  return row.updated_at ?? row.last_synced_at ?? row.synced_at ?? row.created_at ?? row.run_at ?? null;
}

export const getSyncHubStatus = createServerFn({ method: "GET" })
  .handler(async (): Promise<SyncHubStatus> => {
    const [lists, imagesCount, qboState, mstLast, mstCount, visaRun, shipsyncState] = await Promise.all([
      db.from("sharepoint_sync_configs")
        .select("id, name, list_name, sync_target, enabled, last_synced_at, last_sync_synced, last_sync_errors")
        .order("sync_target"),
      db.from("yachts").select("id", { count: "exact", head: true })
        .or("vessel_image.is.null,vessel_image.like.{*"),
      db.from("qbo_sync_state").select("*").limit(1).maybeSingle(),
      db.from("yachts").select("ais_position_at").not("ais_position_at", "is", null)
        .order("ais_position_at", { ascending: false }).limit(1).maybeSingle(),
      db.from("yachts").select("id", { count: "exact", head: true }).not("ais_position_at", "is", null),
      db.from("visa_sync_runs").select("*").order("created_at", { ascending: false }).limit(1).maybeSingle(),
      db.from("shipsync_sync_state").select("*").limit(1).maybeSingle(),
    ]);

    const qboRow = qboState?.data ?? null;
    const visaRow = visaRun?.data ?? null;
    const shipRow = shipsyncState?.data ?? null;

    return {
      spLists: (lists?.data ?? []).map((s: any) => ({
        id: s.id ?? null, name: s.name, listName: s.list_name, syncTarget: s.sync_target,
        enabled: !!s.enabled, lastSyncedAt: s.last_synced_at,
        lastSynced: s.last_sync_synced, lastErrors: s.last_sync_errors,
      })),
      imagesPending: imagesCount?.count ?? 0,
      qbo: {
        lastRun: lastStamp(qboRow),
        detail: qboRow ? Object.entries(qboRow)
          .filter(([k]) => !["id", "created_at", "updated_at"].includes(k))
          .slice(0, 4).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(" · ") : null,
      },
      mst: { lastPosition: mstLast?.data?.ais_position_at ?? null, tracked: mstCount?.count ?? 0 },
      visa: {
        lastRun: lastStamp(visaRow),
        detail: visaRow?.summary ? JSON.stringify(visaRow.summary) : (visaRow?.error ?? null),
      },
      shipsync: {
        lastRun: lastStamp(shipRow),
        detail: shipRow ? Object.entries(shipRow)
          .filter(([k]) => !["id", "created_at", "updated_at"].includes(k))
          .slice(0, 3).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(" · ") : null,
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

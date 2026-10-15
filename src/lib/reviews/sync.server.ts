/**
 * Communications → Reviews — pull each brand's Google reviews into Polaris.
 *
 * Runs every 15 minutes (worker-entry scheduled()) and on demand (Sync now).
 * For each active brand linked to a Business Profile location it pages through
 * the reviews newest-change first and stops at the first one already stored with
 * the same update time. A brand's first run is a full backfill; after that, new
 * reviews ring the bell (notifications) for everyone who can see that brand.
 *
 * A full pass (first run, Sync now, and once a day) also marks reviews Google no
 * longer returns as removed.
 *
 * With no Google connection, or before Google approves API access, it does
 * nothing and records why — never throws at the cron.
 */
import {
  admin, googleClient, listReviews, starNumber, recordConnectionError, GoogleError, CONNECTION_KINDS, type GReview,
} from "@/lib/reviews/google.server";

/** Pages per brand per run — 50 reviews each; keeps a run inside the Worker's subrequest budget. */
const MAX_PAGES = 20;

export interface BrandSyncResult {
  brand: string;
  fetched: number;
  upserted: number;
  added: number;
  error?: string;
}
export interface SyncResult {
  skipped?: string;
  brands: BrandSyncResult[];
  notified: number;
}

const URGENCY = (stars: number | null) => (stars != null && stars <= 2 ? "danger" : stars === 3 ? "warning" : "info");

function rowFor(brandId: string, r: GReview) {
  return {
    brand_id: brandId,
    google_review_id: r.reviewId,
    reviewer_name: r.reviewer?.isAnonymous ? null : r.reviewer?.displayName ?? null,
    reviewer_photo_url: r.reviewer?.profilePhotoUrl ?? null,
    reviewer_anonymous: !!r.reviewer?.isAnonymous,
    star_rating: starNumber(r.starRating),
    comment: r.comment ?? null,
    created_on_google: r.createTime ?? null,
    updated_on_google: r.updateTime ?? null,
    reply_text: r.reviewReply?.comment ?? null,
    reply_updated_at: r.reviewReply?.updateTime ?? null,
    removed_at: null,
  };
}

/** Everyone the database would let see this brand (review_brand_level is not null). */
async function brandAudience(db: any, brandId: string): Promise<string[]> {
  const [{ data: users }, { data: members }] = await Promise.all([
    db.from("user_profiles").select("user_id").eq("active", true),
    db.from("review_brand_members").select("user_id").eq("brand_id", brandId),
  ]);
  const ids = new Set<string>(((members ?? []) as any[]).map((m) => m.user_id));
  // has_module_permission is the exact rule RLS uses (global admin, own grant, department).
  const checks = await Promise.all(((users ?? []) as any[]).map(async (u) => {
    const { data } = await db.rpc("has_module_permission", { p_user_id: u.user_id, p_module_name: "reviews", p_min_level: "view" });
    return data === true ? (u.user_id as string) : null;
  }));
  for (const id of checks) if (id) ids.add(id);
  return [...ids];
}

async function notifyNew(db: any, brand: { id: string; name: string }, rows: ReturnType<typeof rowFor>[], reviewIds: Map<string, string>): Promise<number> {
  if (!rows.length) return 0;
  const audience = await brandAudience(db, brand.id);
  if (!audience.length) return 0;
  const notes = rows.flatMap((r) => {
    const stars = r.star_rating;
    const who = r.reviewer_name ?? "Someone";
    const snippet = (r.comment ?? "").replace(/\s+/g, " ").trim();
    const body = snippet
      ? `${who}: "${snippet.length > 160 ? `${snippet.slice(0, 157)}…` : snippet}"`
      : `${who} left a rating with no comment.`;
    return audience.map((user_id) => ({
      user_id,
      type: "google_review",
      urgency: URGENCY(stars),
      title: `${stars ? `${stars}★` : "New"} Google review — ${brand.name}`,
      body,
      action_url: "/polaris-redesign?screen=reviews",
      metadata: { brand_id: brand.id, review_id: reviewIds.get(r.google_review_id) ?? null, google_review_id: r.google_review_id, stars },
    }));
  });
  const { error } = await db.from("notifications").insert(notes);
  if (error) {
    console.error("[reviews-sync] notifications:", error.message);
    return 0;
  }
  return notes.length;
}

async function syncBrand(db: any, brand: any, full: boolean): Promise<{ result: BrandSyncResult; notified: number }> {
  const result: BrandSyncResult = { brand: brand.name, fetched: 0, upserted: 0, added: 0 };
  const fullPass = full || !brand.backfilled;

  const { data: stored } = await db.from("reviews").select("google_review_id, updated_on_google, removed_at").eq("brand_id", brand.id);
  const known = new Map<string, { updated: number | null; removed: boolean }>(
    ((stored ?? []) as any[]).map((r) => [r.google_review_id, {
      updated: r.updated_on_google ? new Date(r.updated_on_google).getTime() : null,
      removed: !!r.removed_at,
    }]),
  );

  const changed: GReview[] = [];
  const seen = new Set<string>();
  let average: number | null = null;
  let total: number | null = null;
  let pageToken: string | null = null;
  let complete = false;

  for (let page = 0; page < MAX_PAGES; page++) {
    const p = await listReviews(db, brand.google_account, brand.google_location, pageToken);
    if (page === 0) { average = p.averageRating; total = p.totalReviewCount; }
    let reachedKnown = false;
    for (const r of p.reviews) {
      if (!r.reviewId) continue;
      seen.add(r.reviewId);
      result.fetched++;
      const k = known.get(r.reviewId);
      const updated = r.updateTime ? new Date(r.updateTime).getTime() : null;
      if (k && !k.removed && k.updated === updated) {
        reachedKnown = true;
        if (!fullPass) break;
        continue;
      }
      changed.push(r);
    }
    if (!p.nextPageToken) { complete = true; break; }
    if (reachedKnown && !fullPass) break;
    pageToken = p.nextPageToken;
  }

  const rows = changed.map((r) => rowFor(brand.id, r));
  const ids = new Map<string, string>();
  if (rows.length) {
    // replied_by is left out on purpose: a reply written from Polaris keeps its author.
    const { data, error } = await db.from("reviews").upsert(rows, { onConflict: "google_review_id" }).select("id, google_review_id");
    if (error) throw new Error(`Saving reviews failed: ${error.message}`);
    for (const r of (data ?? []) as any[]) ids.set(r.google_review_id, r.id);
    result.upserted = rows.length;
  }

  // Only a pass that read every page can say what Google no longer has.
  if (fullPass && complete) {
    const gone = [...known].filter(([id, k]) => !k.removed && !seen.has(id)).map(([id]) => id);
    if (gone.length) {
      await db.from("reviews").update({ removed_at: new Date().toISOString() }).in("google_review_id", gone);
    }
  }

  const added = rows.filter((r) => !known.has(r.google_review_id));
  result.added = added.length;
  // The back catalogue never alerts — only reviews that arrive after the first full pull.
  const notified = brand.backfilled ? await notifyNew(db, brand, added, ids) : 0;

  await db.from("review_brands").update({
    average_rating: average,
    total_reviews: total,
    last_synced_at: new Date().toISOString(),
    last_sync_error: null,
    ...(fullPass && complete ? { backfilled: true } : {}),
  }).eq("id", brand.id);

  return { result, notified };
}

/**
 * Sync every linked brand (or just one). `full` re-reads every page and marks
 * removed reviews. Never throws for Google trouble — it's reported per brand
 * and on the connection.
 */
export async function syncReviews(opts: { full?: boolean; brandId?: string } = {}): Promise<SyncResult> {
  const db = admin();
  if (!googleClient()) return { skipped: "Google OAuth client not configured", brands: [], notified: 0 };
  const { data: conn } = await db.from("google_business_connection").select("id").eq("id", 1).maybeSingle();
  if (!conn) return { skipped: "No Google account connected", brands: [], notified: 0 };

  let q = db.from("review_brands").select("*").eq("active", true).not("google_location", "is", null).order("sort");
  if (opts.brandId) q = q.eq("id", opts.brandId);
  const { data: brands } = await q;
  const out: SyncResult = { brands: [], notified: 0 };
  let anyOk = false;

  for (const brand of (brands ?? []) as any[]) {
    if (!brand.google_account) continue;
    try {
      const { result, notified } = await syncBrand(db, brand, !!opts.full);
      out.brands.push(result);
      out.notified += notified;
      anyOk = true;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      out.brands.push({ brand: brand.name, fetched: 0, upserted: 0, added: 0, error: message });
      await db.from("review_brands").update({ last_sync_error: message }).eq("id", brand.id);
      // The whole connection is down (unapproved, revoked…): no point trying the other brands.
      if (e instanceof GoogleError && CONNECTION_KINDS.includes(e.kind)) {
        out.skipped = message;
        break;
      }
    }
  }
  // A clean run clears whatever the connection last complained about.
  if (anyOk && !out.skipped) await recordConnectionError(db, null);
  return out;
}

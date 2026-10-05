/**
 * Client Portal addresses — <slug>.polaris.jlsyachts.com, one per client vessel.
 *
 * The address brands the sign-in page and keeps a client on their own portal.
 * It is NOT the security boundary: a captain sees only their own vessel because
 * of captain_accounts + RLS, whichever address they sign in at.
 *
 * Each address must also exist as a Custom Domain on the Worker (Cloudflare →
 * Workers & Pages → jls-navigator → Settings → Domains & Routes), which also
 * issues its certificate. Until then the address simply doesn't resolve.
 *
 *   GET  /api/portal/brand            public — branding for the address it's called on
 *   GET  /api/portal/address          signed-in portal user — is this their address?
 *   GET  /api/admin/portal-domains    admin — every client vessel and its address
 *   POST /api/admin/portal-domains    admin — set / enable / disable / remove
 */
import { createClient } from "@supabase/supabase-js";
import { requireAdminAccess } from "@/lib/admin/access";
import { resolvePortalYacht } from "@/lib/portal/portal-auth.server";
import { logAuditEvent } from "@/lib/admin/audit";

const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...extra } });

function admin(): any {
  return createClient(process.env.SUPABASE_URL ?? "", process.env.SUPABASE_SERVICE_ROLE_KEY ?? "", {
    auth: { persistSession: false },
  });
}

/** polaris.jlsyachts.com — the host every client address sits under. */
export function portalBaseHost(): string {
  try { return new URL(process.env.VITE_APP_URL || "https://polaris.jlsyachts.com").host.toLowerCase(); }
  catch { return "polaris.jlsyachts.com"; }
}

export const SLUG_RE = /^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$/;
const RESERVED = new Set(["www", "mail", "api", "app", "admin", "portal", "polaris", "staff", "auth", "login", "test", "dev",
  "staging", "status", "static", "assets", "cdn", "help", "support", "jls", "jlsyachts"]);

/** The client slug in a host like aquila.polaris.jlsyachts.com, or null for any other host. */
export function slugFromHost(host: string | null | undefined): string | null {
  const h = String(host ?? "").toLowerCase().split(":")[0];
  const base = portalBaseHost();
  if (!h.endsWith(`.${base}`)) return null;
  const label = h.slice(0, -(base.length + 1));
  return SLUG_RE.test(label) ? label : null;
}

export const portalUrlFor = (slug: string) => `https://${slug}.${portalBaseHost()}`;

/** A suggestion from a vessel name: "M/Y Aquila II" → "aquila-ii". */
export function suggestSlug(vesselName: string | null | undefined): string {
  return String(vesselName ?? "").toLowerCase()
    .replace(/^(m\/?y|s\/?y|m\/?v|my|sy|mv)\s+/i, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40).replace(/-+$/g, "");
}

interface DomainRow { slug: string; yachtId: string; enabled: boolean; vesselName: string | null; logoUrl: string | null; image: string | null }

// Per-isolate cache: the address is checked on page loads, not every API call.
const cache = new Map<string, { at: number; row: DomainRow | null }>();
const TTL_MS = 60_000;

export async function lookupSlug(slug: string): Promise<DomainRow | null> {
  const hit = cache.get(slug);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.row;
  const { data } = await admin().from("portal_domains")
    .select("slug, yacht_id, enabled, yacht:yachts(vessel_name, logo_url, vessel_image)").eq("slug", slug).maybeSingle();
  const row: DomainRow | null = data ? {
    slug: data.slug, yachtId: data.yacht_id, enabled: !!data.enabled,
    vesselName: data.yacht?.vessel_name ?? null, logoUrl: data.yacht?.logo_url ?? null, image: data.yacht?.vessel_image ?? null,
  } : null;
  cache.set(slug, { at: Date.now(), row });
  return row;
}

/**
 * Requests arriving on a client address. "/" opens their portal; an address
 * that isn't set up (or is switched off) goes to the main portal. Everything
 * else passes through — the staff app still needs a staff login and RLS still
 * decides what anyone can see.
 */
export async function routeClientHost(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  const slug = slugFromHost(url.host);
  if (!slug) return null;
  if (url.pathname !== "/" && url.pathname !== "/portal" && url.pathname !== "/portal/") return null;
  const row = await lookupSlug(slug);
  if (!row?.enabled) return Response.redirect(`https://${portalBaseHost()}/portal`, 302);
  if (url.pathname === "/") return Response.redirect(`${url.origin}/portal${url.search}`, 302);
  return null;
}

/** Where a vessel's people sign in: their own address if it's switched on, else the main portal. */
export async function portalSignInUrl(yachtId: string | null | undefined): Promise<string> {
  if (yachtId) {
    const { data } = await admin().from("portal_domains").select("slug, enabled").eq("yacht_id", yachtId).maybeSingle();
    if (data?.enabled) return `${portalUrlFor(data.slug)}/portal`;
  }
  return `https://${portalBaseHost()}/portal`;
}

// ─── Public: branding for the sign-in page ────────────────────────────────────

export async function portalBrandHandler(request: Request): Promise<Response> {
  const slug = slugFromHost(new URL(request.url).host);
  if (!slug) return json({ branded: false });
  const row = await lookupSlug(slug);
  if (!row?.enabled) return json({ branded: false });
  return json(
    { branded: true, slug, vessel: row.vesselName, logo: row.logoUrl, image: row.image },
    200, { "Cache-Control": "public, max-age=60" },
  );
}

// ─── Signed-in portal user: are they on their own address? ────────────────────

export async function portalAddressHandler(request: Request): Promise<Response> {
  const r = await resolvePortalYacht(request);
  if (!r.ok) return r.response;
  const { data: own } = await admin().from("portal_domains").select("slug, enabled")
    .eq("yacht_id", r.yacht.yachtId).maybeSingle();
  const home = own?.enabled ? portalUrlFor(own.slug) : `https://${portalBaseHost()}`;
  const slug = slugFromHost(new URL(request.url).host);
  // On the main address everyone is welcome; on a client address only that client.
  const matches = !slug || (own?.enabled === true && own.slug === slug) || r.yacht.preview;
  return json({ matches, home: `${home}/portal`, vessel: r.yacht.vesselName });
}

// ─── Admin ────────────────────────────────────────────────────────────────────

/** Does the address resolve yet? (The Custom Domain has been added in Cloudflare.) */
async function isLive(host: string): Promise<boolean> {
  try {
    const res = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(host)}&type=A`, {
      headers: { Accept: "application/dns-json" }, signal: AbortSignal.timeout(4000),
    });
    const out = await res.json() as { Answer?: unknown[] };
    return Array.isArray(out.Answer) && out.Answer.length > 0;
  } catch {
    return false;
  }
}

export async function adminPortalDomainsHandler(request: Request): Promise<Response> {
  const session = await requireAdminAccess(request);
  if (!session.ok) return session.response;
  const sb = admin();

  if (request.method === "GET") {
    // Every vessel with a portal login, plus any that already has an address.
    const [{ data: accounts }, { data: domains }] = await Promise.all([
      sb.from("captain_accounts").select("yacht_id, active").not("yacht_id", "is", null),
      sb.from("portal_domains").select("slug, yacht_id, enabled, updated_at"),
    ]);
    const ids = [...new Set([...(accounts ?? []).map((a: any) => a.yacht_id), ...(domains ?? []).map((d: any) => d.yacht_id)])];
    const { data: yachts } = ids.length
      ? await sb.from("yachts").select("id, vessel_name, logo_url").in("id", ids)
      : { data: [] as any[] };
    const logins = new Map<string, number>();
    for (const a of (accounts ?? []) as any[]) if (a.active) logins.set(a.yacht_id, (logins.get(a.yacht_id) ?? 0) + 1);
    const byYacht = new Map(((domains ?? []) as any[]).map((d) => [d.yacht_id, d]));
    const rows = await Promise.all(((yachts ?? []) as any[]).map(async (y) => {
      const d = byYacht.get(y.id);
      return {
        yachtId: y.id, vessel: y.vessel_name, logo: y.logo_url, logins: logins.get(y.id) ?? 0,
        slug: d?.slug ?? null, enabled: !!d?.enabled, suggested: suggestSlug(y.vessel_name),
        url: d ? portalUrlFor(d.slug) : null,
        live: d ? await isLive(`${d.slug}.${portalBaseHost()}`) : false,
      };
    }));
    rows.sort((a, b) => String(a.vessel).localeCompare(String(b.vessel)));
    return json({ base: portalBaseHost(), rows });
  }

  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const body = (await request.json().catch(() => ({}))) as { action?: string; yachtId?: string; slug?: string; enabled?: boolean };
  if (!body.yachtId) return json({ error: "Choose a vessel" }, 400);
  const { data: y } = await sb.from("yachts").select("id, vessel_name").eq("id", body.yachtId).maybeSingle();
  if (!y) return json({ error: "Vessel not found" }, 404);
  const audit = (detail: string) => logAuditEvent({
    event_type: "PERM",
    actor_id: session.user.id, actor_email: session.user.email, actor_role: session.user.role,
    target_type: "yacht", target_id: y.id, target_label: y.vessel_name,
    detail, ip_address: request.headers.get("x-forwarded-for"), result: "success",
  });

  if (body.action === "remove") {
    const { data: old } = await sb.from("portal_domains").select("slug").eq("yacht_id", y.id).maybeSingle();
    await sb.from("portal_domains").delete().eq("yacht_id", y.id);
    if (old) cache.delete(old.slug);
    await audit("Portal address removed");
    return json({ ok: true });
  }

  const slug = String(body.slug ?? "").trim().toLowerCase();
  if (!SLUG_RE.test(slug)) return json({ error: "Use 2–40 lowercase letters, numbers or hyphens, starting and ending with a letter or number." }, 400);
  if (RESERVED.has(slug)) return json({ error: `"${slug}" is reserved — choose another.` }, 400);
  const { data: taken } = await sb.from("portal_domains").select("yacht_id").eq("slug", slug).maybeSingle();
  if (taken && taken.yacht_id !== y.id) return json({ error: `${slug}.${portalBaseHost()} is already another vessel's address.` }, 409);

  const { data: before } = await sb.from("portal_domains").select("slug").eq("yacht_id", y.id).maybeSingle();
  const { error } = await sb.from("portal_domains").upsert({
    yacht_id: y.id, slug, enabled: !!body.enabled, updated_by: session.user.id,
    ...(before ? {} : { created_by: session.user.id }),
  }, { onConflict: "yacht_id" });
  if (error) return json({ error: error.message }, 500);
  cache.delete(slug);
  if (before?.slug) cache.delete(before.slug);
  await audit(`Portal address ${slug}.${portalBaseHost()} ${body.enabled ? "enabled" : "saved (off)"}`);
  return json({ ok: true, url: portalUrlFor(slug), live: await isLive(`${slug}.${portalBaseHost()}`) });
}

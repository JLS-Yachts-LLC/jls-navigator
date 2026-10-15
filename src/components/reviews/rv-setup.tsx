/**
 * Setup (global admins) — the Google connection, which Business Profile each
 * brand is linked to, and who can see / reply for each brand without the
 * Reviews permission. Secrets are shown by name only; values never leave the server.
 */
import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw, PlugZap, CheckCircle2, XCircle, Copy, Link2, Unlink, Users, UserPlus, Trash2, MapPin } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { db, rvApi, Chip, STATE_COPY, relTime, fmtDate, type ReviewBrand, type ReviewsStatus } from "./rv-common";

interface GLocation {
  account: string; name: string; title: string | null; address: string | null;
  place_id: string | null; maps_url: string | null; new_review_url: string | null;
}
interface Member { brand_id: string; user_id: string; can_reply: boolean }
interface Person { id: string; display_name: string | null }

const SECRET_HINT: Record<string, string> = {
  GOOGLE_BUSINESS_CLIENT_ID: "Google Cloud → APIs & Services → Credentials → OAuth client ID",
  GOOGLE_BUSINESS_CLIENT_SECRET: "The same OAuth client's secret",
  ANTHROPIC_API_KEY: "Used for Draft with AI",
};

export function RvSetup({ status, onStatus, onBrandsChanged }: {
  status: ReviewsStatus | null; onStatus: (s: ReviewsStatus) => void; onBrandsChanged: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [brands, setBrands] = useState<ReviewBrand[] | null>(null);
  const [locations, setLocations] = useState<GLocation[] | null>(null);
  const [locError, setLocError] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [people, setPeople] = useState<Person[]>([]);

  const loadBrands = useCallback(async () => {
    const [{ data: bs }, { data: ms }, { data: ps }] = await Promise.all([
      db().from("review_brands").select("*").order("sort"),
      db().from("review_brand_members").select("brand_id, user_id, can_reply"),
      db().from("profiles").select("id, display_name").order("display_name"),
    ]);
    setBrands((bs ?? []) as ReviewBrand[]);
    setMembers((ms ?? []) as Member[]);
    setPeople((ps ?? []) as Person[]);
  }, []);
  useEffect(() => { void loadBrands(); }, [loadBrands]);

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key);
    try { await fn(); } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); } finally { setBusy(null); }
  }

  const refreshStatus = (probe = false) => run(probe ? "probe" : "status", async () => {
    onStatus(await rvApi<ReviewsStatus>(`status${probe ? "?probe=1" : ""}`));
  });

  const connect = () => run("connect", async () => {
    const { url } = await rvApi<{ url: string }>("google/connect", {});
    window.location.href = url;
  });

  const syncNow = () => run("sync", async () => {
    const r = await rvApi<{ skipped?: string; brands: Array<{ brand: string; added: number; error?: string }> }>("sync", {});
    if (r.skipped) toast.message(r.skipped);
    else if (!r.brands.length) toast.message("No brand is linked to a Google listing yet.");
    else toast.success(r.brands.map((b) => `${b.brand}: ${b.error ? "failed" : `${b.added} new`}`).join(" · "));
    await loadBrands();
    onBrandsChanged();
    onStatus(await rvApi<ReviewsStatus>("status"));
  });

  const loadLocations = () => run("locations", async () => {
    setLocError(null);
    try {
      const r = await rvApi<{ locations: GLocation[] }>("google/locations");
      setLocations(r.locations);
      if (!r.locations.length) setLocError("The connected Google account doesn't manage any Business Profiles.");
    } catch (e) {
      setLocError(e instanceof Error ? e.message : String(e));
      onStatus(await rvApi<ReviewsStatus>("status"));
    }
  });

  async function link(brand: ReviewBrand, loc: GLocation | null) {
    await run(`link:${brand.id}`, async () => {
      const r = await rvApi<{ sync?: { skipped?: string; brands: Array<{ added: number; error?: string }> } }>("brands/link", { brand_id: brand.id, location: loc });
      const s = r.sync?.brands?.[0];
      toast.success(!loc ? `${brand.name} unlinked`
        : s?.error ? `${brand.name} linked — ${s.error}`
        : r.sync?.skipped ? `${brand.name} linked — ${r.sync.skipped}`
        : `${brand.name} linked${s ? ` — ${s.added} review${s.added === 1 ? "" : "s"} pulled in` : ""}`);
      await loadBrands();
      onBrandsChanged();
    });
  }

  async function setMember(brandId: string, userId: string, canReply: boolean | null) {
    await run(`m:${brandId}:${userId}`, async () => {
      const { error } = canReply === null
        ? await db().from("review_brand_members").delete().eq("brand_id", brandId).eq("user_id", userId)
        : await db().from("review_brand_members").upsert({ brand_id: brandId, user_id: userId, can_reply: canReply }, { onConflict: "brand_id,user_id" });
      if (error) throw new Error(error.message);
      await loadBrands();
    });
  }

  if (!status || brands === null) return <div className="grid place-items-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  const copy = STATE_COPY[status.state];
  const canConnect = status.configured;
  const working = status.state === "connected" || status.state === "error";

  return (
    <div className="space-y-4">
      {/* ── Connection ── */}
      <section className="space-y-3 rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <PlugZap className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Google connection</h2>
          <Chip t={copy.t}>{copy.label}</Chip>
          <div className="ml-auto flex flex-wrap gap-2">
            {status.connected && (
              <Button size="sm" variant="outline" className="gap-1.5" disabled={!!busy} onClick={() => void refreshStatus(true)}>
                {busy === "probe" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Check now
              </Button>
            )}
            {working && (
              <Button size="sm" variant="outline" className="gap-1.5" disabled={!!busy} onClick={() => void syncNow()}>
                {busy === "sync" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Sync now
              </Button>
            )}
            <Button size="sm" className="gap-1.5" disabled={!canConnect || !!busy} onClick={() => void connect()}
              title={canConnect ? undefined : "Waiting for the Google OAuth client to be added"}>
              {busy === "connect" ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlugZap className="h-4 w-4" />}
              {status.connected ? "Reconnect" : "Connect Google account"}
            </Button>
          </div>
        </div>

        <p className="text-sm text-muted-foreground">
          {status.state === "error" && status.error ? status.error.message
            : copy.text || "Polaris pulls each brand's reviews every 15 minutes. Replies are only ever posted when someone presses Post."}
        </p>

        {status.connected && (
          <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            <div><dt className="inline text-muted-foreground">Google account: </dt><dd className="inline font-medium">{status.google_email ?? "—"}</dd></div>
            <div><dt className="inline text-muted-foreground">Connected: </dt><dd className="inline">{fmtDate(status.connected_at)}</dd></div>
            {status.error && (
              <div className="sm:col-span-2"><dt className="inline text-muted-foreground">Last problem: </dt>
                <dd className="inline">{status.error.message}{status.error.at ? ` (${relTime(status.error.at)})` : ""}</dd></div>
            )}
          </dl>
        )}

        {status.secrets && (
          <div className="border-t border-border/60 pt-3">
            <p className="mb-2 text-sm font-medium">Worker secrets</p>
            <ul className="space-y-1">
              {Object.entries(status.secrets).map(([name, present]) => (
                <li key={name} className="flex flex-wrap items-center gap-2 text-sm">
                  {present ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <XCircle className="h-4 w-4 text-muted-foreground" />}
                  <code className="font-mono">{name}</code>
                  <span className="text-muted-foreground">— {SECRET_HINT[name] ?? ""}</span>
                </li>
              ))}
            </ul>
            {status.redirect_uri && (
              <p className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                <span className="text-muted-foreground">OAuth redirect URI:</span>
                <code className="rounded bg-muted px-1.5 py-0.5 font-mono">{status.redirect_uri}</code>
                <button className="text-muted-foreground hover:text-foreground" title="Copy"
                  onClick={() => { void navigator.clipboard.writeText(status.redirect_uri!); toast.success("Copied"); }}>
                  <Copy className="h-4 w-4" />
                </button>
              </p>
            )}
          </div>
        )}
      </section>

      {/* ── Brands ── */}
      <section className="space-y-3 rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <MapPin className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Brands</h2>
          <Button size="sm" variant="outline" className="ml-auto gap-1.5" disabled={!status.connected || !!busy} onClick={() => void loadLocations()}
            title={status.connected ? undefined : "Connect the Google account first"}>
            {busy === "locations" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {locations ? "Reload listings from Google" : "Load listings from Google"}
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          Link each brand to its Google Business Profile. Everyone with the Reviews permission sees every brand
          (edit = can reply); add people under a brand to give them just that one.
        </p>
        {locError && <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm">{locError}</p>}

        <ul className="space-y-3">
          {brands.map((b) => (
            <BrandCard key={b.id} brand={b} locations={locations} busy={busy}
              members={members.filter((m) => m.brand_id === b.id)} people={people}
              onLink={(loc) => void link(b, loc)} onMember={(u, r) => void setMember(b.id, u, r)} />
          ))}
        </ul>
      </section>
    </div>
  );
}

function BrandCard({ brand: b, locations, busy, members, people, onLink, onMember }: {
  brand: ReviewBrand; locations: GLocation[] | null; busy: string | null; members: Member[]; people: Person[];
  onLink: (loc: GLocation | null) => void; onMember: (userId: string, canReply: boolean | null) => void;
}) {
  const [choice, setChoice] = useState("");
  const [adding, setAdding] = useState("");
  const [addReply, setAddReply] = useState(false);
  const linking = busy === `link:${b.id}`;
  const nameOf = (id: string) => people.find((p) => p.id === id)?.display_name ?? "—";
  const candidates = people.filter((p) => !members.some((m) => m.user_id === p.id));
  const picked = locations?.find((l) => `${l.account}|${l.name}` === choice) ?? null;

  return (
    <li className="rounded-lg border border-border/70 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-base font-medium">{b.name}</span>
        {b.google_location ? <Chip t="green"><Link2 className="h-3.5 w-3.5" /> Linked</Chip> : <Chip>Not linked</Chip>}
        {b.backfilled && <Chip t="blue">History pulled in</Chip>}
        {b.last_sync_error && <Chip t="red" title={b.last_sync_error}>Last sync failed</Chip>}
      </div>

      {b.google_location ? (
        <div className="mt-1 text-sm">
          <p>{b.location_title ?? b.google_location}{b.location_address ? <span className="text-muted-foreground"> · {b.location_address}</span> : null}</p>
          <p className="text-muted-foreground">
            {b.total_reviews != null ? `${b.total_reviews} reviews · ${b.average_rating ?? "—"}★ · ` : ""}
            {b.last_synced_at ? `synced ${relTime(b.last_synced_at)}` : "not synced yet"}
            {b.last_sync_error ? ` — ${b.last_sync_error}` : ""}
          </p>
        </div>
      ) : (
        <p className="mt-1 text-sm text-muted-foreground">Choose this brand's Google listing below.</p>
      )}

      {locations && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <select value={choice} onChange={(e) => setChoice(e.target.value)}
            className="h-9 min-w-[280px] flex-1 rounded-md border border-border bg-background px-2.5 text-sm">
            <option value="">{b.google_location ? "Change listing…" : "Choose a listing…"}</option>
            {locations.map((l) => (
              <option key={`${l.account}|${l.name}`} value={`${l.account}|${l.name}`}>
                {l.title ?? l.name}{l.address ? ` — ${l.address}` : ""}
              </option>
            ))}
          </select>
          <Button size="sm" className="gap-1.5" disabled={!picked || !!busy || picked.name === b.google_location} onClick={() => { onLink(picked); setChoice(""); }}>
            {linking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />} Link
          </Button>
        </div>
      )}
      {b.google_location && (
        <button disabled={!!busy} onClick={() => { if (confirm(`Unlink ${b.name} from its Google listing? Its reviews stay in Polaris but stop updating.`)) onLink(null); }}
          className="mt-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-red-500">
          <Unlink className="h-4 w-4" /> Unlink
        </button>
      )}

      <div className="mt-3 border-t border-border/60 pt-3">
        <p className="mb-2 flex items-center gap-1.5 text-sm font-medium"><Users className="h-4 w-4" /> Just this brand</p>
        {members.length === 0 ? <p className="text-sm text-muted-foreground">No one added.</p> : (
          <ul className="divide-y divide-border/50 rounded-md border border-border/60">
            {members.map((m) => (
              <li key={m.user_id} className="flex items-center gap-2 px-2.5 py-1.5 text-sm">
                <span className="flex-1 truncate">{nameOf(m.user_id)}</span>
                <select value={m.can_reply ? "reply" : "view"} disabled={busy === `m:${b.id}:${m.user_id}`}
                  onChange={(e) => onMember(m.user_id, e.target.value === "reply")}
                  className="h-8 rounded-md border border-border bg-background px-1.5 text-sm">
                  <option value="view">Read</option>
                  <option value="reply">Read &amp; reply</option>
                </select>
                <button title="Remove" disabled={busy === `m:${b.id}:${m.user_id}`} onClick={() => onMember(m.user_id, null)}
                  className="rounded p-1 text-muted-foreground hover:text-red-500">
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <select value={adding} onChange={(e) => setAdding(e.target.value)}
            className="h-9 min-w-[220px] rounded-md border border-border bg-background px-2.5 text-sm">
            <option value="">Add a person…</option>
            {candidates.map((p) => <option key={p.id} value={p.id}>{p.display_name ?? "—"}</option>)}
          </select>
          <select value={addReply ? "reply" : "view"} onChange={(e) => setAddReply(e.target.value === "reply")}
            className="h-9 rounded-md border border-border bg-background px-2.5 text-sm">
            <option value="view">Read</option>
            <option value="reply">Read &amp; reply</option>
          </select>
          <Button size="sm" variant="outline" className="gap-1.5" disabled={!adding || !!busy}
            onClick={() => { const id = adding; setAdding(""); onMember(id, addReply); }}>
            <UserPlus className="h-4 w-4" /> Add
          </Button>
        </div>
      </div>
    </li>
  );
}

/**
 * Shared pieces for Communications → Reviews: row types, the authenticated
 * fetch to /api/reviews/*, stars, avatars and the connection banner.
 */
import { useState } from "react";
import { Star, Clock, PlugZap, AlertTriangle, KeyRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export const db = () => supabase as any;

export type BrandLevel = "reply" | "view";

export interface ReviewBrand {
  id: string;
  name: string;
  sort: number;
  active: boolean;
  google_account: string | null;
  google_location: string | null;
  location_title: string | null;
  location_address: string | null;
  place_id: string | null;
  maps_url: string | null;
  new_review_url: string | null;
  average_rating: number | null;
  total_reviews: number | null;
  last_synced_at: string | null;
  last_sync_error: string | null;
  backfilled: boolean;
}
export type MyBrand = ReviewBrand & { level: BrandLevel };

export interface Review {
  id: string;
  brand_id: string;
  google_review_id: string;
  reviewer_name: string | null;
  reviewer_photo_url: string | null;
  reviewer_anonymous: boolean;
  star_rating: number | null;
  comment: string | null;
  created_on_google: string | null;
  updated_on_google: string | null;
  reply_text: string | null;
  reply_updated_at: string | null;
  replied_by: string | null;
  removed_at: string | null;
}

export type ConnectionState = "not_configured" | "not_connected" | "reconnect" | "waiting" | "error" | "connected";

export interface ReviewsStatus {
  state: ConnectionState;
  configured: boolean;
  connected: boolean;
  google_email: string | null;
  connected_at: string | null;
  error: { kind: string; message: string; at: string | null } | null;
  is_admin: boolean;
  secrets?: Record<string, boolean>;
  redirect_uri?: string;
}

/** POST/GET to the Reviews API with the signed-in session. Throws the server's message. */
export async function rvApi<T = any>(path: string, body?: unknown): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(`/api/reviews/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out?.error ?? `Request failed (${res.status})`);
  return out as T;
}

/** The brands this person can see, with what they may do on each (review_brand_level). */
export async function loadMyBrands(): Promise<MyBrand[]> {
  const { data } = await db().from("review_brands").select("*").eq("active", true).order("sort");
  const brands = (data ?? []) as ReviewBrand[];
  const levels = await Promise.all(brands.map((b) =>
    db().rpc("review_brand_level", { p_brand_id: b.id }).then(({ data: l }: any) => l as BrandLevel | null)));
  return brands.flatMap((b, i) => (levels[i] ? [{ ...b, level: levels[i]! }] : []));
}

export function Stars({ n, size = "h-4 w-4" }: { n: number | null; size?: string }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={n ? `${n} out of 5 stars` : "No rating"}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={cn(size, n && i <= n ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40")} />
      ))}
    </span>
  );
}

export function Avatar({ name, url }: { name: string | null; url: string | null }) {
  const [broken, setBroken] = useState(false);
  const initial = (name ?? "?").trim().charAt(0).toUpperCase() || "?";
  if (url && !broken) {
    return <img src={url} alt="" referrerPolicy="no-referrer" onError={() => setBroken(true)} className="h-10 w-10 shrink-0 rounded-full object-cover" />;
  }
  return <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/15 text-base font-semibold text-primary">{initial}</span>;
}

const tone = {
  green: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  amber: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  red: "bg-red-500/15 text-red-600 dark:text-red-400",
  blue: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
  grey: "bg-muted text-muted-foreground",
} as const;

export function Chip({ children, t = "grey", title }: { children: React.ReactNode; t?: keyof typeof tone; title?: string }) {
  return (
    <span title={title} className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-sm font-medium", tone[t])}>
      {children}
    </span>
  );
}

export function relTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.round(s / 60); if (m < 60) return `${m} minute${m === 1 ? "" : "s"} ago`;
  const h = Math.round(m / 60); if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const d = Math.round(h / 24); if (d < 7) return `${d} day${d === 1 ? "" : "s"} ago`;
  const w = Math.round(d / 7); if (d < 30) return `${w} week${w === 1 ? "" : "s"} ago`;
  const mo = Math.round(d / 30.4); if (mo < 12) return `${mo} month${mo === 1 ? "" : "s"} ago`;
  const y = Math.round(d / 365); return `${y} year${y === 1 ? "" : "s"} ago`;
}

export const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

/** What each connection state means, in words a person can act on. */
export const STATE_COPY: Record<ConnectionState, { label: string; t: keyof typeof tone; text: string }> = {
  not_configured: { label: "Waiting for Google setup", t: "amber", text: "The Google OAuth client hasn't been added to Polaris yet. Once it is, an admin can connect the Google account that manages the three listings." },
  not_connected: { label: "Not connected", t: "grey", text: "No Google account is connected yet. An admin connects the account that manages the JLS listings in Reviews → Setup." },
  reconnect: { label: "Reconnect needed", t: "red", text: "Google no longer accepts Polaris's sign-in. An admin needs to reconnect the Google account in Reviews → Setup." },
  waiting: { label: "Waiting for Google approval", t: "amber", text: "The Google account is connected, but Google hasn't approved Polaris's access to the Business Profile API yet. Reviews will appear here once it does — nothing else to do." },
  error: { label: "Problem talking to Google", t: "red", text: "The last request to Google failed." },
  connected: { label: "Connected", t: "green", text: "" },
};

/** One line at the top of the Inbox / Summary when Google isn't fully working. */
export function ConnectionBanner({ status }: { status: ReviewsStatus | null }) {
  if (!status || status.state === "connected") return null;
  const c = STATE_COPY[status.state];
  const Icon = status.state === "waiting" || status.state === "not_configured" ? Clock
    : status.state === "not_connected" ? PlugZap : status.state === "reconnect" ? KeyRound : AlertTriangle;
  return (
    <div className={cn("flex items-start gap-3 rounded-xl border p-4 text-sm",
      c.t === "red" ? "border-red-500/30 bg-red-500/5" : c.t === "amber" ? "border-amber-500/30 bg-amber-500/5" : "border-border bg-muted/30")}>
      <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", c.t === "red" ? "text-red-500" : c.t === "amber" ? "text-amber-500" : "text-muted-foreground")} />
      <div>
        <p className="font-medium text-foreground">{c.label}</p>
        <p className="text-muted-foreground">{status.state === "error" && status.error ? status.error.message : c.text}</p>
      </div>
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-border p-10 text-center">
      <p className="text-base font-medium">{title}</p>
      {children && <div className="mt-1 text-sm text-muted-foreground">{children}</div>}
    </div>
  );
}

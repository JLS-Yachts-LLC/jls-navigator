/**
 * Summary — for each brand: Google's average and count, how many reviews still
 * need a reply, and a 12-month trend of new reviews and their average rating.
 */
import { useEffect, useMemo, useState } from "react";
import { Loader2, ExternalLink, Copy } from "lucide-react";
import { toast } from "sonner";
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { db, Stars, Chip, ConnectionBanner, relTime, type MyBrand, type ReviewsStatus } from "./rv-common";

interface Row { brand_id: string; star_rating: number | null; created_on_google: string | null; reply_text: string | null }

const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

export function RvSummary({ brands, status }: { brands: MyBrand[]; status: ReviewsStatus | null }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [brandId, setBrandId] = useState("all");

  useEffect(() => {
    void db().from("reviews").select("brand_id, star_rating, created_on_google, reply_text").is("removed_at", null).range(0, 4999)
      .then(({ data }: any) => setRows((data ?? []) as Row[]));
  }, []);

  const trend = useMemo(() => {
    const months: { key: string; label: string; count: number; sum: number; rated: number }[] = [];
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({ key: monthKey(d), label: d.toLocaleString(undefined, { month: "short", year: "2-digit" }), count: 0, sum: 0, rated: 0 });
    }
    const byKey = new Map(months.map((m) => [m.key, m]));
    for (const r of rows ?? []) {
      if (brandId !== "all" && r.brand_id !== brandId) continue;
      if (!r.created_on_google) continue;
      const m = byKey.get(monthKey(new Date(r.created_on_google)));
      if (!m) continue;
      m.count++;
      if (r.star_rating) { m.sum += r.star_rating; m.rated++; }
    }
    return months.map((m) => ({ month: m.label, reviews: m.count, rating: m.rated ? Math.round((m.sum / m.rated) * 100) / 100 : null }));
  }, [rows, brandId]);

  if (rows === null) return <div className="grid place-items-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4">
      <ConnectionBanner status={status} />

      <div className="grid gap-3 md:grid-cols-3">
        {brands.map((b) => {
          const mine = rows.filter((r) => r.brand_id === b.id);
          const unanswered = mine.filter((r) => !r.reply_text).length;
          const rated = mine.filter((r) => r.star_rating);
          const avg = b.average_rating ?? (rated.length ? rated.reduce((s, r) => s + (r.star_rating ?? 0), 0) / rated.length : null);
          const total = b.total_reviews ?? mine.length;
          return (
            <div key={b.id} className="rounded-xl border border-border bg-card p-4">
              <p className="text-base font-medium">{b.name}</p>
              {b.location_title && b.location_title !== b.name && <p className="text-sm text-muted-foreground">{b.location_title}</p>}
              <div className="mt-3 flex items-end gap-3">
                <span className="font-display text-[32px] font-bold leading-none">{avg != null ? Number(avg).toFixed(1) : "—"}</span>
                <div className="pb-0.5">
                  <Stars n={avg != null ? Math.round(Number(avg)) : null} />
                  <p className="text-sm text-muted-foreground">{total} review{total === 1 ? "" : "s"} on Google</p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {unanswered > 0 ? <Chip t="amber">{unanswered} need{unanswered === 1 ? "s" : ""} a reply</Chip> : mine.length > 0 ? <Chip t="green">All answered</Chip> : null}
                {!b.google_location && <Chip>Not linked to Google</Chip>}
                {b.last_sync_error && <Chip t="red" title={b.last_sync_error}>Last sync failed</Chip>}
              </div>
              <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-sm">
                {b.maps_url && (
                  <a href={b.maps_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                    <ExternalLink className="h-4 w-4" /> Listing
                  </a>
                )}
                {b.new_review_url && (
                  <button className="inline-flex items-center gap-1 text-primary hover:underline"
                    onClick={() => { void navigator.clipboard.writeText(b.new_review_url!); toast.success("Review link copied — send it to happy clients"); }}>
                    <Copy className="h-4 w-4" /> Copy "leave a review" link
                  </button>
                )}
              </div>
              {b.last_synced_at && <p className="mt-2 text-sm text-muted-foreground">Updated {relTime(b.last_synced_at)}</p>}
            </div>
          );
        })}
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <p className="text-base font-medium">Last 12 months</p>
          {brands.length > 1 && (
            <select value={brandId} onChange={(e) => setBrandId(e.target.value)}
              className="ml-auto h-9 rounded-md border border-border bg-background px-2.5 text-sm" aria-label="Brand">
              <option value="all">All brands</option>
              {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          )}
        </div>
        {rows.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">The trend fills in once reviews start coming in from Google.</p>
        ) : (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={trend} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 14, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} />
                <YAxis yAxisId="n" allowDecimals={false} tick={{ fontSize: 14, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} />
                <YAxis yAxisId="r" orientation="right" domain={[1, 5]} ticks={[1, 2, 3, 4, 5]} tick={{ fontSize: 14, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 14 }}
                  formatter={(v: any, name: any) => (name === "Average rating" ? (v == null ? "—" : `${v}★`) : v)} />
                <Legend wrapperStyle={{ fontSize: 14 }} />
                <Bar yAxisId="n" dataKey="reviews" name="New reviews" fill="var(--primary)" fillOpacity={0.35} radius={[4, 4, 0, 0]} />
                <Line yAxisId="r" dataKey="rating" name="Average rating" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} connectNulls />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}

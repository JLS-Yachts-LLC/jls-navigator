/**
 * Communications → Reviews. Google reviews for each JLS brand (JLS Yacht
 * Training Institute, JLS Yachts, Superyacht ME), read and answered from
 * Polaris through the Google Business Profile API.
 *
 * Access is per brand (review_brand_level): the Reviews permission covers every
 * brand (view = read, edit = reply); a per-brand grant in Setup covers one.
 * Replies are public — nothing is posted unless a person presses Post.
 */
import { useCallback, useEffect, useState } from "react";
import { Inbox, BarChart3, Gauge } from "lucide-react";
import { useAccess } from "@/lib/auth/useAccess";
import { useUserPreference } from "@/lib/user-preferences";
import { cn } from "@/lib/utils";
import { loadMyBrands, rvApi, db, type MyBrand, type ReviewsStatus } from "./rv-common";
import { RvInbox } from "./rv-inbox";
import { RvSummary } from "./rv-summary";
import { RvSetup } from "./rv-setup";

const TABS = [
  { key: "inbox", label: "Inbox", icon: Inbox },
  { key: "summary", label: "Summary", icon: BarChart3 },
  { key: "setup", label: "Setup", icon: Gauge },
] as const;
type Tab = (typeof TABS)[number]["key"];

export function ReviewsHub() {
  const { isGlobalAdmin, loading } = useAccess();
  const [savedTab, setTab] = useUserPreference<string>("reviews.tab", "inbox", { key: "polaris.reviews.tab", parse: (raw) => raw });
  const [brands, setBrands] = useState<MyBrand[] | null>(null);
  const [status, setStatus] = useState<ReviewsStatus | null>(null);
  const [unanswered, setUnanswered] = useState(0);

  const loadBrands = useCallback(() => loadMyBrands().then(setBrands).catch(() => setBrands([])), []);
  const loadUnanswered = useCallback(() => {
    void db().from("reviews").select("id", { count: "exact", head: true }).is("reply_text", null).is("removed_at", null)
      .then(({ count }: any) => setUnanswered(count ?? 0));
  }, []);

  useEffect(() => {
    void loadBrands();
    loadUnanswered();
    void rvApi<ReviewsStatus>("status").then(setStatus).catch(() => setStatus(null));
  }, [loadBrands, loadUnanswered]);

  if (loading || brands === null) return null;
  if (brands.length === 0 && !isGlobalAdmin) {
    return <div className="p-8 text-base text-muted-foreground">You don't have access to Reviews. An admin can give you a brand in Reviews → Setup.</div>;
  }

  const tabs = isGlobalAdmin ? TABS : TABS.filter((t) => t.key !== "setup");
  const tab: Tab = tabs.some((t) => t.key === savedTab) ? (savedTab as Tab) : "inbox";
  const canReplyAny = brands.some((b) => b.level === "reply");

  return (
    <div className="space-y-4 p-6">
      <div>
        <h1 className="font-display text-[28px] font-bold leading-tight">Reviews</h1>
        <p className="text-sm text-muted-foreground">
          Google reviews for {brands.length ? brands.map((b) => b.name).join(", ") : "each JLS brand"} — read them and reply from Polaris.
          {!canReplyAny && brands.length > 0 && " You have read-only access."}
        </p>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-border">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key)}
            className={cn("-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-[15px]",
              tab === key ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
            <Icon className="h-4 w-4" /> {label}
            {key === "inbox" && unanswered > 0 && (
              <span className="grid h-5 min-w-5 place-items-center rounded-full bg-amber-500 px-1.5 text-sm font-semibold text-white">{unanswered}</span>
            )}
          </button>
        ))}
      </div>

      {tab === "inbox" && <RvInbox brands={brands} status={status} onChanged={loadUnanswered} />}
      {tab === "summary" && <RvSummary brands={brands} status={status} />}
      {tab === "setup" && isGlobalAdmin && (
        <RvSetup status={status} onStatus={setStatus} onBrandsChanged={() => { void loadBrands(); loadUnanswered(); }} />
      )}
    </div>
  );
}

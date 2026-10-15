/**
 * Inbox — every Google review for the brands this person can see, newest first,
 * laid out like Google's own cards. Reply-level people can answer, edit or
 * remove the public reply; every post needs a confirm step, and an AI draft
 * only ever fills the box — a person still presses Post.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Sparkles, MessageSquareReply, Pencil, Trash2, Search, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import {
  db, rvApi, Stars, Avatar, Chip, Empty, ConnectionBanner, relTime, fmtDate,
  type MyBrand, type Review, type ReviewsStatus,
} from "./rv-common";

const REPLY_MAX_BYTES = 4096;
type StarFilter = "all" | "low" | "1" | "2" | "3" | "4" | "5";
type Sort = "newest" | "oldest" | "lowest";

export function RvInbox({ brands, status, onChanged }: { brands: MyBrand[]; status: ReviewsStatus | null; onChanged: () => void }) {
  const [reviews, setReviews] = useState<Review[] | null>(null);
  const [people, setPeople] = useState<Map<string, string>>(new Map());
  const [brandId, setBrandId] = useState<string>("all");
  const [stars, setStars] = useState<StarFilter>("all");
  const [needsReply, setNeedsReply] = useState(false);
  const [sort, setSort] = useState<Sort>("newest");
  const [term, setTerm] = useState("");

  const load = useCallback(async () => {
    const { data } = await db().from("reviews").select("*").is("removed_at", null)
      .order("created_on_google", { ascending: false, nullsFirst: false }).range(0, 1999);
    const rows = (data ?? []) as Review[];
    setReviews(rows);
    const ids = [...new Set(rows.map((r) => r.replied_by).filter(Boolean))] as string[];
    if (ids.length) {
      const { data: ps } = await db().from("profiles").select("id, display_name").in("id", ids);
      setPeople(new Map(((ps ?? []) as any[]).map((p) => [p.id, p.display_name ?? "a colleague"])));
    }
  }, []);
  useEffect(() => { void load(); }, [load]);
  // New reviews arrive every 15 minutes; pick them up while the tab is open.
  useEffect(() => {
    const t = setInterval(() => { if (!document.hidden) void load(); }, 120_000);
    return () => clearInterval(t);
  }, [load]);

  const brandById = useMemo(() => new Map(brands.map((b) => [b.id, b])), [brands]);

  const shown = useMemo(() => {
    const q = term.trim().toLowerCase();
    const list = (reviews ?? []).filter((r) =>
      brandById.has(r.brand_id)
      && (brandId === "all" || r.brand_id === brandId)
      && (stars === "all" || (stars === "low" ? (r.star_rating ?? 0) <= 2 : r.star_rating === Number(stars)))
      && (!needsReply || !r.reply_text)
      && (!q || `${r.reviewer_name ?? ""} ${r.comment ?? ""} ${r.reply_text ?? ""}`.toLowerCase().includes(q)));
    const t = (r: Review) => (r.created_on_google ? new Date(r.created_on_google).getTime() : 0);
    return list.sort((a, b) => sort === "oldest" ? t(a) - t(b)
      : sort === "lowest" ? (a.star_rating ?? 9) - (b.star_rating ?? 9) || t(b) - t(a)
      : t(b) - t(a));
  }, [reviews, brandById, brandId, stars, needsReply, sort, term]);

  const unanswered = (reviews ?? []).filter((r) => brandById.has(r.brand_id) && !r.reply_text).length;

  function patch(id: string, p: Partial<Review>) {
    setReviews((rs) => (rs ?? []).map((r) => (r.id === id ? { ...r, ...p } : r)));
    onChanged();
  }

  if (reviews === null) return <div className="grid place-items-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  const select = "h-9 rounded-md border border-border bg-background px-2.5 text-sm";
  return (
    <div className="space-y-4">
      <ConnectionBanner status={status} />

      <div className="flex flex-wrap items-center gap-2">
        {brands.length > 1 && (
          <select value={brandId} onChange={(e) => setBrandId(e.target.value)} className={select} aria-label="Brand">
            <option value="all">All brands</option>
            {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        )}
        <select value={stars} onChange={(e) => setStars(e.target.value as StarFilter)} className={select} aria-label="Stars">
          <option value="all">All ratings</option>
          <option value="low">1–2 stars</option>
          {[5, 4, 3, 2, 1].map((n) => <option key={n} value={String(n)}>{n} star{n === 1 ? "" : "s"}</option>)}
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className={select} aria-label="Sort">
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="lowest">Lowest rating first</option>
        </select>
        <button onClick={() => setNeedsReply((v) => !v)}
          className={cn("inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm",
            needsReply ? "border-primary bg-primary/10 font-medium text-primary" : "border-border text-muted-foreground hover:text-foreground")}>
          Needs reply {unanswered > 0 && <span className="rounded-full bg-amber-500/20 px-1.5 text-amber-600 dark:text-amber-400">{unanswered}</span>}
        </button>
        <div className="relative ml-auto">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Search reviews"
            className="h-9 w-56 rounded-md border border-border bg-background pl-8 pr-2.5 text-sm" />
        </div>
      </div>

      {shown.length === 0 ? (
        <Empty title={reviews.length === 0 ? "No reviews yet" : "Nothing matches these filters"}>
          {reviews.length === 0
            ? status?.state === "connected"
              ? "Reviews appear here within 15 minutes of a brand being linked to its Google listing."
              : "Reviews will appear here once Google is connected and each brand is linked to its listing."
            : "Try another brand, rating or search."}
        </Empty>
      ) : (
        <ul className="space-y-3">
          {shown.map((r) => (
            <ReviewCard key={r.id} review={r} brand={brandById.get(r.brand_id)!} showBrand={brands.length > 1}
              replierName={r.replied_by ? people.get(r.replied_by) ?? null : null}
              canPost={status?.state === "connected" || status?.state === "error"} onPatched={(p) => patch(r.id, p)} />
          ))}
        </ul>
      )}
    </div>
  );
}

type Confirm = { kind: "post" | "edit" | "remove" } | null;

function ReviewCard({ review: r, brand, showBrand, replierName, canPost, onPatched }: {
  review: Review; brand: MyBrand; showBrand: boolean; replierName: string | null; canPost: boolean;
  onPatched: (p: Partial<Review>) => void;
}) {
  const canReply = brand.level === "reply";
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [guidance, setGuidance] = useState("");
  const [busy, setBusy] = useState<"draft" | "post" | "remove" | null>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [expanded, setExpanded] = useState(false);

  const bytes = new TextEncoder().encode(text.trim()).length;
  const tooLong = bytes > REPLY_MAX_BYTES;
  const name = r.reviewer_anonymous ? "A Google user" : r.reviewer_name ?? "A Google user";
  const comment = r.comment ?? "";
  const long = comment.length > 600;

  function startReply() {
    setText(r.reply_text ?? "");
    setGuidance("");
    setOpen(true);
  }

  async function draft() {
    setBusy("draft");
    try {
      const out = await rvApi<{ text: string }>("draft", { review_id: r.id, guidance: guidance || undefined });
      setText(out.text);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't draft a reply");
    } finally {
      setBusy(null);
    }
  }

  async function post() {
    setBusy("post");
    try {
      const out = await rvApi<{ reply_text: string; reply_updated_at: string | null }>("reply", { review_id: r.id, text: text.trim() });
      onPatched({ reply_text: out.reply_text, reply_updated_at: out.reply_updated_at ?? new Date().toISOString() });
      toast.success(r.reply_text ? "Reply updated on Google" : "Reply posted on Google");
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't post the reply");
    } finally {
      setBusy(null);
      setConfirm(null);
    }
  }

  async function remove() {
    setBusy("remove");
    try {
      await rvApi("reply/remove", { review_id: r.id });
      onPatched({ reply_text: null, reply_updated_at: null, replied_by: null });
      toast.success("Reply removed from Google");
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't remove the reply");
    } finally {
      setBusy(null);
      setConfirm(null);
    }
  }

  return (
    <li className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start gap-3">
        <Avatar name={name} url={r.reviewer_photo_url} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-base font-medium">{name}</span>
            {showBrand && <Chip>{brand.name}</Chip>}
            {!r.reply_text && <Chip t="amber">Needs reply</Chip>}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Stars n={r.star_rating} />
            <span title={fmtDate(r.created_on_google)}>{relTime(r.created_on_google)}</span>
            {r.updated_on_google && r.created_on_google && new Date(r.updated_on_google).getTime() - new Date(r.created_on_google).getTime() > 60_000 && !r.reply_text && (
              <span title={fmtDate(r.updated_on_google)}>· edited</span>
            )}
          </div>
          {comment ? (
            <p className="mt-2 whitespace-pre-wrap text-base leading-relaxed">
              {long && !expanded ? `${comment.slice(0, 600)}…` : comment}
              {long && (
                <button onClick={() => setExpanded((v) => !v)} className="ml-1 text-sm font-medium text-primary hover:underline">
                  {expanded ? "Less" : "More"}
                </button>
              )}
            </p>
          ) : (
            <p className="mt-2 text-sm italic text-muted-foreground">Rating only — no comment.</p>
          )}

          {r.reply_text && !open && (
            <div className="mt-3 rounded-lg border-l-2 border-primary/50 bg-muted/40 px-3 py-2">
              <p className="text-sm font-medium">
                Response from the owner
                <span className="font-normal text-muted-foreground">
                  {" · "}<span title={fmtDate(r.reply_updated_at)}>{relTime(r.reply_updated_at)}</span>
                  {replierName ? ` · by ${replierName} in Polaris` : r.replied_by ? "" : " · on Google"}
                </span>
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{r.reply_text}</p>
            </div>
          )}

          {canReply && !open && (
            <div className="mt-3 flex flex-wrap gap-2">
              {r.reply_text ? (
                <>
                  <Button size="sm" variant="outline" className="gap-1.5" onClick={startReply}><Pencil className="h-4 w-4" /> Edit reply</Button>
                  <Button size="sm" variant="ghost" className="gap-1.5 text-muted-foreground hover:text-red-500" disabled={!!busy}
                    onClick={() => setConfirm({ kind: "remove" })}>
                    <Trash2 className="h-4 w-4" /> Remove reply
                  </Button>
                </>
              ) : (
                <Button size="sm" variant="outline" className="gap-1.5" onClick={startReply}><MessageSquareReply className="h-4 w-4" /> Reply</Button>
              )}
              {brand.maps_url && (
                <a href={brand.maps_url} target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-1 px-2 text-sm text-muted-foreground hover:text-foreground">
                  <ExternalLink className="h-4 w-4" /> On Google
                </a>
              )}
            </div>
          )}

          {open && (
            <div className="mt-3 space-y-2 rounded-lg border border-border p-3">
              <p className="text-sm text-muted-foreground">
                Your reply is public — it appears under this review on {brand.name}'s Google listing.
              </p>
              <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} placeholder="Write a reply…" className="text-base" />
              <div className="flex flex-wrap items-center gap-2">
                <input value={guidance} onChange={(e) => setGuidance(e.target.value)}
                  placeholder="Optional note for the AI, e.g. “mention we've changed the booking process”"
                  className="h-9 min-w-[240px] flex-1 rounded-md border border-border bg-background px-2.5 text-sm" />
                <Button size="sm" variant="outline" className="gap-1.5" disabled={!!busy} onClick={() => void draft()}>
                  {busy === "draft" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Draft with AI
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className={cn("text-sm", tooLong ? "text-red-500" : "text-muted-foreground")}>
                  {text.trim().length.toLocaleString()} characters{tooLong ? " — too long for Google" : ""}
                </span>
                <div className="ml-auto flex gap-2">
                  <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => setOpen(false)}>Cancel</Button>
                  <Button size="sm" disabled={!text.trim() || tooLong || !!busy || !canPost || text.trim() === (r.reply_text ?? "").trim()}
                    title={canPost ? undefined : "Google isn't connected yet"}
                    onClick={() => setConfirm({ kind: r.reply_text ? "edit" : "post" })}>
                    {r.reply_text ? "Update reply" : "Post reply"}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <AlertDialog open={!!confirm} onOpenChange={(o) => { if (!o && !busy) setConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm?.kind === "remove" ? "Remove this reply from Google?" : confirm?.kind === "edit" ? "Update the public reply?" : "Post this reply on Google?"}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                {confirm?.kind === "remove" ? (
                  <p>The owner's response under {name}'s review on {brand.name}'s Google listing will be deleted for everyone.</p>
                ) : (
                  <>
                    <p>Anyone can see it under {name}'s review on {brand.name}'s Google listing.</p>
                    <p className="max-h-48 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-muted/40 p-2 text-foreground">{text.trim()}</p>
                  </>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={!!busy}
              className={confirm?.kind === "remove" ? "bg-red-600 text-white hover:bg-red-700" : undefined}
              onClick={(e) => { e.preventDefault(); void (confirm?.kind === "remove" ? remove() : post()); }}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : confirm?.kind === "remove" ? "Remove reply" : confirm?.kind === "edit" ? "Update on Google" : "Post on Google"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  );
}

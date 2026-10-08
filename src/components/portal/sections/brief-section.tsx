/**
 * Today's brief (Agency with JLS). Opens on Today — what's happening on board,
 * what needs the vessel and the week ahead — with "This month", the owner's
 * monthly summary: one month of the vessel, written for the
 * owner: the agent's note, what was spent and where, compliance, what
 * happened, and the next 30 days. Everything but the note is live from the
 * vessel's records (/api/portal/brief). The note is written by JLS: in staff
 * preview it can be drafted and published right here, next to the figures it
 * describes; clients only ever see a published one.
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { portalFetch } from "@/lib/portal/portal-fetch";
import { cn } from "@/lib/utils";
import { BookOpen, Download, Loader2, PenLine } from "lucide-react";
import { SectionCard, SectionEmpty, SectionLoading } from "./section-ui";

const db = supabase as any;

type Brief = {
  vessel: string; month: string; monthToDate: boolean;
  months: Array<{ key: string; current: boolean; hasNote: boolean }>;
  note: { headline: string | null; summary: string | null; authorName: string | null; authorTitle: string | null; publishedAt: string | null; updatedAt: string } | null;
  spend: null | { linked: false } | {
    linked: true; currency: string; month: number; invoiceCount: number; previousMonth: number; yearToDate: number;
    categories: Array<{ label: string; amount: number }>;
  };
  compliance: { total: number; inDate: number; expired: Array<{ date: string; title: string }>; permits: number; visas: number; passports: number; cruisingPermit: string | null };
  timeline: Array<{ date: string; title: string; detail: string | null; kind: string }>;
  ahead: {
    expiring: Array<{ date: string; title: string; kind: string }>;
    charters: Array<{ start: string; end: string | null; title: string; from: string | null; to: string | null; guests: number | null }>;
    awaitingDecision: Array<{ docNumber: string | null; date: string | null; total: number; currency: string }>;
    openRequests: Array<{ reference: string | null; title: string; status: string; createdAt: string }>;
  };
};

const monthName = (k: string, withYear = true) =>
  new Date(`${k}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", ...(withYear ? { year: "numeric" } : {}), timeZone: "UTC" });
const day = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const money = (n: number) => n.toLocaleString("en-GB", { maximumFractionDigits: 0 });
const display = { fontFamily: "var(--pds-font-display)" } as const;

function Label({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("text-[10px] font-semibold uppercase tracking-[0.22em] text-primary", className)}>{children}</div>;
}

function Figure({ label, value, note, tone }: { label: string; value: React.ReactNode; note?: React.ReactNode; tone?: "good" | "warn" }) {
  return (
    <div className="min-w-0 border-t border-border pt-3">
      <Label className="text-muted-foreground">{label}</Label>
      <div className="mt-1.5 truncate text-[28px] leading-none tabular-nums" style={display}>{value}</div>
      {note && <div className={cn("mt-1.5 text-xs", tone === "good" ? "text-emerald-300" : tone === "warn" ? "text-amber-300" : "text-muted-foreground")}>{note}</div>}
    </div>
  );
}

/** Today's date in Dubai, as YYYY-MM-DD. */
const dubaiDay = (offsetDays = 0) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai" }).format(new Date(Date.now() + offsetDays * 86400000));

/**
 * The brief opens on Today — what's happening on board, what needs the vessel,
 * and the week ahead. "This month" is the owner's monthly summary, unchanged.
 */
export function BriefSection(props: {
  yachtId: string; preview: boolean; onOpen: (tab: "balances" | "invoices" | "requests" | "calendar") => void;
}) {
  const [view, setView] = useState<"today" | "month">("today");
  return (
    <div className="space-y-6">
      <div className="inline-flex rounded-xl border border-border bg-background/40 p-1 text-sm">
        {(["today", "month"] as const).map((v) => (
          <button key={v} type="button" onClick={() => setView(v)}
                  className={cn("rounded-lg px-4 py-1.5 font-medium transition", view === v ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground")}>
            {v === "today" ? "Today" : "This month"}
          </button>
        ))}
      </div>
      {view === "today" ? <TodayBrief {...props} onSeeMonth={() => setView("month")} /> : <MonthBrief {...props} />}
    </div>
  );
}

function TodayBrief({ onOpen, onSeeMonth }: {
  yachtId: string; preview: boolean; onOpen: (tab: "balances" | "invoices" | "requests" | "calendar") => void; onSeeMonth: () => void;
}) {
  const [brief, setBrief] = useState<Brief | null>(null);
  const [extra, setExtra] = useState<Brief["timeline"]>([]);
  const [error, setError] = useState<string | null>(null);
  const today = dubaiDay();
  const yesterday = dubaiDay(-1);
  const weekEnd = dubaiDay(7);

  useEffect(() => {
    void (async () => {
      try {
        const res = await portalFetch(`/api/portal/brief?month=${today.slice(0, 7)}`);
        const j = await res.json();
        if (!res.ok) throw new Error(j.error ?? "Today's brief could not be prepared.");
        setBrief(j);
        // On the 1st, "since yesterday" reaches back into last month.
        if (yesterday.slice(0, 7) !== today.slice(0, 7)) {
          const prev = await portalFetch(`/api/portal/brief?month=${yesterday.slice(0, 7)}`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
          if (prev?.timeline) setExtra(prev.timeline);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Today's brief could not be prepared.");
      }
    })();
  }, [today, yesterday]);

  if (error && !brief) return <SectionEmpty icon={BookOpen} message={error} />;
  if (!brief) return <SectionLoading />;

  const b = brief;
  const timeline = [...extra, ...b.timeline];
  const recent = timeline.filter((t) => t.date === today || t.date === yesterday).sort((x, y) => y.date.localeCompare(x.date));
  const upcomingEvents = timeline.filter((t) => t.date > today && t.date <= weekEnd);
  const expiredNow = b.compliance.expired;
  const dueThisWeek = b.ahead.expiring.filter((e) => e.date >= today && e.date <= weekEnd);
  const chartersSoon = b.ahead.charters.filter((c) => c.start <= weekEnd);
  const attention = expiredNow.length + dueThisWeek.length + b.ahead.awaitingDecision.length;
  const spend = b.spend && b.spend.linked ? b.spend : null;
  const compliancePct = b.compliance.total ? Math.round((b.compliance.inDate / b.compliance.total) * 100) : null;
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dubai", hour: "2-digit", hourCycle: "h23" }).format(new Date()));
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const longDay = new Date(`${today}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
  const when = (d: string) => (d === today ? "Today" : d === yesterday ? "Yesterday" : day(d));

  return (
    <div className="space-y-8">
      {/* Masthead */}
      <div className="border-b border-border pb-4">
        <Label>Today's brief</Label>
        <h1 className="mt-2 text-3xl leading-tight sm:text-[40px]">{greeting}.</h1>
        <p className="mt-1 text-sm text-muted-foreground">{b.vessel} · {longDay}</p>
        <p className={cn("mt-3 text-[15px]", attention ? "text-amber-300" : "text-emerald-300")}>
          {attention
            ? `${attention} thing${attention === 1 ? "" : "s"} need${attention === 1 ? "s" : ""} attention — see below.`
            : "Nothing needs you today — everything is in date and nothing is waiting on you."}
        </p>
      </div>

      {/* Figures */}
      <section className="grid grid-cols-2 gap-x-6 gap-y-5 lg:grid-cols-4">
        <Figure label="Compliance" value={compliancePct == null ? "—" : `${compliancePct}%`}
                note={expiredNow.length ? `${expiredNow.length} expired — JLS is on it` : b.compliance.total ? "All in date" : "Nothing tracked yet"}
                tone={expiredNow.length ? "warn" : b.compliance.total ? "good" : undefined} />
        <Figure label="Due this week" value={dueThisWeek.length} note={dueThisWeek.length ? `next: ${dueThisWeek[0].title}` : "No renewals in the next 7 days"}
                tone={dueThisWeek.length ? "warn" : "good"} />
        <Figure label="In hand with JLS" value={b.ahead.openRequests.length} note={`open request${b.ahead.openRequests.length === 1 ? "" : "s"}`} />
        {spend ? (
          <Figure label={`Spend · ${monthName(b.month, false)} so far`} value={<>{spend.currency} {money(spend.month)}</>}
                  note={`${spend.invoiceCount} invoice${spend.invoiceCount === 1 ? "" : "s"}`} />
        ) : (
          <Figure label="Cruising permit" value={b.compliance.cruisingPermit ? day(b.compliance.cruisingPermit) : "—"}
                  note={b.compliance.cruisingPermit ? `valid to ${new Date(`${b.compliance.cruisingPermit}T00:00:00Z`).getUTCFullYear()}` : "Not on file"} />
        )}
      </section>

      {/* Needs attention */}
      {attention > 0 && (
        <section>
          <div className="border-b border-border pb-2"><h2 className="text-xl">Needs attention</h2></div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {(expiredNow.length > 0 || dueThisWeek.length > 0) && (
              <SectionCard className="border-amber-500/40 p-4">
                <Label>Papers</Label>
                {expiredNow.slice(0, 5).map((e, i) => (
                  <div key={`x${i}`} className="mt-2 flex items-baseline justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate">{e.title}</span>
                    <span className="shrink-0 text-xs tabular-nums text-red-300">expired {day(e.date)}</span>
                  </div>
                ))}
                {dueThisWeek.slice(0, 5).map((e, i) => (
                  <div key={`d${i}`} className="mt-2 flex items-baseline justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate">{e.title}</span>
                    <span className="shrink-0 text-xs tabular-nums text-amber-300">{when(e.date)}</span>
                  </div>
                ))}
                <button type="button" onClick={() => onOpen("calendar")} className="mt-3 text-xs font-medium text-primary hover:underline">Compliance calendar ›</button>
              </SectionCard>
            )}
            {b.ahead.awaitingDecision.length > 0 && (
              <SectionCard className="border-primary/40 p-4">
                <Label>Awaiting your decision</Label>
                {b.ahead.awaitingDecision.slice(0, 4).map((q, i) => (
                  <div key={i} className="mt-2 flex items-baseline justify-between gap-2 text-sm">
                    <span>Quotation {q.docNumber ?? ""}</span>
                    <span className="tabular-nums">{q.currency} {money(q.total)}</span>
                  </div>
                ))}
                <button type="button" onClick={() => onOpen("invoices")} className="mt-3 text-xs font-medium text-primary hover:underline">Review quotations ›</button>
              </SectionCard>
            )}
          </div>
        </section>
      )}

      <div className="grid gap-8 lg:grid-cols-2">
        {/* Today & yesterday */}
        <section>
          <div className="border-b border-border pb-2"><h2 className="text-xl">Today & since yesterday</h2></div>
          {recent.length === 0 && !chartersSoon.some((c) => c.start === today) ? (
            <p className="mt-4 text-sm text-muted-foreground">Nothing new on the record since yesterday.</p>
          ) : (
            <ol className="mt-2">
              {chartersSoon.filter((c) => c.start === today).map((c, i) => (
                <li key={`c${i}`} className="grid grid-cols-[72px_minmax(0,1fr)] gap-3 border-b border-border/50 py-2.5">
                  <span className="pt-0.5 text-xs text-muted-foreground">Today</span>
                  <span className="text-sm font-medium">Charter begins · {c.title}</span>
                </li>
              ))}
              {recent.map((t, i) => (
                <li key={i} className="grid grid-cols-[72px_minmax(0,1fr)] gap-3 border-b border-border/50 py-2.5 last:border-0">
                  <span className="pt-0.5 text-xs text-muted-foreground">{when(t.date)}</span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{t.title}</span>
                    {t.detail && <span className="block text-xs text-muted-foreground">{t.detail}</span>}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>

        {/* The week ahead */}
        <section>
          <div className="border-b border-border pb-2"><h2 className="text-xl">The next 7 days</h2></div>
          {upcomingEvents.length === 0 && chartersSoon.filter((c) => c.start > today).length === 0 && dueThisWeek.filter((e) => e.date > today).length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">A clear week — nothing planned or due.</p>
          ) : (
            <ol className="mt-2">
              {[
                ...upcomingEvents.map((t) => ({ date: t.date, title: t.title, detail: t.detail })),
                ...chartersSoon.filter((c) => c.start > today).map((c) => ({ date: c.start, title: `Charter · ${c.title}`, detail: [c.from, c.guests ? `${c.guests} guests` : null].filter(Boolean).join(" · ") || null })),
                ...dueThisWeek.filter((e) => e.date > today).map((e) => ({ date: e.date, title: `${e.title} expires`, detail: "JLS is tracking the renewal" })),
              ].sort((x, y) => x.date.localeCompare(y.date)).map((t, i) => (
                <li key={i} className="grid grid-cols-[72px_minmax(0,1fr)] gap-3 border-b border-border/50 py-2.5 last:border-0">
                  <span className="pt-0.5 text-xs tabular-nums text-muted-foreground">{new Date(`${t.date}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", timeZone: "UTC" })}</span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{t.title}</span>
                    {t.detail && <span className="block text-xs text-muted-foreground">{t.detail}</span>}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      {/* In hand with JLS */}
      {b.ahead.openRequests.length > 0 && (
        <section>
          <div className="border-b border-border pb-2"><h2 className="text-xl">In hand with JLS</h2></div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {b.ahead.openRequests.slice(0, 6).map((r, i) => (
              <div key={i} className="rounded-xl border border-border/60 px-3 py-2 text-sm">
                <div className="truncate font-medium">{r.title}</div>
                <div className="text-xs text-muted-foreground">{r.reference ? `${r.reference} · ` : ""}{r.status.replace(/_/g, " ")}</div>
              </div>
            ))}
          </div>
          <button type="button" onClick={() => onOpen("requests")} className="mt-3 text-xs font-medium text-primary hover:underline">
            {b.ahead.openRequests.length > 6 ? `All ${b.ahead.openRequests.length} requests ›` : "Requests ›"}
          </button>
        </section>
      )}

      <div className="flex justify-end">
        <button type="button" onClick={onSeeMonth} className="text-sm font-medium text-primary hover:underline">
          See the month at a glance — spend, compliance and the agent's note ›
        </button>
      </div>
    </div>
  );
}

function MonthBrief({ yachtId, preview, onOpen }: {
  yachtId: string; preview: boolean; onOpen: (tab: "balances" | "invoices" | "requests" | "calendar") => void;
}) {
  const [month, setMonth] = useState<string | null>(null);
  const [brief, setBrief] = useState<Brief | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [statementBusy, setStatementBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await portalFetch(`/api/portal/brief${month ? `?month=${month}` : ""}`);
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "The brief could not be prepared.");
      setBrief(j);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The brief could not be prepared.");
    } finally {
      setLoading(false);
    }
  }, [month]);
  useEffect(() => { void load(); }, [load]);

  const openStatement = async () => {
    setStatementBusy(true);
    try {
      const res = await portalFetch("/api/portal/finance?statement=1");
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "The statement could not be opened.");
      const url = URL.createObjectURL(await res.blob());
      window.open(url, "_blank", "noreferrer");
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) { alert(e instanceof Error ? e.message : "The statement could not be opened."); }
    finally { setStatementBusy(false); }
  };

  if (error && !brief) return <SectionEmpty icon={BookOpen} message={error} />;
  if (!brief) return <SectionLoading />;

  const b = brief;
  const spend = b.spend && b.spend.linked ? b.spend : null;
  const change = spend && spend.previousMonth > 0 ? Math.round(((spend.month - spend.previousMonth) / spend.previousMonth) * 100) : null;
  const maxCat = spend ? Math.max(1, ...spend.categories.map((c) => c.amount)) : 1;
  const compliancePct = b.compliance.total ? Math.round((b.compliance.inDate / b.compliance.total) * 100) : null;
  const nothingAhead = !b.ahead.expiring.length && !b.ahead.charters.length && !b.ahead.awaitingDecision.length && !b.ahead.openRequests.length;

  return (
    <div className={cn("space-y-8 transition-opacity", loading && "opacity-60")}>
      {/* Masthead */}
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-4">
        <div>
          <Label>This month · owner's summary</Label>
          <div className="mt-1 text-sm text-muted-foreground">{b.vessel} · {monthName(b.month)}{b.monthToDate ? " · month to date" : ""}</div>
        </div>
        <div className="flex items-center gap-2">
          {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          <select aria-label="Month" value={b.month} onChange={(e) => setMonth(e.target.value)}
                  className="rounded-xl border border-border bg-background/50 px-3 py-2 text-sm outline-none focus:border-primary/60">
            {b.months.map((m) => (
              <option key={m.key} value={m.key}>{monthName(m.key)}{m.current ? " (so far)" : ""}{m.hasNote ? " ✦" : ""}</option>
            ))}
          </select>
        </div>
      </div>

      {/* The agent's note */}
      <section className="max-w-3xl">
        {b.note?.headline || b.note?.summary ? (
          <>
            {preview && !b.note.publishedAt && (
              <div className="mb-3 inline-flex rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-300">Draft — the client can't see this note yet</div>
            )}
            {b.note.headline && <h1 className="text-3xl leading-tight sm:text-[40px]">{b.note.headline}</h1>}
            {b.note.summary && <p className="mt-4 whitespace-pre-line text-[15px] leading-relaxed text-foreground/85">{b.note.summary}</p>}
            {b.note.authorName && (
              <div className="mt-4 text-xs text-muted-foreground">Written by {b.note.authorName}{b.note.authorTitle ? `, ${b.note.authorTitle}` : ""}</div>
            )}
          </>
        ) : (
          <h1 className="text-3xl leading-tight sm:text-[40px]">
            {monthName(b.month, false)}{b.monthToDate ? " so far" : ""}, at a glance.
          </h1>
        )}
        {preview && (
          <button type="button" onClick={() => setEditing(true)}
                  className="mt-4 inline-flex items-center gap-1.5 rounded-xl border border-dashed border-primary/50 px-3 py-2 text-xs font-semibold text-primary transition hover:bg-primary/10">
            <PenLine className="h-3.5 w-3.5" /> {b.note ? "Edit the note" : "Write this month's note"} (JLS only)
          </button>
        )}
      </section>

      {/* Figures */}
      <section className="grid grid-cols-2 gap-x-6 gap-y-5 lg:grid-cols-4">
        {spend && (
          <>
            <Figure label={`Spend · ${monthName(b.month, false).slice(0, 3)}`} value={<>{spend.currency} {money(spend.month)}</>}
                    note={change == null ? `${spend.invoiceCount} invoice${spend.invoiceCount === 1 ? "" : "s"}` : `${Math.abs(change)}% ${change <= 0 ? "below" : "above"} the month before`}
                    tone={change != null && change <= 0 ? "good" : undefined} />
            <Figure label="Year to date" value={<>{spend.currency} {money(spend.yearToDate)}</>}
                    note={<button type="button" onClick={() => void openStatement()} disabled={statementBusy} className="font-medium text-primary hover:underline disabled:opacity-50">{statementBusy ? "Preparing…" : "Statement ›"}</button>} />
          </>
        )}
        <Figure label="Compliance" value={compliancePct == null ? "—" : `${compliancePct}%`}
                note={b.compliance.total
                  ? b.compliance.expired.length ? `${b.compliance.expired.length} expired — JLS is on it` : `${b.compliance.permits} permits · ${b.compliance.visas} visas · ${b.compliance.passports} passports in date`
                  : "Nothing tracked yet"}
                tone={b.compliance.expired.length ? "warn" : b.compliance.total ? "good" : undefined} />
        <Figure label="Cruising permit" value={b.compliance.cruisingPermit ? day(b.compliance.cruisingPermit) : "—"}
                note={b.compliance.cruisingPermit ? `valid to ${new Date(`${b.compliance.cruisingPermit}T00:00:00Z`).getUTCFullYear()}` : "Not on file"} />
        {!spend && (
          <Figure label="This month" value={b.timeline.length} note={`event${b.timeline.length === 1 ? "" : "s"} on the record`} />
        )}
      </section>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        {/* Where the spend went */}
        {spend && (
          <section>
            <div className="flex items-baseline justify-between border-b border-border pb-2">
              <h2 className="text-xl">Where {monthName(b.month, false)}'s spend went</h2>
              <span className="text-[11px] text-muted-foreground">{spend.currency} · excl. VAT</span>
            </div>
            {spend.categories.length === 0 ? (
              <p className="mt-4 text-sm text-muted-foreground">No invoices in {monthName(b.month, false)}.</p>
            ) : (
              <div className="mt-4 space-y-3">
                {spend.categories.map((c) => (
                  <div key={c.label} className="grid grid-cols-[minmax(0,140px)_minmax(0,1fr)_90px] items-center gap-3 text-sm">
                    <span className="truncate">{c.label}</span>
                    <span className="h-2 rounded-r bg-muted"><span className="block h-2 rounded-r bg-primary" style={{ width: `${Math.max(2, (c.amount / maxCat) * 100)}%` }} /></span>
                    <span className="text-right tabular-nums">{money(c.amount)}</span>
                  </div>
                ))}
              </div>
            )}
            <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
              From the {spend.invoiceCount} invoice{spend.invoiceCount === 1 ? "" : "s"} dated in {monthName(b.month, false)}.{" "}
              <button type="button" onClick={() => onOpen("invoices")} className="font-medium text-primary hover:underline">See the invoices</button>, or ask your agent about anything behind a number.
            </p>
          </section>
        )}

        {/* What happened */}
        <section className={cn(!spend && "lg:col-span-2")}>
          <div className="border-b border-border pb-2"><h2 className="text-xl">What happened</h2></div>
          {b.timeline.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">Nothing recorded for {monthName(b.month, false)} yet.</p>
          ) : (
            <ol className="mt-2">
              {b.timeline.map((t, i) => (
                <li key={i} className="grid grid-cols-[56px_minmax(0,1fr)] gap-3 border-b border-border/50 py-2.5 last:border-0">
                  <span className="pt-0.5 text-xs tabular-nums text-muted-foreground">{day(t.date)}</span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{t.title}</span>
                    {t.detail && <span className="block text-xs text-muted-foreground">{t.detail}</span>}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      {/* The next 30 days */}
      <section>
        <div className="border-b border-border pb-2"><h2 className="text-xl">The next 30 days</h2></div>
        {nothingAhead ? (
          <p className="mt-4 text-sm text-muted-foreground">Nothing due — nothing expires, and nothing is waiting on you.</p>
        ) : (
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {b.ahead.charters.length > 0 && (
              <SectionCard className="p-4">
                <Label>Charters</Label>
                {b.ahead.charters.map((c, i) => (
                  <div key={i} className="mt-2 text-sm">
                    <div className="font-medium">{c.title}</div>
                    <div className="text-xs text-muted-foreground">{day(c.start)}{c.end ? ` – ${day(c.end)}` : ""}{c.from ? ` · ${c.from}${c.to && c.to !== c.from ? ` → ${c.to}` : ""}` : ""}{c.guests ? ` · ${c.guests} guests` : ""}</div>
                  </div>
                ))}
              </SectionCard>
            )}
            {b.ahead.awaitingDecision.length > 0 && (
              <SectionCard className="border-primary/40 p-4">
                <Label>Awaiting your decision</Label>
                {b.ahead.awaitingDecision.slice(0, 4).map((q, i) => (
                  <div key={i} className="mt-2 flex items-baseline justify-between gap-2 text-sm">
                    <span>Quotation {q.docNumber ?? ""}</span>
                    <span className="tabular-nums">{q.currency} {money(q.total)}</span>
                  </div>
                ))}
                <button type="button" onClick={() => onOpen("invoices")} className="mt-3 text-xs font-medium text-primary hover:underline">Review quotations ›</button>
              </SectionCard>
            )}
            {b.ahead.expiring.length > 0 && (
              <SectionCard className="p-4">
                <Label>Renewals JLS is tracking</Label>
                {b.ahead.expiring.slice(0, 6).map((e, i) => (
                  <div key={i} className="mt-2 flex items-baseline justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate">{e.title}</span>
                    <span className="shrink-0 text-xs tabular-nums text-amber-300">{day(e.date)}</span>
                  </div>
                ))}
                <button type="button" onClick={() => onOpen("calendar")} className="mt-3 text-xs font-medium text-primary hover:underline">Compliance calendar ›</button>
              </SectionCard>
            )}
            {b.ahead.openRequests.length > 0 && (
              <SectionCard className="p-4">
                <Label>In hand with JLS</Label>
                {b.ahead.openRequests.slice(0, 5).map((r, i) => (
                  <div key={i} className="mt-2 text-sm">
                    <div className="truncate font-medium">{r.title}</div>
                    <div className="text-xs text-muted-foreground">{r.reference ? `${r.reference} · ` : ""}{r.status.replace(/_/g, " ")}</div>
                  </div>
                ))}
                <button type="button" onClick={() => onOpen("requests")} className="mt-3 text-xs font-medium text-primary hover:underline">
                  {b.ahead.openRequests.length > 5 ? `All ${b.ahead.openRequests.length} requests ›` : "Requests ›"}
                </button>
              </SectionCard>
            )}
          </div>
        )}
      </section>

      {spend && (
        <div className="flex justify-end">
          <button type="button" onClick={() => void openStatement()} disabled={statementBusy}
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-border px-4 text-sm font-medium transition hover:border-primary/50 disabled:opacity-50">
            {statementBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Statement of account
          </button>
        </div>
      )}

      {editing && (
        <NoteEditor yachtId={yachtId} month={b.month} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); void load(); }} />
      )}
    </div>
  );
}

/** Staff only (portal preview): draft, publish or withdraw the month's note. Writes under staff RLS. */
function NoteEditor({ yachtId, month, onClose, onSaved }: { yachtId: string; month: string; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ headline: "", summary: "", author_name: "", author_title: "" });
  const [published, setPublished] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const [{ data: row }, { data: auth }] = await Promise.all([
        db.from("portal_owner_briefs").select("headline, summary, author_name, author_title, published_at").eq("yacht_id", yachtId).eq("month", `${month}-01`).maybeSingle(),
        supabase.auth.getUser(),
      ]);
      let author = row?.author_name ?? "";
      if (!row && auth?.user) {
        const { data: p } = await db.from("profiles").select("display_name, first_name, last_name").eq("id", auth.user.id).maybeSingle();
        author = p?.display_name || [p?.first_name, p?.last_name].filter(Boolean).join(" ") || "";
      }
      setForm({ headline: row?.headline ?? "", summary: row?.summary ?? "", author_name: author, author_title: row?.author_title ?? "" });
      setPublished(!!row?.published_at);
      setLoaded(true);
    })();
  }, [yachtId, month]);

  const save = async (publish: boolean) => {
    setBusy(true); setError(null);
    const { data: auth } = await supabase.auth.getUser();
    const { error: err } = await db.from("portal_owner_briefs").upsert({
      yacht_id: yachtId, month: `${month}-01`,
      headline: form.headline.trim() || null, summary: form.summary.trim() || null,
      author_name: form.author_name.trim() || null, author_title: form.author_title.trim() || null,
      published_at: publish ? new Date().toISOString() : null,
      created_by: auth?.user?.id ?? null, updated_at: new Date().toISOString(),
    }, { onConflict: "yacht_id,month" });
    if (err) { setError(err.message); setBusy(false); return; }
    onSaved();
  };

  const cls = "w-full rounded-xl border border-border bg-background/50 px-3 py-2.5 text-sm outline-none focus:border-primary/60";
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center"
         onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-t-3xl border border-border bg-card p-5 sm:rounded-3xl sm:p-6">
        <h2 className="text-xl">Note for {monthName(month)}</h2>
        <p className="mt-1 text-sm text-muted-foreground">A headline and a few sentences from the agent — what kind of month it was, anything worth explaining. The figures beneath it fill in themselves.</p>
        {!loaded ? <div className="py-8"><Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" /></div> : (
          <div className="mt-4 space-y-3">
            <input aria-label="Headline" className={cls} placeholder="A quiet month alongside, ready for Muscat." value={form.headline}
                   onChange={(e) => setForm({ ...form, headline: e.target.value })} maxLength={140} />
            <textarea aria-label="Summary" className={cn(cls, "min-h-[160px]")} placeholder="She stayed at Mina Rashid through the month for scheduled engine work…"
                      value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} maxLength={2000} />
            <div className="grid gap-3 sm:grid-cols-2">
              <input aria-label="Written by" className={cls} placeholder="Written by" value={form.author_name} onChange={(e) => setForm({ ...form, author_name: e.target.value })} />
              <input aria-label="Their title" className={cls} placeholder="Senior Agent" value={form.author_title} onChange={(e) => setForm({ ...form, author_title: e.target.value })} />
            </div>
            {error && <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-red-300">{error}</div>}
            <div className="flex flex-wrap justify-end gap-2 pt-2">
              <button type="button" onClick={onClose} className="min-h-10 rounded-xl px-4 text-sm text-muted-foreground hover:text-foreground">Cancel</button>
              <button type="button" disabled={busy} onClick={() => void save(false)}
                      className="min-h-10 rounded-xl border border-border px-4 text-sm font-medium transition hover:border-primary/50 disabled:opacity-50">
                {published ? "Withdraw to draft" : "Save draft"}
              </button>
              <button type="button" disabled={busy || (!form.headline.trim() && !form.summary.trim())} onClick={() => void save(true)}
                      className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:brightness-110 disabled:opacity-50">
                {busy && <Loader2 className="h-4 w-4 animate-spin" />} {published ? "Update & keep published" : "Publish to the client"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Maritime Declarations of Health for one vessel: the ones the master has
 * signed and sent through the Client Portal (with the PDF), and any still in
 * draft, flagged "Due soon" / "Overdue" against the five-working-day deadline
 * before the Abu Dhabi arrival. A declaration sent after the deadline shows
 * "Sent late". Staff-side only: nothing here messages the client.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SignedAnchor } from "@/components/ui/signed-file";
import { HeartPulse, Download, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { HEALTH_QUESTIONS, healthDueDate, uaeToday } from "@/lib/portal/health-declaration";

const db = supabase as any;

type Row = {
  id: string; status: "draft" | "submitted"; arrival_date: string | null; port_of_arrival: string | null;
  arriving_from: string | null; master_name: string | null; due_date: string | null; late: boolean;
  submitted_at: string | null; submitted_by_name: string | null; pdf_ref: string | null; answers: Record<string, unknown> | null;
  updated_at: string; captain_requests: { reference: string; status: string } | null;
};

const fmt = (d: string | null | undefined) =>
  d ? new Date(`${String(d).slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "—";

/** Working days from today to `date` (Mon–Fri less holidays); negative once passed. */
function workingDaysUntil(date: string, holidays: Set<string>): number {
  const today = uaeToday();
  if (date === today) return 0;
  const step = date > today ? 1 : -1;
  const d = new Date(`${today}T00:00:00Z`);
  let n = 0;
  for (let i = 0; i < 400 && d.toISOString().slice(0, 10) !== date; i++) {
    d.setUTCDate(d.getUTCDate() + step);
    const day = d.getUTCDay();
    if (day !== 0 && day !== 6 && !holidays.has(d.toISOString().slice(0, 10))) n += step;
  }
  return n;
}

function Badge({ tone, children }: { tone: "amber" | "red" | "green" | "slate"; children: React.ReactNode }) {
  return (
    <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
      tone === "amber" && "border-amber-500/40 bg-amber-500/10 text-amber-500",
      tone === "red" && "border-red-500/40 bg-red-500/10 text-red-500",
      tone === "green" && "border-emerald-500/40 bg-emerald-500/10 text-emerald-500",
      tone === "slate" && "border-border bg-muted/40 text-muted-foreground")}>
      {children}
    </span>
  );
}

export function HealthDeclarationsCard({ yachtId }: { yachtId: string }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [holidays, setHolidays] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const [decl, hols] = await Promise.all([
        db.from("health_declarations")
          .select("id, status, arrival_date, port_of_arrival, arriving_from, master_name, due_date, late, submitted_at, submitted_by_name, pdf_ref, answers, updated_at, captain_requests(reference, status)")
          .eq("yacht_id", yachtId).order("created_at", { ascending: false }).limit(30),
        db.from("uae_public_holidays").select("holiday_date").gte("holiday_date", uaeToday()).limit(100),
      ]);
      if (!alive) return;
      if (decl.error) { setError(decl.error.message); setRows([]); return; }
      setRows((decl.data ?? []) as Row[]);
      setHolidays(((hols.data ?? []) as Array<{ holiday_date: string }>).map((h) => String(h.holiday_date).slice(0, 10)));
    })();
    return () => { alive = false; };
  }, [yachtId]);

  if (rows == null) {
    return <div className="flex items-center gap-2 rounded-xl border border-border bg-card/40 p-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading health declarations…</div>;
  }
  if (rows.length === 0 && !error) return null;

  const hol = new Set(holidays);
  return (
    <section className="rounded-xl border border-border bg-card/40 p-4">
      <div className="flex items-center gap-2">
        <HeartPulse className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold">Maritime Declarations of Health</h2>
        <span className="text-xs text-muted-foreground">· Abu Dhabi arrivals, from the Client Portal</span>
      </div>
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
      <div className="mt-3 divide-y divide-border/60">
        {rows.map((r) => {
          const due = r.due_date ?? healthDueDate(r.arrival_date, holidays);
          const left = r.status === "draft" && due ? workingDaysUntil(due, hol) : null;
          const arrived = !!r.arrival_date && r.arrival_date < uaeToday();
          const yeses = HEALTH_QUESTIONS.filter((q) => r.answers?.[q.key] === "yes").length;
          return (
            <div key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2.5 first:pt-0 last:pb-0">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
                  Arriving {fmt(r.arrival_date)}{r.port_of_arrival ? ` · ${r.port_of_arrival}` : ""}
                  {r.status === "submitted"
                    ? <>
                        <Badge tone="green">Sent</Badge>
                        {r.late && <Badge tone="amber">Sent late</Badge>}
                        {yeses > 0 && <Badge tone="red">{yeses} yes answer{yeses === 1 ? "" : "s"}</Badge>}
                      </>
                    : <>
                        <Badge tone="slate">Draft</Badge>
                        {left != null && !arrived && left < 0 && <Badge tone="red">Overdue</Badge>}
                        {left != null && !arrived && left >= 0 && left <= 2 && <Badge tone="amber">Due soon</Badge>}
                      </>}
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  Due {fmt(due)}
                  {r.arriving_from && ` · from ${r.arriving_from}`}
                  {r.master_name && ` · Master ${r.master_name}`}
                  {r.status === "submitted"
                    ? ` · sent ${fmt(r.submitted_at)}${r.submitted_by_name ? ` by ${r.submitted_by_name}` : ""}${r.captain_requests?.reference ? ` · ${r.captain_requests.reference}` : ""}`
                    : ` · being filled in by the vessel (last saved ${fmt(r.updated_at)})`}
                </div>
              </div>
              {r.pdf_ref && (
                <SignedAnchor stored={r.pdf_ref}
                  className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border bg-muted/30 px-2 py-1 text-[11px] font-medium text-muted-foreground transition hover:text-foreground aria-disabled:opacity-50">
                  <Download className="h-3 w-3" /> PDF
                </SignedAnchor>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

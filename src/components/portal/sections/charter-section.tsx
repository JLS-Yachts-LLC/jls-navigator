/**
 * Charter section for the "My Yacht" portal — upcoming & past charter bookings.
 * Reads `charter_bookings` (yacht-scoped by RLS + an explicit yacht_id filter so it
 * also behaves in staff preview). BUILT BUT NOT YET WIRED into the portal sidebar.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { CalendarRange, MapPin, Users } from "lucide-react";
import { SectionCard, SectionHeader, SectionLoading, SectionEmpty, StatusBadge, fmtDate } from "./section-ui";

const db = supabase as any;

type CharterBooking = {
  id: string; charter_ref: string | null; charterer_name: string | null; broker: string | null;
  status: string; start_date: string | null; end_date: string | null;
  embark_port: string | null; disembark_port: string | null; itinerary: string | null;
  guest_count: number | null; charter_fee: number | null; currency: string | null;
};

const STATUS_TONE: Record<string, "green" | "amber" | "red" | "sky" | "slate"> = {
  confirmed: "green", in_progress: "green", option: "amber", enquiry: "sky",
  completed: "slate", cancelled: "red",
};
const STATUS_LABEL: Record<string, string> = {
  enquiry: "Enquiry", option: "Option", confirmed: "Confirmed",
  in_progress: "On charter", completed: "Completed", cancelled: "Cancelled",
};

export function CharterSection({ yachtId }: { yachtId: string }) {
  const [rows, setRows] = useState<CharterBooking[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    db.from("charter_bookings")
      .select("id, charter_ref, charterer_name, broker, status, start_date, end_date, embark_port, disembark_port, itinerary, guest_count, charter_fee, currency")
      .eq("yacht_id", yachtId)
      .order("start_date", { ascending: false, nullsFirst: false })
      .then(({ data }: any) => { setRows(data ?? []); setLoading(false); });
  }, [yachtId]);

  if (loading) return <SectionLoading />;

  const now = Date.now();
  const upcoming = rows.filter((r) => r.status !== "completed" && r.status !== "cancelled" && (!r.end_date || new Date(r.end_date).getTime() >= now));
  const past = rows.filter((r) => !upcoming.includes(r));

  const money = (n: number | null, ccy: string | null) =>
    n == null ? null : `${ccy ?? "EUR"} ${Number(n).toLocaleString("en-GB", { minimumFractionDigits: 0 })}`;

  const Row = ({ c }: { c: CharterBooking }) => (
    <SectionCard className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold">{c.charterer_name || c.charter_ref || "Charter"}</span>
            <StatusBadge label={STATUS_LABEL[c.status] ?? c.status} tone={STATUS_TONE[c.status] ?? "slate"} />
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1"><CalendarRange className="h-3.5 w-3.5" /> {fmtDate(c.start_date)} → {fmtDate(c.end_date)}</span>
            {(c.embark_port || c.disembark_port) && (
              <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {c.embark_port || "—"}{c.disembark_port ? ` → ${c.disembark_port}` : ""}</span>
            )}
            {c.guest_count != null && <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" /> {c.guest_count} guests</span>}
          </div>
          {c.itinerary && <div className="mt-2 line-clamp-2 text-xs text-muted-foreground/80">{c.itinerary}</div>}
        </div>
        <div className="text-right">
          {money(c.charter_fee, c.currency) && <div className="font-semibold">{money(c.charter_fee, c.currency)}</div>}
          {c.broker && <div className="text-[11px] text-muted-foreground">via {c.broker}</div>}
        </div>
      </div>
    </SectionCard>
  );

  return (
    <div className="space-y-5">
      <SectionHeader title="Charter" subtitle="Upcoming and past charters for your vessel." />
      {rows.length === 0 ? (
        <SectionEmpty icon={CalendarRange} message="No charter bookings on record yet." />
      ) : (
        <>
          {upcoming.length > 0 && (
            <div className="space-y-2">
              <h2 className={cn("text-sm font-semibold text-muted-foreground")}>Upcoming</h2>
              {upcoming.map((c) => <Row key={c.id} c={c} />)}
            </div>
          )}
          {past.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-sm font-semibold text-muted-foreground">Past charters</h2>
              {past.map((c) => <Row key={c.id} c={c} />)}
            </div>
          )}
        </>
      )}
    </div>
  );
}

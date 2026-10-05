/**
 * Guests & charter (On board) — upcoming and past charter bookings.
 * Reads `charter_bookings` through RLS (vessel-scoped, also works in staff
 * preview); writes go through /api/portal/onboard. Positions that can't see the
 * vessel's accounts don't see charter fees either.
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CalendarRange, MapPin, Pencil, Users } from "lucide-react";
import {
  AddButton, RecordFormModal, SectionCard, SectionEmpty, SectionHeader, SectionLoading, StatusBadge,
  fmtDate, onboardRequest, type FormField,
} from "./section-ui";

const db = supabase as any;

type CharterBooking = {
  id: string; charter_ref: string | null; charterer_name: string | null; broker: string | null;
  status: string; start_date: string | null; end_date: string | null;
  embark_port: string | null; disembark_port: string | null; itinerary: string | null;
  guest_count: number | null; charter_fee: number | null; currency: string | null; notes: string | null;
};

const STATUS_TONE: Record<string, "green" | "amber" | "red" | "sky" | "slate"> = {
  confirmed: "green", in_progress: "green", option: "amber", enquiry: "sky",
  completed: "slate", cancelled: "red",
};
const STATUS_LABEL: Record<string, string> = {
  enquiry: "Enquiry", option: "Option", confirmed: "Confirmed",
  in_progress: "On charter", completed: "Completed", cancelled: "Cancelled",
};

function charterFields(showFees: boolean): FormField[] {
  return [
    { key: "charterer_name", label: "Charterer / guest party", required: true, wide: true },
    { key: "status", label: "Status", type: "select", required: true,
      options: Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label })) },
    { key: "charter_ref", label: "Reference", placeholder: "e.g. CA-2026-014" },
    { key: "start_date", label: "Embark", type: "date" },
    { key: "end_date", label: "Disembark", type: "date" },
    { key: "embark_port", label: "From", placeholder: "e.g. Dubai Harbour" },
    { key: "disembark_port", label: "To", placeholder: "e.g. Muscat" },
    { key: "guest_count", label: "Guests", type: "number" },
    { key: "broker", label: "Broker / central agent" },
    ...(showFees ? [
      { key: "charter_fee", label: "Charter fee", type: "number" as const },
      { key: "currency", label: "Currency", type: "select" as const,
        options: ["EUR", "USD", "AED", "GBP"].map((c) => ({ value: c, label: c })) },
    ] : []),
    { key: "itinerary", label: "Itinerary", type: "textarea" },
    { key: "notes", label: "Guest preferences & notes", type: "textarea", placeholder: "Allergies, cabins, celebrations, special requests…" },
  ];
}

export function CharterSection({ yachtId, canEdit, showFees }: { yachtId: string; canEdit: boolean; showFees: boolean }) {
  const [rows, setRows] = useState<CharterBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<CharterBooking | "new" | null>(null);

  const load = useCallback(async () => {
    const { data } = await db.from("charter_bookings")
      .select("id, charter_ref, charterer_name, broker, status, start_date, end_date, embark_port, disembark_port, itinerary, guest_count, charter_fee, currency, notes")
      .eq("yacht_id", yachtId)
      .order("start_date", { ascending: false, nullsFirst: false });
    setRows(data ?? []); setLoading(false);
  }, [yachtId]);
  useEffect(() => { void load(); }, [load]);

  if (loading) return <SectionLoading />;

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = rows
    .filter((r) => r.status !== "completed" && r.status !== "cancelled" && (!r.end_date || r.end_date >= today))
    .sort((a, b) => (a.start_date ?? "9999").localeCompare(b.start_date ?? "9999"));
  const past = rows.filter((r) => !upcoming.includes(r));

  const money = (n: number | null, ccy: string | null) =>
    n == null ? null : `${ccy ?? "EUR"} ${Number(n).toLocaleString("en-GB", { minimumFractionDigits: 0 })}`;

  const Row = ({ c }: { c: CharterBooking }) => (
    <SectionCard className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
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
          {c.notes && <div className="mt-1.5 line-clamp-2 text-xs text-foreground/80">{c.notes}</div>}
        </div>
        <div className="flex items-start gap-2">
          <div className="text-right">
            {showFees && money(c.charter_fee, c.currency) && <div className="font-semibold">{money(c.charter_fee, c.currency)}</div>}
            {c.broker && <div className="text-[11px] text-muted-foreground">via {c.broker}</div>}
          </div>
          {canEdit && (
            <button type="button" onClick={() => setEditing(c)} aria-label={`Edit ${c.charterer_name ?? "charter"}`}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-background/60 hover:text-foreground">
              <Pencil className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </SectionCard>
  );

  return (
    <div className="space-y-5">
      <SectionHeader title="Guests & charter" subtitle="Upcoming and past charters, with each party's preferences."
                     action={canEdit && <AddButton onClick={() => setEditing("new")}>Add charter</AddButton>} />
      {rows.length === 0 ? (
        <SectionEmpty icon={CalendarRange} message={canEdit ? "No charters yet — add a booking to keep dates, ports and guest preferences in one place." : "No charter bookings on record yet."} />
      ) : (
        <>
          {upcoming.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-sm font-semibold text-muted-foreground">Upcoming</h2>
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
      {editing && (
        <RecordFormModal
          title={editing === "new" ? "Add charter" : `Edit ${editing.charterer_name ?? "charter"}`}
          kind="charter" fields={charterFields(showFees)}
          initial={editing === "new" ? { status: "enquiry", currency: "EUR" } : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); void load(); }}
          onDelete={editing === "new" ? undefined : async () => {
            await onboardRequest("charter", { method: "DELETE", id: (editing as CharterBooking).id });
            setEditing(null); void load();
          }}
          deleteLabel="Delete charter"
        />
      )}
    </div>
  );
}

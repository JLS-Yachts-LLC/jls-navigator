/**
 * BerthBillingList — Agency Module, Marina Berth Billing dashboard.
 *
 * Reads ONLY from v_berth_billing_dashboard (see the marina_berth_billing
 * migration) — never queries berth_occupancies / berth_invoices directly,
 * same rule as v_inward_clearance_active for Port Calls.
 */
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  PolarisButton,
  EmptyState,
  Skeleton,
} from "@/components/polaris-ui/primitives";
import { StatCard } from "@/components/polaris-ui/cards";
import { useColumnFilters, type FilterColumn } from "@/components/ui/column-filter";
import type { DashboardRow } from "./types";

const currency = (n: number) =>
  new Intl.NumberFormat("en-AE", {
    style: "currency",
    currency: "AED",
    maximumFractionDigits: 0,
  }).format(n ?? 0);

const invoiceLabel = (r: DashboardRow) => (r.invoice_raised ? (r.invoice_sent ? "Sent" : "Raised") : "Not raised");
const supplierLabel = (r: DashboardRow) => (!r.supplier_invoice_received ? "None received" : r.supplier_paid ? "Paid" : "Unpaid");
const dateText = (d: string | null) => (d ? new Date(d).toLocaleDateString() : null);

// Excel-style sort + value filter on each column title. Dates filter by month.
const COLUMNS: FilterColumn<DashboardRow>[] = [
  { key: "vessel", label: "Vessel", value: (r) => r.vessel },
  { key: "client", label: "Client", value: (r) => r.client },
  { key: "berth", label: "Marina / Berth", value: (r) => `${r.marina} · ${r.berth}` },
  { key: "arrival", label: "Arrival", value: (r) => r.arrival?.slice(0, 7), sortValue: (r) => r.arrival },
  { key: "departure", label: "Departure", value: (r) => r.departure?.slice(0, 7), sortValue: (r) => r.departure },
  { key: "days", label: "Days", value: (r) => r.days_occupied },
  { key: "revenue", label: "Revenue", value: (r) => currency(r.revenue_earned), sortValue: (r) => r.revenue_earned },
  { key: "invoice", label: "Invoice", value: invoiceLabel },
  { key: "paid", label: "Client Paid", value: (r) => (r.client_paid ? "Paid" : "Unpaid") },
  { key: "supplier", label: "Supplier", value: supplierLabel },
  { key: "outstanding", label: "Outstanding", value: (r) => currency(r.outstanding_balance), sortValue: (r) => r.outstanding_balance },
  { key: "margin", label: "Margin", value: (r) => currency(r.margin), sortValue: (r) => r.margin },
];

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        borderRadius: 999,
        padding: "2px 10px",
        fontSize: 12,
        fontWeight: 500,
        background: ok ? "rgba(233,204,114,0.18)" : "rgba(255,255,255,0.06)",
        color: ok ? "#E9CC72" : "rgba(255,255,255,0.5)",
      }}
    >
      {label}
    </span>
  );
}

export function BerthBillingList({
  onOpenOccupancy,
  onNewOccupancy,
}: {
  onOpenOccupancy: (occupancyId: string) => void;
  onNewOccupancy: () => void;
}) {
  const [rows, setRows] = useState<DashboardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "unbilled" | "overdue">("all");

  useEffect(() => {
    let active = true;
    void (async () => {
      setLoading(true);
      const { data, error: queryError } = await supabase
        .from("v_berth_billing_dashboard" as any)
        .select("*")
        .order("arrival", { ascending: false });
      if (!active) return;
      if (queryError) setError(queryError.message);
      else setRows((data ?? []) as unknown as DashboardRow[]);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  const filteredRows = useMemo(() => {
    if (filter === "unbilled") return rows.filter((r) => !r.invoice_raised);
    if (filter === "overdue")
      return rows.filter((r) => (r.age_of_invoice_days ?? 0) > 30 && !r.client_paid);
    return rows;
  }, [rows, filter]);
  const cf = useColumnFilters(filteredRows, COLUMNS);

  function exportCsv() {
    // Exactly what's on screen: the filter chips, column filters and sort.
    const esc = (v: unknown) => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const head = ["Vessel", "Client", "Marina", "Berth", "Arrival", "Departure", "Days", "Revenue (AED)", "Invoice", "Client Paid", "Supplier", "Outstanding (AED)", "Margin (AED)", "Responsible"];
    const lines = cf.rows.map((r) => [
      r.vessel, r.client, r.marina, r.berth, r.arrival?.slice(0, 10), r.departure?.slice(0, 10), r.days_occupied, r.revenue_earned,
      invoiceLabel(r), r.client_paid ? "Paid" : "Unpaid", supplierLabel(r), r.outstanding_balance, r.margin, r.responsible_team_member,
    ].map(esc).join(","));
    const url = URL.createObjectURL(new Blob([[head.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8;" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `berth-billing-${new Date().toISOString().slice(0, 10)}.csv` });
    a.click();
    URL.revokeObjectURL(url);
  }

  // Header cell that stays in view while the page scrolls (solid background, or rows show through).
  const th: React.CSSProperties = {
    position: "sticky", top: 0, zIndex: 10, background: "var(--pds-navy-mid, var(--card))",
    boxShadow: "inset 0 -1px 0 0 rgba(233,204,114,0.24)",
    padding: "6px 12px", fontWeight: 500, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap",
  };

  const kpis = useMemo(() => {
    const occupied = rows.filter((r) => !r.departure).length;
    const revenue = rows.reduce((sum, r) => sum + (r.revenue_earned ?? 0), 0);
    const outstanding = rows.reduce((sum, r) => sum + (r.outstanding_balance ?? 0), 0);
    const unbilled = rows.filter((r) => !r.invoice_raised).length;
    return { occupied, revenue, outstanding, unbilled };
  }, [rows]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 20,
        padding: 20,
        fontFamily: "'DINPro','Barlow',sans-serif",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div>
          <h2
            style={{
              fontFamily: "'Halis GR','Barlow',sans-serif",
              fontSize: 20,
              color: "#E9CC72",
              margin: 0,
            }}
          >
            Marina Berth Billing
          </h2>
          <p style={{ fontSize: 13, color: "rgba(233,204,114,0.7)", margin: "4px 0 0" }}>
            Live occupancy, invoicing and supplier payment status.
          </p>
        </div>
        <PolarisButton
          variant="primary"
          icon="plus"
          label="Assign Berth"
          onClick={onNewOccupancy}
        />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
          gap: 12,
        }}
      >
        <StatCard label="Occupied Berths" value={kpis.occupied} variant="active" />
        <StatCard label="Revenue (shown rows)" value={currency(kpis.revenue)} variant="neutral" />
        <StatCard
          label="Outstanding Balance"
          value={currency(kpis.outstanding)}
          variant={kpis.outstanding > 0 ? "expiring" : "neutral"}
        />
        <StatCard
          label="Unbilled Occupancies"
          value={kpis.unbilled}
          variant={kpis.unbilled > 0 ? "expired" : "neutral"}
        />
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        {(["all", "unbilled", "overdue"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              borderRadius: 8,
              border: "1px solid rgba(233,204,114,0.24)",
              padding: "6px 14px",
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
              background: filter === f ? "#C9A227" : "transparent",
              color: filter === f ? "#fff" : "rgba(255,255,255,0.7)",
            }}
          >
            {f === "all" ? "All" : f === "unbilled" ? "Not Yet Invoiced" : "Overdue (30d+)"}
          </button>
        ))}
        <span style={{ marginLeft: "auto", fontSize: 12, color: "rgba(255,255,255,0.6)" }}>
          {cf.rows.length !== rows.length ? `${cf.rows.length} of ${rows.length}` : rows.length} record{rows.length !== 1 ? "s" : ""}
        </span>
        {cf.activeCount > 0 && (
          <button onClick={cf.clearAll} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: "#E9CC72", textDecoration: "underline" }}>
            Clear column filters
          </button>
        )}
        <PolarisButton variant="ghost" icon="download" label="Export CSV" onClick={exportCsv} disabled={cf.rows.length === 0} />
      </div>

      {error && (
        <div
          style={{
            borderRadius: 8,
            background: "rgba(209,67,67,0.1)",
            border: "1px solid rgba(209,67,67,0.3)",
            color: "#D14343",
            fontSize: 13,
            padding: "8px 12px",
          }}
        >
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <Skeleton height={48} />
          <Skeleton height={48} />
          <Skeleton height={48} />
        </div>
      ) : filteredRows.length === 0 ? (
        <EmptyState
          icon="anchor"
          message="No berth occupancies match this filter."
          action={{ label: "Assign Berth", onClick: onNewOccupancy }}
        />
      ) : (
        // No overflow wrapper: the page's scroll box must be the nearest scroller,
        // or the header row stops sticking.
        <div style={{ width: "max-content", minWidth: "100%" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "rgba(233,204,114,0.7)" }}>
                {COLUMNS.map((c) => (
                  <th key={c.key} style={th}>{cf.header(c.key)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cf.rows.length === 0 && (
                <tr><td colSpan={COLUMNS.length} style={{ padding: "24px 12px", textAlign: "center", color: "rgba(255,255,255,0.6)" }}>
                  No occupancies match the column filters ·{" "}
                  <button onClick={cf.clearAll} style={{ background: "none", border: "none", cursor: "pointer", color: "#E9CC72", textDecoration: "underline" }}>Clear column filters</button>
                </td></tr>
              )}
              {cf.rows.map((r, i) => (
                <tr
                  key={r.occupancy_id}
                  onClick={() => onOpenOccupancy(r.occupancy_id)}
                  style={{
                    cursor: "pointer",
                    background: i % 2 === 1 ? "rgba(233,204,114,0.06)" : "transparent",
                  }}
                >
                  <td style={{ padding: "8px 12px", fontWeight: 500, color: "#E9CC72" }}>{r.vessel}</td>
                  <td style={{ padding: "8px 12px", color: "#F0F4F8" }}>{r.client}</td>
                  <td style={{ padding: "8px 12px", color: "#F0F4F8" }}>
                    {r.marina} · {r.berth}
                  </td>
                  <td style={{ padding: "8px 12px", color: "#F0F4F8" }}>
                    {new Date(r.arrival).toLocaleDateString()}
                  </td>
                  <td style={{ padding: "8px 12px", color: "#F0F4F8" }}>
                    {r.departure ? new Date(r.departure).toLocaleDateString() : "—"}
                  </td>
                  <td style={{ padding: "8px 12px", color: "#F0F4F8" }}>{r.days_occupied}</td>
                  <td style={{ padding: "8px 12px", color: "#F0F4F8" }}>{currency(r.revenue_earned)}</td>
                  <td style={{ padding: "8px 12px" }}>
                    <StatusPill
                      ok={r.invoice_sent}
                      label={r.invoice_raised ? (r.invoice_sent ? "Sent" : "Raised") : "Not raised"}
                    />
                  </td>
                  <td style={{ padding: "8px 12px" }}>
                    <StatusPill ok={r.client_paid} label={r.client_paid ? "Paid" : "Unpaid"} />
                  </td>
                  <td style={{ padding: "8px 12px" }}>
                    <StatusPill
                      ok={r.supplier_paid}
                      label={!r.supplier_invoice_received ? "None received" : r.supplier_paid ? "Paid" : "Unpaid"}
                    />
                  </td>
                  <td style={{ padding: "8px 12px", color: r.outstanding_balance > 0 ? "#E0B23A" : "#F0F4F8" }}>
                    {currency(r.outstanding_balance)}
                  </td>
                  <td style={{ padding: "8px 12px", color: r.margin < 0 ? "#D14343" : "#F0F4F8", fontWeight: r.margin < 0 ? 600 : 400 }}>
                    {currency(r.margin)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default BerthBillingList;

/**
 * BerthOccupancyDetail — Marina Berth Billing.
 *
 * Occupancy summary, billing line history, and invoice lifecycle
 * actions. All mutations go through the SECURITY DEFINER RPC functions
 * from the marina_berth_billing migration — this component never writes
 * to berth_occupancies / berth_invoices directly.
 *
 * Follows the embedded/onBack pattern used across the New View (see
 * src/components/port-calls/PortCallDetail.tsx).
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { PolarisButton, SectionLabel } from "@/components/polaris-ui/primitives";
import type { BillingLineRow, DashboardRow, InvoiceRow } from "./types";
import { INVOICE_STATUS_LABEL, NEXT_INVOICE_STATUS } from "./types";

const currency = (n: number, code = "AED") =>
  new Intl.NumberFormat("en-AE", { style: "currency", currency: code, maximumFractionDigits: 2 }).format(n ?? 0);

export function BerthOccupancyDetail({
  occupancyId,
  embedded = false,
  onBack,
}: {
  occupancyId: string;
  embedded?: boolean;
  onBack?: () => void;
}) {
  const [summary, setSummary] = useState<DashboardRow | null>(null);
  const [billingLines, setBillingLines] = useState<BillingLineRow[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [summaryRes, linesRes, invoicesRes] = await Promise.all([
        supabase
          .from("v_berth_billing_dashboard" as any)
          .select("*")
          .eq("occupancy_id", occupancyId)
          .maybeSingle(),
        supabase
          .from("berth_billing_lines" as any)
          .select("id, period_start, period_end, calculation_type, base_amount, discount_amount, vat_amount, total_amount, currency, calculated_at")
          .eq("occupancy_id", occupancyId)
          .order("period_start", { ascending: true }),
        supabase
          .from("berth_invoices" as any)
          .select("id, invoice_number, status, subtotal, vat_amount, total_amount, currency, created_at")
          .eq("occupancy_id", occupancyId)
          .order("created_at", { ascending: false }),
      ]);

      if (summaryRes.error) throw summaryRes.error;
      if (linesRes.error) throw linesRes.error;
      if (invoicesRes.error) throw invoicesRes.error;

      setSummary(summaryRes.data as unknown as DashboardRow);
      setBillingLines((linesRes.data ?? []) as unknown as BillingLineRow[]);
      setInvoices((invoicesRes.data ?? []) as unknown as InvoiceRow[]);
    } catch (err: any) {
      setError(err.message ?? "Failed to load berth occupancy.");
    } finally {
      setLoading(false);
    }
  }, [occupancyId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function generateDraftInvoice() {
    setBusy(true);
    setError(null);
    const { error: rpcError } = await supabase.rpc("fn_generate_draft_invoice" as any, {
      p_occupancy_id: occupancyId,
    });
    setBusy(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    await load();
  }

  async function advanceInvoice(invoiceId: string, nextStatus: string) {
    setBusy(true);
    setError(null);
    const { error: rpcError } = await supabase.rpc("fn_advance_invoice_status" as any, {
      p_invoice_id: invoiceId,
      p_new_status: nextStatus,
    });
    setBusy(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    await load();
  }

  async function recordDeparture() {
    setBusy(true);
    setError(null);
    const { error: rpcError } = await supabase.rpc("fn_record_departure" as any, {
      p_occupancy_id: occupancyId,
      p_actual_departure_at: new Date().toISOString(),
    });
    setBusy(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    await load();
  }

  if (loading)
    return (
      <div style={{ padding: 24, fontSize: 14, color: "#96CBC7" }}>Loading berth occupancy…</div>
    );

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 24,
        padding: 20,
        fontFamily: "'DINPro','Barlow',sans-serif",
      }}
    >
      {embedded && (
        <Button variant="ghost" size="sm" onClick={onBack} style={{ alignSelf: "flex-start" }}>
          <ArrowLeft className="mr-1 h-4 w-4" /> Berth Billing
        </Button>
      )}

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: "1px solid rgba(150,203,199,0.24)",
          paddingBottom: 12,
        }}
      >
        <div>
          <h2 style={{ fontFamily: "'Halis GR','Barlow',sans-serif", fontSize: 20, color: "#96CBC7", margin: 0 }}>
            {summary?.vessel ?? "—"}
          </h2>
          <p style={{ fontSize: 13, color: "rgba(150,203,199,0.7)", margin: "4px 0 0" }}>
            {summary?.marina ?? "—"} · Berth {summary?.berth ?? "—"} · {summary?.client ?? "—"}
          </p>
        </div>
        {!summary?.departure && (
          <PolarisButton
            label={busy ? "Recording…" : "Record Departure"}
            onClick={recordDeparture}
            disabled={busy}
          />
        )}
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

      <section style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12 }}>
        {[
          { label: "Arrival", value: summary?.arrival ? new Date(summary.arrival).toLocaleDateString() : "—" },
          { label: "Departure", value: summary?.departure ? new Date(summary.departure).toLocaleDateString() : "In berth" },
          { label: "Rate", value: `${currency(summary?.rate ?? 0)} / ${summary?.billing_period === "monthly" ? "mo" : "day"}` },
          { label: "Revenue Earned", value: currency(summary?.revenue_earned ?? 0) },
        ].map((s) => (
          <div key={s.label} style={{ border: "1px solid rgba(150,203,199,0.24)", borderRadius: 8, padding: 12 }}>
            <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", color: "rgba(150,203,199,0.7)" }}>
              {s.label}
            </div>
            <div style={{ fontSize: 16, color: "#F0F4F8", marginTop: 4 }}>{s.value}</div>
          </div>
        ))}
      </section>

      <section>
        <SectionLabel>Billing Lines</SectionLabel>
        {billingLines.length === 0 ? (
          <div style={{ fontSize: 13, color: "rgba(150,203,199,0.7)" }}>No billing lines calculated yet.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {billingLines.map((line, i) => (
              <div
                key={line.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  borderRadius: 8,
                  padding: "8px 12px",
                  background: i % 2 === 1 ? "rgba(150,203,199,0.06)" : "transparent",
                }}
              >
                <span style={{ fontSize: 13, color: "#F0F4F8" }}>
                  {line.period_start} → {line.period_end}{" "}
                  <span style={{ color: "rgba(150,203,199,0.7)" }}>({line.calculation_type})</span>
                </span>
                <span style={{ fontSize: 13, color: "#96CBC7", fontWeight: 500 }}>
                  {currency(line.total_amount, line.currency)}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <SectionLabel>Invoices</SectionLabel>
          <PolarisButton
            label={busy ? "Generating…" : "Generate Draft Invoice"}
            onClick={generateDraftInvoice}
            disabled={busy}
          />
        </div>
        {invoices.length === 0 ? (
          <div style={{ fontSize: 13, color: "rgba(150,203,199,0.7)" }}>No invoices raised for this occupancy yet.</div>
        ) : (
          <ol style={{ display: "flex", flexDirection: "column", gap: 8, listStyle: "none", margin: 0, padding: 0 }}>
            {invoices.map((inv) => {
              const next = NEXT_INVOICE_STATUS[inv.status];
              return (
                <li
                  key={inv.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    borderRadius: 8,
                    border: "1px solid rgba(150,203,199,0.24)",
                    padding: "8px 12px",
                  }}
                >
                  <div>
                    <div style={{ fontSize: 14, color: "#F0F4F8" }}>
                      {inv.invoice_number ?? "(draft — no number yet)"}
                    </div>
                    <div style={{ fontSize: 12, color: "rgba(150,203,199,0.7)", marginTop: 2 }}>
                      {INVOICE_STATUS_LABEL[inv.status]} · {currency(inv.total_amount, inv.currency)}
                    </div>
                  </div>
                  {next && (
                    <PolarisButton
                      variant="primary"
                      label={busy ? "Updating…" : `Mark ${INVOICE_STATUS_LABEL[next]}`}
                      onClick={() => advanceInvoice(inv.id, next)}
                      disabled={busy}
                    />
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
}

export default BerthOccupancyDetail;

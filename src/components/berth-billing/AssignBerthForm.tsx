/**
 * AssignBerthForm — Marina Berth Billing.
 *
 * Records a vessel's arrival at a berth via the fn_assign_berth RPC
 * (marina_berth_billing migration). Does not calculate or invoice
 * anything — billing only happens on departure or a scheduled run,
 * per the Generate/Submit separation rule carried over from Port Calls.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useYachts } from "@/components/polaris-ui/data";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PolarisButton } from "@/components/polaris-ui/primitives";
import type { BerthOption, MarinaOption, OrganisationOption } from "./types";

export function AssignBerthForm({
  onAssigned,
  onCancel,
}: {
  onAssigned: (occupancyId: string) => void;
  onCancel: () => void;
}) {
  const { yachts, loading: yachtsLoading } = useYachts();
  const [marinas, setMarinas] = useState<MarinaOption[]>([]);
  const [berths, setBerths] = useState<BerthOption[]>([]);
  const [orgs, setOrgs] = useState<OrganisationOption[]>([]);

  const [marinaId, setMarinaId] = useState("");
  const [berthId, setBerthId] = useState("");
  const [vesselId, setVesselId] = useState("");
  const [customerOrgId, setCustomerOrgId] = useState("");
  const [arrivalAt, setArrivalAt] = useState("");
  const [expectedDepartureAt, setExpectedDepartureAt] = useState("");
  const [billingFrequency, setBillingFrequency] = useState<"daily" | "monthly">("daily");
  const [dailyRate, setDailyRate] = useState("");
  const [monthlyRate, setMonthlyRate] = useState("");
  const [currency, setCurrency] = useState("AED");
  const [contractReference, setContractReference] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase
        .from("marinas" as any)
        .select("id, name")
        .eq("active", true)
        .order("name", { ascending: true });
      setMarinas((data ?? []) as unknown as MarinaOption[]);
    })();
    void (async () => {
      const { data } = await supabase
        .from("organisations" as any)
        .select("org_id, name")
        .order("name", { ascending: true });
      setOrgs((data ?? []) as unknown as OrganisationOption[]);
    })();
  }, []);

  useEffect(() => {
    if (!marinaId) {
      setBerths([]);
      setBerthId("");
      return;
    }
    void (async () => {
      const { data } = await supabase
        .from("berths" as any)
        .select("id, marina_id, berth_number, status, max_loa_m")
        .eq("marina_id", marinaId)
        .order("berth_number", { ascending: true });
      setBerths((data ?? []) as unknown as BerthOption[]);
    })();
  }, [marinaId]);

  async function handleSubmit() {
    if (!berthId || !vesselId || !customerOrgId || !arrivalAt) {
      setError("Berth, vessel, client and arrival date are required.");
      return;
    }
    if (!dailyRate && !monthlyRate) {
      setError("Enter a daily or monthly rate.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const { data, error: rpcError } = await supabase.rpc("fn_assign_berth" as any, {
      p_berth_id: berthId,
      p_vessel_id: vesselId,
      p_customer_org_id: customerOrgId,
      p_port_call_id: null,
      p_arrival_at: new Date(arrivalAt).toISOString(),
      p_expected_departure_at: expectedDepartureAt ? new Date(expectedDepartureAt).toISOString() : null,
      p_daily_rate: dailyRate ? Number(dailyRate) : null,
      p_monthly_rate: monthlyRate ? Number(monthlyRate) : null,
      p_currency: currency,
      p_billing_frequency: billingFrequency,
      p_contract_reference: contractReference || null,
      p_discount_pct: 0,
      p_vat_treatment: "standard",
      p_purchase_order: null,
    });
    setSubmitting(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    onAssigned(data as unknown as string);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: 20, maxWidth: 560 }}>
      <h3
        style={{
          fontFamily: "'Halis GR','Barlow',sans-serif",
          fontSize: 18,
          color: "#96CBC7",
          margin: 0,
        }}
      >
        Assign Berth
      </h3>

      <div style={{ display: "flex", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <Label>Marina</Label>
          <SearchableSelect
            value={marinaId}
            onValueChange={setMarinaId}
            options={marinas.map((m) => ({ value: m.id, label: m.name }))}
            placeholder={marinas.length ? "Select marina…" : "No marinas configured yet"}
          />
        </div>
        <div style={{ flex: 1 }}>
          <Label>Berth</Label>
          <SearchableSelect
            value={berthId}
            onValueChange={setBerthId}
            options={berths
              .filter((b) => b.status === "available")
              .map((b) => ({ value: b.id, label: b.berth_number }))}
            placeholder={marinaId ? "Select berth…" : "Select a marina first"}
          />
        </div>
      </div>

      <div>
        <Label>Vessel</Label>
        <SearchableSelect
          value={vesselId}
          onValueChange={setVesselId}
          options={yachts.map((y) => ({ value: y.id, label: y.vessel_name ?? "Unnamed vessel" }))}
          placeholder={yachtsLoading ? "Loading vessels…" : "Select vessel…"}
        />
      </div>

      <div>
        <Label>Client (billed to)</Label>
        <SearchableSelect
          value={customerOrgId}
          onValueChange={setCustomerOrgId}
          options={orgs.map((o) => ({ value: o.org_id, label: o.name }))}
          placeholder="Select client organisation…"
        />
      </div>

      <div style={{ display: "flex", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <Label>Arrival</Label>
          <Input type="datetime-local" value={arrivalAt} onChange={(e) => setArrivalAt(e.target.value)} />
        </div>
        <div style={{ flex: 1 }}>
          <Label>Expected Departure</Label>
          <Input
            type="datetime-local"
            value={expectedDepartureAt}
            onChange={(e) => setExpectedDepartureAt(e.target.value)}
          />
        </div>
      </div>

      <div style={{ display: "flex", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <Label>Billing Frequency</Label>
          <SearchableSelect
            value={billingFrequency}
            onValueChange={(v) => setBillingFrequency(v as "daily" | "monthly")}
            options={[
              { value: "daily", label: "Daily" },
              { value: "monthly", label: "Monthly" },
            ]}
            placeholder="Select…"
          />
        </div>
        <div style={{ flex: 1 }}>
          <Label>{billingFrequency === "daily" ? "Daily Rate" : "Monthly Rate"}</Label>
          <Input
            type="number"
            min="0"
            step="0.01"
            value={billingFrequency === "daily" ? dailyRate : monthlyRate}
            onChange={(e) =>
              billingFrequency === "daily" ? setDailyRate(e.target.value) : setMonthlyRate(e.target.value)
            }
          />
        </div>
        <div style={{ flex: 1 }}>
          <Label>Currency</Label>
          <Input value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} maxLength={3} />
        </div>
      </div>

      <div>
        <Label>Contract Reference (optional)</Label>
        <Input value={contractReference} onChange={(e) => setContractReference(e.target.value)} />
      </div>

      {error && <div style={{ fontSize: 13, color: "#D14343" }}>{error}</div>}

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <Button variant="outline" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
        <PolarisButton
          variant="primary"
          label={submitting ? "Assigning…" : "Assign Berth"}
          onClick={handleSubmit}
          disabled={submitting || !berthId || !vesselId || !customerOrgId || !arrivalAt}
        />
      </div>
    </div>
  );
}

export default AssignBerthForm;

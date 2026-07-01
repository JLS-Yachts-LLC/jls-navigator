/**
 * CreatePortCallForm — Agency Module, ticket #201.
 *
 * Generate-only: creates the Port Call + its pre-arrival document checklist
 * via the create_port_call RPC (migration 061). Does NOT start the Inward
 * Clearance workflow — that is a distinct "Start Inward Clearance" action
 * on the Port Call detail page (ticket #202), per the Generate/Submit
 * separation rule carried over from the Visa module.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useYachts } from "@/components/polaris-ui/data";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PolarisButton } from "@/components/polaris-ui/primitives";
import type { AgentOption, CountryOption, OfficeOption } from "./types";

export function CreatePortCallForm({
  onCreated,
  onCancel,
}: {
  onCreated: (portCallId: string) => void;
  onCancel: () => void;
}) {
  const { user } = useAuth();
  const { yachts, loading: yachtsLoading } = useYachts();
  const [countries, setCountries] = useState<CountryOption[]>([]);
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [offices, setOffices] = useState<OfficeOption[]>([]);

  const [vesselId, setVesselId] = useState("");
  const [countryId, setCountryId] = useState("");
  const [eta, setEta] = useState("");
  const [etd, setEtd] = useState("");
  const [assignedOfficeId, setAssignedOfficeId] = useState("");
  const [assignedAgentId, setAssignedAgentId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase
        .from("countries" as any)
        .select("id, iso_code, name")
        .order("name", { ascending: true });
      const rows = (data ?? []) as unknown as CountryOption[];
      setCountries(rows);
      // UAE is always the default destination country (visa-module rule #5,
      // carried over — this slice only seeds UAE requirement data anyway).
      const uae = rows.find((c) => c.iso_code === "AE");
      if (uae) setCountryId(uae.id);
    })();
    void (async () => {
      const { data } = await supabase
        .from("user_profiles" as any)
        .select("user_id, display_name")
        .order("display_name", { ascending: true });
      setAgents((data ?? []) as unknown as AgentOption[]);
    })();
    void (async () => {
      const { data } = await supabase
        .from("offices" as any)
        .select("id, name")
        .order("name", { ascending: true });
      setOffices((data ?? []) as unknown as OfficeOption[]);
    })();
  }, []);

  async function handleSubmit() {
    if (!vesselId || !countryId || !user) {
      setError("Vessel and destination country are required.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const { data, error: rpcError } = await supabase.rpc(
      "create_port_call" as any,
      {
        p_vessel_id: vesselId,
        p_destination_country_id: countryId,
        p_eta: eta ? new Date(eta).toISOString() : null,
        p_etd: etd ? new Date(etd).toISOString() : null,
        p_assigned_office_id: assignedOfficeId || null,
        p_assigned_agent_id: assignedAgentId || null,
      },
    );
    setSubmitting(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    onCreated(data as unknown as string);
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 16,
        padding: 20,
        maxWidth: 520,
      }}
    >
      <h3
        style={{
          fontFamily: "'Halis GR','Barlow',sans-serif",
          fontSize: 18,
          color: "#96CBC7",
          margin: 0,
        }}
      >
        New Port Call
      </h3>

      <div>
        <Label>Vessel</Label>
        <SearchableSelect
          value={vesselId}
          onValueChange={setVesselId}
          options={yachts.map((y) => ({
            value: y.id,
            label: y.vessel_name ?? "Unnamed vessel",
          }))}
          placeholder={yachtsLoading ? "Loading vessels…" : "Select vessel…"}
        />
      </div>

      <div>
        <Label>Destination Country</Label>
        <SearchableSelect
          value={countryId}
          onValueChange={setCountryId}
          options={countries.map((c) => ({ value: c.id, label: c.name }))}
          placeholder="Select country…"
        />
      </div>

      <div style={{ display: "flex", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <Label>ETA</Label>
          <Input
            type="datetime-local"
            value={eta}
            onChange={(e) => setEta(e.target.value)}
          />
        </div>
        <div style={{ flex: 1 }}>
          <Label>ETD</Label>
          <Input
            type="datetime-local"
            value={etd}
            onChange={(e) => setEtd(e.target.value)}
          />
        </div>
      </div>

      <div>
        <Label>Assigned Office</Label>
        <SearchableSelect
          value={assignedOfficeId}
          onValueChange={setAssignedOfficeId}
          options={offices.map((o) => ({ value: o.id, label: o.name }))}
          placeholder={offices.length ? "Select office (optional)…" : "No offices configured yet"}
        />
      </div>

      <div>
        <Label>Assigned Agent</Label>
        <SearchableSelect
          value={assignedAgentId}
          onValueChange={setAssignedAgentId}
          options={agents.map((a) => ({
            value: a.user_id,
            label: a.display_name ?? "Unnamed staff",
          }))}
          placeholder="Select agent (optional)…"
        />
      </div>

      {error && <div style={{ fontSize: 13, color: "#D14343" }}>{error}</div>}

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <Button variant="outline" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
        <PolarisButton
          variant="primary"
          label={submitting ? "Creating…" : "Create Port Call"}
          onClick={handleSubmit}
          disabled={submitting || !vesselId || !countryId}
        />
      </div>
    </div>
  );
}

export default CreatePortCallForm;

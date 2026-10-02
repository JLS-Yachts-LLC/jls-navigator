/**
 * PortCallsList — Agency Module, ticket #204.
 *
 * Dashboard "Arrivals" panel (FRS §4), scoped to inward clearance. Reads
 * ONLY from v_inward_clearance_active (migration 061) — never queries
 * port_calls / port_call_workflow_steps directly, same rule as
 * vessel_active_crew for the Visa module.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  PolarisButton,
  EmptyState,
  Skeleton,
} from "@/components/polaris-ui/primitives";
import type { ArrivalRow } from "./types";

export function PortCallsList({
  onOpenPortCall,
  onNewPortCall,
}: {
  onOpenPortCall: (portCallId: string) => void;
  onNewPortCall: () => void;
}) {
  const [rows, setRows] = useState<ArrivalRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("v_inward_clearance_active" as any)
        .select("*")
        .order("eta", { ascending: true });
      setRows((data ?? []) as unknown as ArrivalRow[]);
      setLoading(false);
    })();
  }, []);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 16,
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
        <h2
          style={{
            fontFamily: "'Halis GR','Barlow',sans-serif",
            fontSize: 20,
            color: "#E9CC72",
            margin: 0,
          }}
        >
          Arrivals — Inward Clearance
        </h2>
        <PolarisButton
          variant="primary"
          icon="plus"
          label="New Port Call"
          onClick={onNewPortCall}
        />
      </div>

      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <Skeleton height={48} />
          <Skeleton height={48} />
          <Skeleton height={48} />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon="anchor"
          message="No active inward clearance port calls."
          action={{ label: "New Port Call", onClick: onNewPortCall }}
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {rows.map((row, i) => (
            <button
              key={row.port_call_id}
              onClick={() => onOpenPortCall(row.port_call_id)}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                border: "none",
                textAlign: "left",
                cursor: "pointer",
                borderRadius: 8,
                padding: "12px 16px",
                background:
                  i % 2 === 1 ? "rgba(233,204,114,0.06)" : "transparent",
                color: "inherit",
              }}
            >
              <div>
                <div
                  style={{ fontSize: 14, fontWeight: 500, color: "#F0F4F8" }}
                >
                  {row.vessel_name ?? "—"}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: "rgba(233,204,114,0.7)",
                    marginTop: 2,
                  }}
                >
                  ETA: {row.eta ? new Date(row.eta).toLocaleString() : "—"} ·{" "}
                  {row.status_label ?? "—"}
                  {row.assigned_office ? ` · ${row.assigned_office}` : ""}
                </div>
              </div>
              <div style={{ fontSize: 12, color: "#E9CC72" }}>
                {row.steps_completed}/{row.steps_total} steps
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default PortCallsList;

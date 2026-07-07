/**
 * BerthBillingHub — Agency Module entry point for the New View.
 *
 * List <-> assign-form <-> detail, all via local state, so the whole
 * Marina Berth Billing flow stays inside the Polaris shell (mirrors
 * src/components/port-calls/PortCallsHub.tsx).
 */
import { useState } from "react";
import { BerthBillingList } from "./BerthBillingList";
import { AssignBerthForm } from "./AssignBerthForm";
import { BerthOccupancyDetail } from "./BerthOccupancyDetail";

type ViewState =
  | { mode: "list" }
  | { mode: "assign" }
  | { mode: "detail"; occupancyId: string };

export function BerthBillingHub() {
  const [view, setView] = useState<ViewState>({ mode: "list" });

  if (view.mode === "assign") {
    return (
      <AssignBerthForm
        onAssigned={(occupancyId) => setView({ mode: "detail", occupancyId })}
        onCancel={() => setView({ mode: "list" })}
      />
    );
  }

  if (view.mode === "detail") {
    return (
      <BerthOccupancyDetail
        occupancyId={view.occupancyId}
        embedded
        onBack={() => setView({ mode: "list" })}
      />
    );
  }

  return (
    <BerthBillingList
      onOpenOccupancy={(occupancyId) => setView({ mode: "detail", occupancyId })}
      onNewOccupancy={() => setView({ mode: "assign" })}
    />
  );
}

export default BerthBillingHub;

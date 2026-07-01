/**
 * PortCallDetail — Agency Module, Vertical Slice 1 (tickets #202, #203).
 *
 * Port Call detail view: vessel/voyage header, compliance traffic light,
 * pre-arrival document checklist, and the Inward Clearance workflow
 * stepper (FRS §10). All mutations go through the SECURITY DEFINER RPC
 * functions from migration 061 — this component never writes to
 * port_calls / port_call_workflow_steps / port_call_documents directly.
 *
 * Starting the workflow is a distinct, explicit action (ticket #202) —
 * it is never auto-started when a Port Call is created.
 *
 * Follows the embedded/onBack pattern used across the New View
 * (see src/routes/_app.yachts.$id.tsx, src/components/vessels/vessels-hub.tsx)
 * so it can be shown inline inside the Polaris shell.
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import {
  PolarisButton,
  SectionLabel,
} from "@/components/polaris-ui/primitives";
import { StatusSelect } from "./StatusSelect";
import {
  COMPLIANCE_COLOR,
  STEP_ORDER,
  type DocumentRow,
  type WorkflowStep,
} from "./types";

const STEP_LABELS: Record<string, string> = {
  arrival_notice: "Arrival Notice",
  documentation_verified: "Documentation Verified",
  government_submission: "Government Submission",
  authority_review: "Authority Review",
  approval_received: "Approval Received",
  arrival_clearance: "Arrival Clearance",
  port_entry: "Port Entry",
};

const VALIDATION_OPTIONS = [
  { value: "pending", label: "Pending" },
  { value: "valid", label: "Valid" },
  { value: "invalid", label: "Invalid" },
  { value: "expired", label: "Expired" },
];

export function PortCallDetail({
  portCallId,
  embedded = false,
  onBack,
}: {
  portCallId: string;
  embedded?: boolean;
  onBack?: () => void;
}) {
  const { user } = useAuth();
  const [vesselName, setVesselName] = useState<string>("");
  const [eta, setEta] = useState<string | null>(null);
  const [statusLabel, setStatusLabel] = useState<string>("");
  const [steps, setSteps] = useState<WorkflowStep[]>([]);
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [compliance, setCompliance] = useState<string>("compliant");
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [pcRes, stepsRes, docsRes, complianceRes] = await Promise.all([
        supabase
          .from("port_calls" as any)
          .select("eta, port_call_status(label), yachts(vessel_name)")
          .eq("id", portCallId)
          .maybeSingle(),
        supabase
          .from("port_call_workflow_steps" as any)
          .select("id, status, notes, workflow_step_definitions(code, label)")
          .eq("port_call_id", portCallId),
        supabase
          .from("port_call_documents" as any)
          .select(
            "id, code, label, is_mandatory, validation_status, approval_status",
          )
          .eq("port_call_id", portCallId),
        supabase.rpc("get_port_call_compliance" as any, {
          p_port_call_id: portCallId,
        }),
      ]);

      if (pcRes.error) throw pcRes.error;
      if (stepsRes.error) throw stepsRes.error;
      if (docsRes.error) throw docsRes.error;
      if (complianceRes.error) throw complianceRes.error;

      const pc = pcRes.data as any;
      setVesselName(pc?.yachts?.vessel_name ?? "—");
      setEta(pc?.eta ?? null);
      setStatusLabel(pc?.port_call_status?.label ?? "");

      const mappedSteps: WorkflowStep[] = ((stepsRes.data ?? []) as any[]).map(
        (s) => ({
          id: s.id,
          code: s.workflow_step_definitions.code,
          label:
            s.workflow_step_definitions.label ??
            STEP_LABELS[s.workflow_step_definitions.code],
          status: s.status,
          notes: s.notes,
        }),
      );
      mappedSteps.sort(
        (a, b) => STEP_ORDER.indexOf(a.code) - STEP_ORDER.indexOf(b.code),
      );

      setSteps(mappedSteps);
      setDocuments((docsRes.data ?? []) as unknown as DocumentRow[]);
      setCompliance((complianceRes.data as string) ?? "compliant");
    } catch (err: any) {
      setError(err.message ?? "Failed to load Port Call.");
    } finally {
      setLoading(false);
    }
  }, [portCallId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function startInwardClearance() {
    if (!user) return;
    setStarting(true);
    const { error: rpcError } = await supabase.rpc(
      "start_port_call_workflow" as any,
      {
        p_port_call_id: portCallId,
        p_workflow_code: "inward_clearance",
      },
    );
    setStarting(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    await load();
  }

  async function advanceStep(
    stepCode: string,
    newStatus: WorkflowStep["status"],
  ) {
    if (!user) return;
    const { error: rpcError } = await supabase.rpc(
      "advance_workflow_step" as any,
      {
        p_port_call_id: portCallId,
        p_step_code: stepCode,
        p_new_status: newStatus,
        p_notes: null,
      },
    );
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    await load();
  }

  async function updateDocumentStatus(
    documentId: string,
    validationStatus: DocumentRow["validation_status"],
  ) {
    if (!user) return;
    const { error: rpcError } = await supabase.rpc(
      "update_port_call_document_status" as any,
      {
        p_document_id: documentId,
        p_validation_status: validationStatus,
        p_approval_status: null,
      },
    );
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    await load();
  }

  if (loading)
    return (
      <div style={{ padding: 24, fontSize: 14, color: "#96CBC7" }}>
        Loading Port Call…
      </div>
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
        <Button
          variant="ghost"
          size="sm"
          onClick={onBack}
          style={{ alignSelf: "flex-start" }}
        >
          <ArrowLeft className="mr-1 h-4 w-4" /> Port Calls
        </Button>
      )}

      {/* Header */}
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
          <h2
            style={{
              fontFamily: "'Halis GR','Barlow',sans-serif",
              fontSize: 20,
              color: "#96CBC7",
              margin: 0,
            }}
          >
            {vesselName}
          </h2>
          <p
            style={{
              fontSize: 13,
              color: "rgba(150,203,199,0.7)",
              margin: "4px 0 0",
            }}
          >
            ETA: {eta ? new Date(eta).toLocaleString() : "—"} · Status:{" "}
            {statusLabel || "—"}
          </p>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            borderRadius: 999,
            padding: "4px 12px",
            fontSize: 12,
            fontWeight: 500,
            color: "#fff",
            background: COMPLIANCE_COLOR[compliance] ?? "#999",
          }}
        >
          <span style={{ textTransform: "capitalize" }}>
            {compliance.replace("_", " ")}
          </span>
        </div>
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

      {/* Inward Clearance stepper — or the Start action if not yet begun */}
      <section>
        <SectionLabel>Inward Clearance</SectionLabel>
        {steps.length === 0 ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              border: "1px dashed rgba(150,203,199,0.3)",
              borderRadius: 8,
              padding: 16,
            }}
          >
            <span style={{ fontSize: 13, color: "rgba(150,203,199,0.7)" }}>
              Inward Clearance has not been started for this Port Call.
            </span>
            <PolarisButton
              variant="primary"
              label={starting ? "Starting…" : "Start Inward Clearance"}
              onClick={startInwardClearance}
              disabled={starting}
            />
          </div>
        ) : (
          <ol
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
              listStyle: "none",
              margin: 0,
              padding: 0,
            }}
          >
            {steps.map((step, i) => (
              <li
                key={step.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  borderRadius: 8,
                  border: "1px solid rgba(150,203,199,0.24)",
                  padding: "8px 12px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span
                    style={{
                      display: "flex",
                      height: 24,
                      width: 24,
                      alignItems: "center",
                      justifyContent: "center",
                      borderRadius: "50%",
                      fontSize: 12,
                      color: "#fff",
                      background:
                        step.status === "completed"
                          ? "#3FAE6A"
                          : step.status === "rejected"
                            ? "#D14343"
                            : step.status === "in_progress"
                              ? "#4590BA"
                              : "#5A7A80",
                    }}
                  >
                    {i + 1}
                  </span>
                  <span style={{ fontSize: 14, color: "#F0F4F8" }}>
                    {step.label}
                  </span>
                </div>

                {step.status !== "completed" && (
                  <div style={{ display: "flex", gap: 8 }}>
                    {step.status === "pending" && (
                      <PolarisButton
                        label="Start"
                        onClick={() => advanceStep(step.code, "in_progress")}
                      />
                    )}
                    {step.status === "in_progress" && (
                      <PolarisButton
                        variant="primary"
                        label="Complete"
                        onClick={() => advanceStep(step.code, "completed")}
                      />
                    )}
                  </div>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* Pre-arrival document checklist */}
      <section>
        <SectionLabel>Pre-Arrival Documentation</SectionLabel>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {documents.map((doc, i) => (
            <div
              key={doc.id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                borderRadius: 8,
                padding: "8px 12px",
                background:
                  i % 2 === 1 ? "rgba(150,203,199,0.06)" : "transparent",
              }}
            >
              <span style={{ fontSize: 14, color: "#F0F4F8" }}>
                {doc.label}
                {doc.is_mandatory && (
                  <span style={{ color: "#D14343", marginLeft: 4 }}>*</span>
                )}
              </span>
              <StatusSelect
                value={doc.validation_status}
                onChange={(v) =>
                  updateDocumentStatus(
                    doc.id,
                    v as DocumentRow["validation_status"],
                  )
                }
                options={VALIDATION_OPTIONS}
              />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export default PortCallDetail;

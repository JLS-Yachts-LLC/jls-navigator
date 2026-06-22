/**
 * POLARIS — Seaport SLA helpers.  Ticket #125.
 * Durations are maintained in the DB by triggers (see migration 20260622000020);
 * these helpers drive the live SLATimer + status derivation in the UI.
 * POLARIS_SEAPORT_IMMIGRATION.md §5.
 */

export const SLA_TARGETS = {
  acknowledge_mins: 60,
  first_action_mins: 120,
  completion_mins: 240,
  report_mins: 60,
} as const;

export type SlaState = "met" | "breached" | "overdue" | "pending";

export function minsElapsed(from: string | null | undefined): number {
  if (!from) return 0;
  return Math.round((Date.now() - new Date(from).getTime()) / 60000);
}

export interface SeaportSla {
  submitted_at: string;
  acknowledged_at: string | null;
  fully_completed_at: string | null;
  report_sent_at: string | null;
  mins_to_acknowledge: number | null;
  mins_to_completion: number | null;
  mins_to_report: number | null;
  sla_target_mins: number | null;
}

export function acknowledgeState(s: SeaportSla): SlaState {
  if (s.acknowledged_at) return (s.mins_to_acknowledge ?? 0) <= SLA_TARGETS.acknowledge_mins ? "met" : "breached";
  return minsElapsed(s.submitted_at) > SLA_TARGETS.acknowledge_mins ? "overdue" : "pending";
}

export function completionState(s: SeaportSla): SlaState {
  if (s.fully_completed_at) return (s.mins_to_completion ?? 0) <= SLA_TARGETS.completion_mins ? "met" : "breached";
  return minsElapsed(s.submitted_at) > SLA_TARGETS.completion_mins ? "overdue" : "pending";
}

export function reportState(s: SeaportSla): SlaState {
  if (s.report_sent_at) return (s.mins_to_report ?? 0) <= SLA_TARGETS.report_mins ? "met" : "breached";
  if (s.fully_completed_at && minsElapsed(s.fully_completed_at) > SLA_TARGETS.report_mins) return "overdue";
  return "pending";
}

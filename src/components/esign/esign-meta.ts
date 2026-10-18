export const ESIGN_STATUS_ORDER = ["draft", "awaiting_approval", "sent", "viewed", "signed", "declined", "voided", "expired"] as const;

export const ESIGN_STATUS_LABEL: Record<string, string> = {
  draft: "Draft", sent: "Sent", viewed: "Viewed", signed: "Signed",
  declined: "Declined", voided: "Voided", expired: "Expired",
  awaiting_approval: "Awaiting signatory",
};

export const ESIGN_STATUS_COLOR: Record<string, string> = {
  draft: "bg-slate-500/15 text-slate-400",
  sent: "bg-blue-500/15 text-blue-400",
  viewed: "bg-violet-500/15 text-violet-400",
  signed: "bg-emerald-500/15 text-emerald-400",
  declined: "bg-red-500/15 text-red-400",
  voided: "bg-muted text-muted-foreground",
  expired: "bg-amber-500/15 text-amber-400",
  awaiting_approval: "bg-amber-500/15 text-amber-400",
};

export const ESIGN_EVENT_LABEL: Record<string, string> = {
  created: "Created", sent: "Sent for signature", viewed: "Opened by signer",
  signed: "Signed", declined: "Declined", downloaded: "Downloaded", voided: "Voided",
  stamped: "Vessel stamp added",
  signatory_requested: "Signature approval requested",
  signatory_approved: "Signatory approved their signature",
  signatory_declined: "Signatory declined their signature",
  signatory_applied: "Company signature applied",
  signatory_refused: "Company signature blocked",
};

/** What to tell the sender after doSendForSignature — it may be waiting on a signatory. */
export function sendOutcome(res: any, sentMessage: string): string {
  const waiting: string[] = Array.isArray(res?.awaitingApproval) ? res.awaitingApproval : [];
  return waiting.length
    ? `Waiting for ${waiting.join(" and ")} to approve the use of their signature — it will be sent automatically once approved`
    : sentMessage;
}

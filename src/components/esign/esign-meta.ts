export const ESIGN_STATUS_ORDER = ["draft", "sent", "viewed", "signed", "declined", "voided", "expired"] as const;

export const ESIGN_STATUS_LABEL: Record<string, string> = {
  draft: "Draft", sent: "Sent", viewed: "Viewed", signed: "Signed",
  declined: "Declined", voided: "Voided", expired: "Expired",
};

export const ESIGN_STATUS_COLOR: Record<string, string> = {
  draft: "bg-slate-500/15 text-slate-400",
  sent: "bg-blue-500/15 text-blue-400",
  viewed: "bg-violet-500/15 text-violet-400",
  signed: "bg-emerald-500/15 text-emerald-400",
  declined: "bg-red-500/15 text-red-400",
  voided: "bg-muted text-muted-foreground",
  expired: "bg-amber-500/15 text-amber-400",
};

export const ESIGN_EVENT_LABEL: Record<string, string> = {
  created: "Created", sent: "Sent for signature", viewed: "Opened by signer",
  signed: "Signed", declined: "Declined", downloaded: "Downloaded", voided: "Voided",
  stamped: "Vessel stamp added",
};

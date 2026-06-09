// Shared label + colour maps for the Service Desk. Single source of truth used
// by both the ticket list and the ticket detail page.

export type TicketStatus = "open" | "in_progress" | "waiting" | "resolved" | "closed";
export type TicketPriority = "urgent" | "high" | "normal" | "low";
export type TicketCategory =
  | "connectivity" | "cyber_security" | "hardware" | "software" | "network" | "general";

export const STATUS_ORDER: TicketStatus[] = ["open", "in_progress", "waiting", "resolved", "closed"];
export const PRIORITY_ORDER: TicketPriority[] = ["urgent", "high", "normal", "low"];
export const CATEGORY_ORDER: TicketCategory[] = [
  "connectivity", "cyber_security", "hardware", "software", "network", "general",
];

export const STATUS_LABEL: Record<string, string> = {
  open: "Open", in_progress: "In Progress", waiting: "Waiting",
  resolved: "Resolved", closed: "Closed",
};

export const STATUS_COLOR: Record<string, string> = {
  open: "bg-blue-500/15 text-blue-400",
  in_progress: "bg-amber-500/15 text-amber-400",
  waiting: "bg-violet-500/15 text-violet-400",
  resolved: "bg-emerald-500/15 text-emerald-400",
  closed: "bg-slate-500/15 text-slate-400",
};

// Plain bg- token for the little status dots in the filter strip.
export const STATUS_DOT: Record<string, string> = {
  open: "bg-blue-400", in_progress: "bg-amber-400", waiting: "bg-violet-400",
  resolved: "bg-emerald-400", closed: "bg-slate-400",
};

export const PRIORITY_LABEL: Record<string, string> = {
  urgent: "Urgent", high: "High", normal: "Normal", low: "Low",
};

export const PRIORITY_COLOR: Record<string, string> = {
  urgent: "bg-red-500/15 text-red-400",
  high: "bg-amber-500/15 text-amber-400",
  normal: "bg-muted text-muted-foreground",
  low: "bg-slate-500/15 text-slate-400",
};

export const CATEGORY_LABEL: Record<string, string> = {
  connectivity: "Connectivity", cyber_security: "Cyber Security", hardware: "Hardware",
  software: "Software", network: "Network", general: "General",
};

export const labelFor = (map: Record<string, string>, v: string | null | undefined) =>
  (v && map[v]) || v || "—";

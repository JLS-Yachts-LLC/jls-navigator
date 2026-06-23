import type { ComponentType } from "react";
import { Wrench, Anchor, Forklift, Trash2, Fuel, Flame, Siren } from "lucide-react";

export const ORBIT_CATEGORIES: { key: string; label: string }[] = [
  { key: "TECHNICAL_MARINE", label: "Technical & Marine" },
  { key: "NAVIGATION_ELECTRONICS", label: "Navigation & Electronics" },
  { key: "ELECTRICAL_AUTOMATION", label: "Electrical & Automation" },
  { key: "SAFETY_COMPLIANCE", label: "Safety & Compliance" },
  { key: "ENVIRONMENTAL_MONITORING", label: "Environmental & Monitoring" },
  { key: "MARINA_SUPPORT", label: "Marina Support" },
  { key: "WASTE_MANAGEMENT", label: "Waste Management (MARPOL)" },
  { key: "TENDER_JETSKI_SEABOB", label: "Tender / Jet Ski / Seabob" },
  { key: "EQUIPMENT_RENTAL", label: "Equipment Rental" },
  { key: "FUEL_BUNKERING", label: "Fuel & Bunkering" },
  { key: "GAS_CYLINDER", label: "Gas & Cylinders" },
];
export const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(ORBIT_CATEGORIES.map(c => [c.key, c.label]));

/** Dashboard quick-action tiles → pre-set category (Emergency is visually distinct). */
export const QUICK_ACTIONS: { label: string; category: string; icon: ComponentType<{ className?: string }>; emergency?: boolean }[] = [
  { label: "Technical Service", category: "TECHNICAL_MARINE", icon: Wrench },
  { label: "Marina Support", category: "MARINA_SUPPORT", icon: Anchor },
  { label: "Equipment Rental", category: "EQUIPMENT_RENTAL", icon: Forklift },
  { label: "Waste Collection", category: "WASTE_MANAGEMENT", icon: Trash2 },
  { label: "Fuel", category: "FUEL_BUNKERING", icon: Fuel },
  { label: "Gas Refill", category: "GAS_CYLINDER", icon: Flame },
  { label: "Emergency Assistance", category: "TECHNICAL_MARINE", icon: Siren, emergency: true },
];

export const ORBIT_STATUSES = [
  "draft", "submitted", "awaiting_quotation", "awaiting_approval", "approved", "scheduled", "in_progress", "completed", "cancelled",
] as const;
export type OrbitStatus = typeof ORBIT_STATUSES[number];

export const STATUS_META: Record<string, { label: string; color: string }> = {
  draft:              { label: "Draft",            color: "bg-muted text-muted-foreground border-border" },
  submitted:          { label: "Submitted",        color: "bg-slate-500/15 text-slate-500 border-slate-500/20" },
  awaiting_quotation: { label: "Awaiting Quote",   color: "bg-blue-500/15 text-blue-500 border-blue-500/20" },
  awaiting_approval:  { label: "Awaiting Approval", color: "bg-violet-500/15 text-violet-500 border-violet-500/20" },
  approved:           { label: "Approved",         color: "bg-teal-500/15 text-teal-500 border-teal-500/20" },
  scheduled:          { label: "Scheduled",        color: "bg-cyan-500/15 text-cyan-600 border-cyan-500/20" },
  in_progress:        { label: "In Progress",      color: "bg-amber-500/15 text-amber-600 border-amber-500/20" },
  completed:          { label: "Completed",        color: "bg-emerald-500/15 text-emerald-600 border-emerald-500/20" },
  cancelled:          { label: "Cancelled",        color: "bg-red-500/15 text-red-500 border-red-500/20" },
};

export const URGENCY_META: Record<string, { label: string; color: string }> = {
  critical: { label: "Critical", color: "text-red-500" },
  high:     { label: "High",     color: "text-amber-600 dark:text-amber-400" },
  medium:   { label: "Medium",   color: "text-blue-500" },
  low:      { label: "Low",      color: "text-muted-foreground" },
};

/** SLA response target per urgency (informational). */
export const SLA_TARGET: Record<string, string> = {
  critical: "1 hour", high: "4 hours", medium: "24 hours", low: "72 hours",
};

/** Allowed forward transitions (cancel is always available except when terminal). */
export const NEXT_STATUS: Record<string, OrbitStatus[]> = {
  draft: ["submitted"],
  submitted: ["awaiting_quotation", "in_progress"],
  awaiting_quotation: ["awaiting_approval"],
  awaiting_approval: ["approved"],
  approved: ["scheduled"],
  scheduled: ["in_progress"],
  in_progress: ["completed"],
  completed: [],
  cancelled: [],
};

import {
  IdCard, Cpu, BarChart3, Cog, Boxes, Car, ShoppingCart, UserPlus, GraduationCap,
  type LucideIcon,
} from "lucide-react";

// Canonical department list — single source of truth for the Guides sidebar
// group, the overview cards, and the editor's department picker. `key` is the
// URL-safe slug in the URL (/guides/<key>); `label` is the display name AND the
// value stored in guides.department.
export type Department = { key: string; label: string; icon: LucideIcon };

export const DEPARTMENTS: Department[] = [
  { key: "crew-immigration", label: "Crew & Immigration", icon: IdCard },
  { key: "yacht-it",         label: "Yacht IT Solutions", icon: Cpu },
  { key: "finance",          label: "Finance",            icon: BarChart3 },
  { key: "operations",       label: "Operations",         icon: Cog },
  { key: "logistics",        label: "Logistics",          icon: Boxes },
  { key: "transport-fleet",  label: "Transport & Fleet",  icon: Car },
  { key: "procurement",      label: "Procurement",        icon: ShoppingCart },
  { key: "crew-placement",   label: "Crew Placement",     icon: UserPlus },
  { key: "training",         label: "Training",           icon: GraduationCap },
];

export const departmentByKey = (key: string) => DEPARTMENTS.find(d => d.key === key);
// Resolve a URL slug to the stored department label (falls back to the raw param).
export const departmentLabel = (key: string) => departmentByKey(key)?.label ?? key;

export function slugify(s: string) {
  return s.toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "guide";
}

import { createFileRoute } from "@tanstack/react-router";
import { ResourcePage, type ResourceConfig } from "@/components/resource-page";
import { Users } from "lucide-react";

const config: ResourceConfig = {
  table: "waypoint_suppliers",
  title: "Suppliers",
  breadcrumb: "Waypoint / Chandlery & Procurement",
  singular: "Supplier",
  icon: <Users className="h-4 w-4 text-primary/80" />,
  statusKey: "status",
  emptyHint: "Your approved vendor network for chandlery, parts, provisions and technical services.",
  orderBy: { col: "name", asc: true },
  statusLabels: { active: "Active", preferred: "Preferred", inactive: "Inactive" },
  statusColors: {
    active: "bg-emerald-500/15 text-emerald-500", preferred: "bg-blue-500/15 text-blue-500", inactive: "bg-slate-500/15 text-slate-400",
  },
  fields: [
    { key: "name", label: "Supplier Name", required: true, table: true },
    { key: "category", label: "Category", type: "select", table: true, options: ["chandlery", "parts", "provisions", "technical", "other"] },
    { key: "contact_name", label: "Contact Name", table: true },
    { key: "email", label: "Email", type: "email", table: true },
    { key: "phone", label: "Phone" },
    { key: "country", label: "Country", table: true },
    { key: "status", label: "Status", type: "select", table: true, badge: true, options: ["active", "preferred", "inactive"] },
    { key: "notes", label: "Notes", type: "textarea" },
  ],
};

export const Route = createFileRoute("/_app/waypoint/")({
  component: () => <ResourcePage config={config} />,
  head: () => ({ meta: [{ title: "Suppliers — Polaris" }] }),
});

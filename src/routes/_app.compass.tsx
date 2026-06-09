import { createFileRoute } from "@tanstack/react-router";
import { ResourcePage, type ResourceConfig } from "@/components/resource-page";
import { Compass } from "lucide-react";

const config: ResourceConfig = {
  table: "compass_vendors",
  title: "Compass — Vendor Network",
  breadcrumb: "Compass",
  singular: "Vendor",
  icon: <Compass className="h-4 w-4 text-primary/80" />,
  statusKey: "category",
  emptyHint: "The regional marketplace of vetted service providers, marinas, agents and suppliers.",
  orderBy: { col: "name", asc: true },
  statusLabels: {
    chandlery: "Chandlery", fuel: "Fuel", marina: "Marina", agent: "Agent",
    repair: "Repair", provisioning: "Provisioning", service: "Service",
  },
  statusColors: {
    chandlery: "bg-blue-500/15 text-blue-500", fuel: "bg-amber-500/15 text-amber-500",
    marina: "bg-cyan-500/15 text-cyan-500", agent: "bg-emerald-500/15 text-emerald-500",
    repair: "bg-violet-500/15 text-violet-500", provisioning: "bg-teal-500/15 text-teal-500",
    service: "bg-slate-500/15 text-slate-400",
  },
  fields: [
    { key: "name", label: "Vendor Name", required: true, table: true },
    { key: "category", label: "Category", type: "select", table: true, badge: true,
      options: ["chandlery", "fuel", "marina", "agent", "repair", "provisioning", "service"] },
    { key: "city", label: "City", table: true },
    { key: "country", label: "Country", table: true },
    { key: "email", label: "Email", type: "email" },
    { key: "phone", label: "Phone" },
    { key: "website", label: "Website" },
    { key: "rating", label: "Rating (1-5)", type: "number", table: true },
    { key: "notes", label: "Notes", type: "textarea" },
  ],
};

export const Route = createFileRoute("/_app/compass")({
  component: () => <ResourcePage config={config} />,
  head: () => ({ meta: [{ title: "Compass — Polaris" }] }),
});

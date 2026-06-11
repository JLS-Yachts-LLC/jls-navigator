import { createFileRoute } from "@tanstack/react-router";
import { ResourcePage, type ResourceConfig } from "@/components/resource-page";
import { Globe } from "lucide-react";

const config: ResourceConfig = {
  table: "agency_contacts",
  title: "Agency Network",
  breadcrumb: "Port & Agency / Agency Network",
  singular: "Contact",
  icon: <Globe className="h-4 w-4 text-primary/80" />,
  statusKey: "contact_type",
  emptyHint: "Your network of owners, family offices, captains, agents, suppliers, marinas and authorities.",
  orderBy: { col: "name", asc: true },
  statusLabels: {
    owner: "Owner", family_office: "Family Office", captain: "Captain", agent: "Agent",
    supplier: "Supplier", marina: "Marina", authority: "Authority",
  },
  statusColors: {
    owner: "bg-violet-500/15 text-violet-500", family_office: "bg-blue-500/15 text-blue-500",
    captain: "bg-teal-500/15 text-teal-500", agent: "bg-emerald-500/15 text-emerald-500",
    supplier: "bg-amber-500/15 text-amber-500", marina: "bg-cyan-500/15 text-cyan-500",
    authority: "bg-slate-500/15 text-slate-400",
  },
  fields: [
    { key: "name", label: "Name", required: true, table: true },
    { key: "contact_type", label: "Type", type: "select", table: true, badge: true,
      options: ["owner", "family_office", "captain", "agent", "supplier", "marina", "authority"] },
    { key: "company", label: "Company", table: true },
    { key: "email", label: "Email", type: "email", table: true },
    { key: "phone", label: "Phone" },
    { key: "country", label: "Country", table: true },
    { key: "region", label: "Region" },
    { key: "notes", label: "Notes", type: "textarea" },
  ],
};

export const Route = createFileRoute("/_app/agency")({
  component: () => <ResourcePage config={config} />,
  head: () => ({ meta: [{ title: "Agency Network — Polaris" }] }),
});

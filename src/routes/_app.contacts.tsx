import { createFileRoute } from "@tanstack/react-router";
import { ResourcePage, type ResourceConfig } from "@/components/resource-page";
import { Contact } from "lucide-react";

// Business / network Contacts Directory (internal, staff-only). Grouped into
// Networks, Managers, Yacht Captains (and any group added later). The group field
// is a select, so ResourcePage surfaces it as a quick filter automatically.
const config: ResourceConfig = {
  table: "directory_contacts",
  title: "Contacts",
  breadcrumb: "Resources / Contacts",
  singular: "Contact",
  icon: <Contact className="h-4 w-4 text-primary/80" />,
  emptyHint: "Industry network, yacht managers and captains — JLS's external contact book.",
  orderBy: { col: "name", asc: true },
  fields: [
    { key: "group_name", label: "Group", type: "select", table: true, options: ["Networks", "Managers", "Yacht Captains"] },
    { key: "name", label: "Name", table: true },
    { key: "company", label: "Company", table: true },
    { key: "position", label: "Position", table: true },
    { key: "phone", label: "Phone", table: true },
    { key: "email", label: "Email", type: "email", table: true },
    { key: "notes", label: "Notes", type: "textarea" },
  ],
};

export const Route = createFileRoute("/_app/contacts")({
  component: () => <ResourcePage config={config} />,
  head: () => ({ meta: [{ title: "Contacts — Polaris" }] }),
});

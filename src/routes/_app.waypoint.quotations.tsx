import { createFileRoute } from "@tanstack/react-router";
import { ResourcePage, type ResourceConfig } from "@/components/resource-page";
import { FileText } from "lucide-react";

const config: ResourceConfig = {
  table: "waypoint_quotations",
  title: "Quotations",
  breadcrumb: "Waypoint / Chandlery & Procurement",
  singular: "Quotation",
  icon: <FileText className="h-4 w-4 text-primary/80" />,
  statusKey: "status",
  emptyHint: "Request, compare and approve supplier quotations.",
  orderBy: { col: "created_at", asc: false },
  statusLabels: { requested: "Requested", received: "Received", approved: "Approved", rejected: "Rejected", ordered: "Ordered" },
  statusColors: {
    requested: "bg-blue-500/15 text-blue-500", received: "bg-amber-500/15 text-amber-500",
    approved: "bg-emerald-500/15 text-emerald-500", rejected: "bg-red-500/15 text-red-500", ordered: "bg-violet-500/15 text-violet-500",
  },
  fields: [
    { key: "description", label: "Description", required: true, table: true, full: true },
    { key: "yacht_id", label: "Vessel", type: "yacht", table: true },
    { key: "quote_no", label: "Quote No.", table: true, mono: true },
    { key: "supplier", label: "Supplier", table: true },
    { key: "amount", label: "Amount", type: "number", table: true },
    { key: "currency", label: "Currency", type: "select", options: ["AED", "USD", "EUR", "GBP"] },
    { key: "status", label: "Status", type: "select", table: true, badge: true, options: ["requested", "received", "approved", "rejected", "ordered"] },
    { key: "valid_until", label: "Valid Until", type: "date", table: true },
    { key: "notes", label: "Notes", type: "textarea" },
  ],
};

export const Route = createFileRoute("/_app/waypoint/quotations")({
  component: () => <ResourcePage config={config} />,
  head: () => ({ meta: [{ title: "Quotations — Polaris" }] }),
});

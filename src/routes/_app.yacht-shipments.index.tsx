import { createFileRoute } from "@tanstack/react-router";
import { ResourcePage, type ResourceConfig } from "@/components/resource-page";
import { Ship } from "lucide-react";

const config: ResourceConfig = {
  table: "yacht_shipments",
  title: "Yacht Shipments",
  breadcrumb: "Logistics / Yacht Shipments",
  singular: "Shipment",
  icon: <Ship className="h-4 w-4 text-primary/80" />,
  statusKey: "status",
  emptyHint: "Whole yachts moving as cargo — import or export, by freighter between ports.",
  orderBy: { col: "departure_date", asc: false },
  statusLabels: {
    booked: "Booked", loading: "Loading", in_transit: "In Transit",
    arrived: "Arrived", discharged: "Discharged", delivered: "Delivered", cancelled: "Cancelled",
  },
  statusColors: {
    booked: "bg-slate-500/15 text-slate-400",
    loading: "bg-amber-500/15 text-amber-500",
    in_transit: "bg-blue-500/15 text-blue-500",
    arrived: "bg-violet-500/15 text-violet-500",
    discharged: "bg-teal-500/15 text-teal-500",
    delivered: "bg-emerald-500/15 text-emerald-500",
    cancelled: "bg-red-500/15 text-red-500",
  },
  fields: [
    { key: "yacht_id", label: "Yacht", type: "yacht", required: true, table: true },
    { key: "direction", label: "Direction", type: "select", table: true, required: true, options: ["import", "export"] },
    { key: "carrier", label: "Carrier", table: true, placeholder: "Shipping line" },
    { key: "carrier_vessel", label: "Carrier Vessel", placeholder: "Freighter name" },
    { key: "origin_port", label: "Origin Port", table: true },
    { key: "destination_port", label: "Destination Port", table: true },
    { key: "booking_ref", label: "Booking / BL No.", mono: true },
    { key: "loading_date", label: "Loading Date", type: "date" },
    { key: "departure_date", label: "Departure Date", type: "date", table: true },
    { key: "eta", label: "ETA", type: "date", table: true },
    { key: "arrival_date", label: "Arrival Date", type: "date" },
    { key: "status", label: "Status", type: "select", table: true, badge: true, options: ["booked", "loading", "in_transit", "arrived", "discharged", "delivered", "cancelled"] },
    { key: "notes", label: "Notes", type: "textarea", full: true },
  ],
};

export const Route = createFileRoute("/_app/yacht-shipments/")({
  component: () => <ResourcePage config={config} />,
  head: () => ({ meta: [{ title: "Yacht Shipments — Polaris" }] }),
});

import { createFileRoute } from "@tanstack/react-router";
import { WarehouseRequests } from "@/components/shipsync/warehouse/WarehouseRequests";

export const Route = createFileRoute("/_app/warehouse-requests")({
  component: () => {
    const { open } = Route.useSearch();
    return (
      <div className="mx-auto flex h-full max-w-6xl flex-col px-6 py-6">
        <h1 className="mb-1 font-display text-2xl font-semibold">Warehouse requests</h1>
        <p className="mb-4 text-sm text-muted-foreground">
          Ask the Warehouse for an incoming shipment, a picking or a dispatch. Attach the documents and photos; the Warehouse and Logistics are emailed.
        </p>
        <div className="min-h-0 flex-1"><WarehouseRequests openNumber={open} /></div>
      </div>
    );
  },
  validateSearch: (search: Record<string, unknown>): { open?: string } =>
    typeof search.open === "string" ? { open: search.open } : {},
  head: () => ({ meta: [{ title: "Warehouse requests — Polaris" }] }),
});

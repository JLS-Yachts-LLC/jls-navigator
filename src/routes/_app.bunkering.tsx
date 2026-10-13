import { createFileRoute } from "@tanstack/react-router";
import { BunkeringEnquiries } from "@/components/bunkering/BunkeringEnquiries";

export const Route = createFileRoute("/_app/bunkering")({
  component: () => {
    const { open } = Route.useSearch();
    return (
      <div className="mx-auto flex h-full max-w-6xl flex-col px-6 py-6">
        <h1 className="mb-1 font-display text-2xl font-semibold">Bunkering enquiries</h1>
        <p className="mb-4 text-sm text-muted-foreground">
          One record for each bunkering enquiry: what the yacht asked for, the supplier quotations, the Captain or Chief Engineer's approval, and the delivery.
        </p>
        <div className="min-h-0 flex-1"><BunkeringEnquiries openNumber={open} /></div>
      </div>
    );
  },
  validateSearch: (search: Record<string, unknown>): { open?: string } =>
    typeof search.open === "string" ? { open: search.open } : {},
  head: () => ({ meta: [{ title: "Bunkering enquiries — Polaris" }] }),
});

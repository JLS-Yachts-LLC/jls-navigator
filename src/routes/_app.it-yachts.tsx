import { createFileRoute } from "@tanstack/react-router";
import { ItYachtsPage } from "@/components/yacht-it/it-yachts-page";

export const Route = createFileRoute("/_app/it-yachts")({
  component: ItYachtsPage,
  head: () => ({ meta: [{ title: "IT Yachts — Polaris" }] }),
});

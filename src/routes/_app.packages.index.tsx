import { createFileRoute } from "@tanstack/react-router";
import { PackagesPage } from "@/components/packages-page";

export const Route = createFileRoute("/_app/packages/")({
  component: PackagesPage,
  head: () => ({ meta: [{ title: "Packages — Polaris" }] }),
});

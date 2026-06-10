import { createFileRoute } from "@tanstack/react-router";
import { LicensingPage } from "@/components/licensing-page";

export const Route = createFileRoute("/_app/licensing")({
  component: LicensingPage,
  head: () => ({ meta: [{ title: "Licensing — Yacht IT Solutions" }] }),
});

import { createFileRoute } from "@tanstack/react-router";
import { VisaWizardPage } from "@/components/crew-immigration/visa-wizard-page";

export const Route = createFileRoute("/_app/crew-immigration/visas/new")({
  component: VisaWizardPage,
  head: () => ({ meta: [{ title: "New Visa Application — Polaris" }] }),
});

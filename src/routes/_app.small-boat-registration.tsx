import { createFileRoute } from "@tanstack/react-router";
import { SmallBoatRegistrationPage } from "@/components/small-boat-registration-page";

export const Route = createFileRoute("/_app/small-boat-registration")({
  component: SmallBoatRegistrationPage,
  head: () => ({ meta: [{ title: "Small Boat Registration — JLS Yachts CRM" }] }),
});

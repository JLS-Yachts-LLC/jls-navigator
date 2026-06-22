import { createFileRoute } from "@tanstack/react-router";
import { EmergencyContactsPage } from "@/components/emergency/EmergencyContactsPage";

export const Route = createFileRoute("/_app/emergency-contacts")({
  component: EmergencyContactsPage,
  head: () => ({ meta: [{ title: "Emergency Contacts — Polaris" }] }),
});

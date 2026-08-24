import { createFileRoute } from "@tanstack/react-router";
import { DriversPage } from "@/components/crew-cab/drivers-page";

export const Route = createFileRoute("/_app/crew-cab/drivers")({
  component: DriversPage,
  head: () => ({ meta: [{ title: "Drivers — Crew Care" }] }),
});

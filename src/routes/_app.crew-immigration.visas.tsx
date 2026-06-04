import { createFileRoute } from "@tanstack/react-router";
import { VisasPage } from "@/components/crew-immigration/visas-page";

export const Route = createFileRoute("/_app/crew-immigration/visas")({
  component: VisasPage,
  head: () => ({ meta: [{ title: "Visas — Aquila One" }] }),
});

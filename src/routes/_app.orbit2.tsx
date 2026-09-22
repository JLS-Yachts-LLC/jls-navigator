import { createFileRoute } from "@tanstack/react-router";
import { Orbit2Hub } from "@/components/orbit2/orbit2-hub";

export const Route = createFileRoute("/_app/orbit2")({
  component: Orbit2Hub,
  head: () => ({ meta: [{ title: "Orbit 2 — Polaris" }] }),
});

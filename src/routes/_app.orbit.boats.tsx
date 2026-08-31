import { createFileRoute } from "@tanstack/react-router";
import { OrbitBoatsHub } from "@/components/orbit/orbit-boats-hub";

export const Route = createFileRoute("/_app/orbit/boats")({
  component: OrbitBoatsHub,
  head: () => ({ meta: [{ title: "Small Boats — Orbit — Polaris" }] }),
});

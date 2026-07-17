import { createFileRoute } from "@tanstack/react-router";
import { ParcelChecker } from "@/components/shipsync/ParcelChecker";

export const Route = createFileRoute("/_app/shipsync_/checker")({
  component: ParcelChecker,
  head: () => ({ meta: [{ title: "Parcel Checker — ShipSync" }] }),
});

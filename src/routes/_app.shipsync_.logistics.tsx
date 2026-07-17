import { createFileRoute } from "@tanstack/react-router";
import { LogisticsApp } from "@/components/shipsync/LogisticsApp";

/** Standalone Logistics app — full-screen, its own URL, like the driver app
 *  (/shipsync/driver). The trailing underscore on "shipsync_" breaks it out of
 *  the /shipsync parent layout so it renders on its own; AppLayout renders the
 *  /shipsync/logistics path bare (no office chrome). */
export const Route = createFileRoute("/_app/shipsync_/logistics")({
  component: LogisticsApp,
  head: () => ({ meta: [{ title: "ShipSync — Logistics" }] }),
});

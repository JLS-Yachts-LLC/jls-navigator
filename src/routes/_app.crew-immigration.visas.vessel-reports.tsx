/**
 * Vessel Visa Reports — route. Ticket #194.
 * Path: /crew-immigration/visas/vessel-reports
 * Access: crew_immigration (and global admins) — enforced server-side on the
 * generate/send/prefs API routes; the screen reads via RLS-scoped queries.
 */
import { createFileRoute } from "@tanstack/react-router";
import { VesselReportScreen } from "@/components/visa/VesselReportScreen";

export const Route = createFileRoute(
  "/_app/crew-immigration/visas/vessel-reports",
)({
  component: VesselReportScreen,
  head: () => ({ meta: [{ title: "Vessel Visa Reports — Polaris" }] }),
});

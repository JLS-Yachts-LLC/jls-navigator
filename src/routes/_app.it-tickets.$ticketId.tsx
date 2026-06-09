import { createFileRoute } from "@tanstack/react-router";
import { TicketDetailPage } from "@/components/service-desk/ticket-detail-page";

export const Route = createFileRoute("/_app/it-tickets/$ticketId")({
  component: TicketDetailPage,
  head: () => ({ meta: [{ title: "Ticket — Service Desk" }] }),
});

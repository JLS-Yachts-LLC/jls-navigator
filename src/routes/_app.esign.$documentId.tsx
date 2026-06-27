import { createFileRoute } from "@tanstack/react-router";
import { EsignDetailPage } from "@/components/esign/esign-detail-page";

export const Route = createFileRoute("/_app/esign/$documentId")({
  component: EsignDetailRoute,
  head: () => ({ meta: [{ title: "Document — Anchor" }] }),
});

function EsignDetailRoute() {
  const { documentId } = Route.useParams();
  return <EsignDetailPage documentId={documentId} />;
}

import { createFileRoute } from "@tanstack/react-router";
import { DocumentLinksPage } from "@/components/documents/document-links-page";

export const Route = createFileRoute("/_app/document-links")({
  component: DocumentLinksPage,
  head: () => ({ meta: [{ title: "Document Links — Polaris" }] }),
});

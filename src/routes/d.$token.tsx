import { createFileRoute } from "@tanstack/react-router";
import { SecureDocumentPage } from "@/components/documents/secure-document-page";

// Public, unauthenticated document delivery. NOT under `_app`, so no session
// gate: the unguessable token in the path is the credential, exactly as with
// /sign/$token.
export const Route = createFileRoute("/d/$token")({
  component: SecureDocumentPage,
  head: () => ({ meta: [{ title: "Secure Document — JLS Yachts" }] }),
});

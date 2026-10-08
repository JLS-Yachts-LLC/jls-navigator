import { createFileRoute } from "@tanstack/react-router";
import { CaptainPortal } from "@/components/portal/captain-portal";

// Captain's View — the client portal. NOT under `_app` (own auth + MFA flow,
// no staff shell). All data access is scoped server-side by RLS to the
// captain's own yacht and requires an MFA-verified (aal2) session.
//
// It is also the installable phone app: the manifest (named after the vessel on
// its own address) and the service worker live in src/components/portal/portal-app.tsx.
export const Route = createFileRoute("/portal")({
  component: CaptainPortal,
  head: () => ({
    meta: [
      { title: "Client Portal — JLS Yachts" },
      // From the home screen it opens full-screen, like an installed app.
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-title", content: "JLS Yachts" },
      // A solid status bar, so nothing slides under the clock and notch.
      { name: "apple-mobile-web-app-status-bar-style", content: "black" },
      { name: "theme-color", content: "#0D1E44" },
      // Phone numbers in the directory are links already; don't restyle the rest.
      { name: "format-detection", content: "telephone=no" },
    ],
    links: [
      // Only the portal links this manifest, so only the portal installs as an app.
      { rel: "manifest", href: "/portal.webmanifest" },
      // iOS ignores manifest icons and reads this instead.
      { rel: "apple-touch-icon", href: "/portal-icons/apple-touch-icon.png" },
    ],
  }),
});

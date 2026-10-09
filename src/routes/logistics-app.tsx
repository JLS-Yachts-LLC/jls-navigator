/**
 * /logistics-app — Polaris Logistics for the logistics team's phones.
 *
 * Outside the /_app layout for the same reason /orbit-app is: the desktop shell
 * (sidebar, top bar, Leo) is unusable one-handed on a warehouse floor. It still
 * needs a signed-in session, and sends a signed-out visitor to sign in and then
 * straight back here.
 */
import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { LogisticsApp } from "@/components/logistics/logistics-app";
import { hasStoredSession } from "@/lib/stored-session";

export const LOGISTICS_APP_PATH = "/logistics-app";

export const Route = createFileRoute("/logistics-app")({
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      // No signal: the sign-in can't be renewed, but the person is still signed in on this phone. Let them in —
      // check-ins and handovers are kept on the phone and sent once the connection is back.
      if (!navigator.onLine && hasStoredSession()) return;
      throw redirect({ to: "/auth", search: { next: LOGISTICS_APP_PATH } as any });
    }
  },
  component: LogisticsApp,
  head: () => ({
    meta: [
      { title: "Polaris Logistics" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-title", content: "Logistics" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "theme-color", content: "#07435E" },
    ],
    links: [
      // Only this page links the manifest, so only the logistics app is installable.
      { rel: "manifest", href: "/logistics-app.webmanifest" },
      // iOS ignores manifest icons and reads this instead.
      { rel: "apple-touch-icon", href: "/logistics-icons/apple-touch-icon.png" },
    ],
  }),
});

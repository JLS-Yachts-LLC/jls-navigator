/**
 * /orbit-app — the Orbit field app for the operations team's phones.
 *
 * Deliberately outside the /_app layout: the desktop Polaris shell (sidebar,
 * top bar, Leo) is unusable on a phone at a berth, and this screen needs none of
 * it. It still requires a signed-in session — the guard below mirrors _app's,
 * and sends a signed-out visitor to sign in and then straight back here.
 */
import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Orbit2FieldApp } from "@/components/orbit2/orbit2-field-app";
import { ORBIT_FIELD_PATH } from "@/components/orbit2/orbit2-constants";

export const Route = createFileRoute("/orbit-app")({
  beforeLoad: async () => {
    // The session lives in browser storage, so it is invisible during SSR — only
    // enforce on the client, exactly as _app does.
    if (typeof window === "undefined") return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw redirect({ to: "/auth", search: { next: ORBIT_FIELD_PATH } as any });
  },
  component: Orbit2FieldApp,
  head: () => ({
    meta: [
      { title: "Orbit — Field" },
      // "Add to Home Screen" then opens it full-screen, like an installed app.
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-title", content: "Orbit" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      // The manifest's theme colour, so the browser chrome matches before install.
      // Brand Teal Blue — the same value PolarisLogo uses.
      { name: "theme-color", content: "#07435E" },
    ],
    links: [
      // Only this page links the manifest, so only the field app is installable —
      // the desktop Polaris is not offered as a phone app.
      { rel: "manifest", href: "/orbit-app.webmanifest" },
      // iOS ignores manifest icons and reads this instead.
      { rel: "apple-touch-icon", href: "/orbit-icons/apple-touch-icon.png" },
    ],
  }),
});

/**
 * /chats-app — Polaris Chats: just the WhatsApp inbox, as its own installable app.
 *
 * For staff who answer a WhatsApp number all day (Angela on the Training number)
 * and want something like WhatsApp Desktop: a window of its own, a taskbar badge
 * and an alert when a message comes in. Outside the /_app layout, like
 * /logistics-app, so there is no sidebar or top bar. It still needs a signed-in
 * session, and sends a signed-out visitor to sign in and then straight back here.
 */
import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { ChatsApp } from "@/components/whatsapp/chats-app";

export const CHATS_APP_PATH = "/chats-app";

export const Route = createFileRoute("/chats-app")({
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw redirect({ to: "/auth", search: { next: CHATS_APP_PATH } as any });
  },
  component: ChatsApp,
  head: () => ({
    meta: [
      { title: "Polaris Chats" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-title", content: "Chats" },
      { name: "theme-color", content: "#0B1F3A" },
    ],
    links: [
      // Only this page links the manifest, so only the Chats app is installable from here.
      { rel: "manifest", href: "/chats-app.webmanifest" },
      // iOS ignores manifest icons and reads this instead.
      { rel: "apple-touch-icon", href: "/chats-icons/apple-touch-icon.png" },
    ],
  }),
});

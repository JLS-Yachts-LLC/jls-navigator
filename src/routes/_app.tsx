import { createFileRoute, redirect } from "@tanstack/react-router";
import { AppLayout } from "@/components/app-layout";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_app")({
  beforeLoad: async () => {
    // The Supabase session lives in the browser (localStorage), so it's invisible
    // during SSR — checking on the server returns null and renders the login page
    // for a logged-in user, causing a flash before the client corrects it. Only
    // enforce the guard on the client.
    if (typeof window === "undefined") return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      throw redirect({ to: "/auth" });
    }
  },
  component: AppLayout,
});

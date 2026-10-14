import { createFileRoute } from "@tanstack/react-router";
import { GuestPortal } from "@/components/guest/guest-portal";

// Guest access — outside people who can see only the documents staff have shared
// with them. NOT under `_app` (no staff shell). Every read goes through
// /api/guest, which checks the guest's shares; RLS fences the login out of the
// database entirely.
export const Route = createFileRoute("/guest")({
  component: GuestPortal,
  head: () => ({
    meta: [
      { title: "Shared documents — JLS Yachts" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

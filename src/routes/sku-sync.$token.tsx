/**
 * Public Lightspeed → QuickBooks SKU sync — /sku-sync/$token
 *
 * The login-free replacement for the n8n "Update Item and Invoice Descriptions"
 * form the Waypoint team used: paste SKUs, each is looked up in Lightspeed and
 * created or updated as an Inventory item in the Superyacht ME retail (Waypoint)
 * QuickBooks company. Deliberately OUTSIDE the /_app shell (same pattern as
 * /qb-upload/$token, /sign/$token and /forms/fill/$token) so nothing behind the
 * login is exposed. The token IS the authorisation; rotating it
 * (integration_settings → lightspeed_sku_link) kills a shared URL instantly.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { LightspeedSkuSyncPanel } from "@/components/lightspeed/sku-sync-panel";

export const Route = createFileRoute("/sku-sync/$token")({
  component: PublicSkuSync,
  head: () => ({ meta: [{ title: "Waypoint SKU Sync — JLS Yachts" }] }),
});

function PublicSkuSync() {
  const { token } = Route.useParams();
  const [state, setState] = useState<"checking" | "valid" | "invalid">("checking");

  // Validate the link before showing the form.
  useEffect(() => {
    void (async () => {
      try {
        const r = await fetch(`/api/lightspeed/sync?token=${encodeURIComponent(token)}`);
        const j = await r.json();
        setState(r.ok && j.ok ? "valid" : "invalid");
      } catch {
        setState("invalid");
      }
    })();
  }, [token]);

  return (
    <div className="dark flex min-h-screen items-start justify-center bg-background px-4 py-10">
      <div className="w-full max-w-2xl space-y-6">
        <header className="space-y-1 text-center">
          <p className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-primary">JLS Yachts · Waypoint</p>
          <h1 className="font-display text-2xl font-bold text-foreground">
            {state === "invalid" ? "SKU sync link" : "Lightspeed → QuickBooks SKU Sync"}
          </h1>
        </header>

        {state === "invalid" ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-5 py-6 text-center text-sm text-destructive">
            This link is not valid or has been replaced. Please ask our Port &amp; Agency Team for the current link.
          </div>
        ) : state === "checking" ? (
          <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <>
            <p className="text-center text-sm text-muted-foreground">
              Paste one or more Lightspeed SKUs. Each one is looked up in Lightspeed Retail and added to the
              Waypoint QuickBooks company as an inventory item, or updated if it already exists.
            </p>

            <div className="rounded-xl border border-border bg-card p-5">
              <LightspeedSkuSyncPanel compact linkToken={token} />
            </div>

            <p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground/70">
              <ShieldCheck className="h-3.5 w-3.5" />
              Private link for the Waypoint team — please don't forward it outside the company.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

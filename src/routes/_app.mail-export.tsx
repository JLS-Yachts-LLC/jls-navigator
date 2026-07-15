import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2, Download, Mail } from "lucide-react";
import { toast } from "sonner";

// TEMPORARY one-off (Matt's request): download the external-email-recipients CSV.
// Runs the admin-gated /api/admin/mail-export on the signed-in admin's session.
// Delete this route + /api/admin/mail-export + src/lib/mail-export.server.ts after use.
export const Route = createFileRoute("/_app/mail-export")({
  component: MailExportPage,
  head: () => ({ meta: [{ title: "Email recipient export — Polaris" }] }),
});

function MailExportPage() {
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<string | null>(null);

  async function run() {
    setBusy(true); setInfo(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("Not signed in");
      const res = await fetch("/api/admin/mail-export", { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(`Export failed (${res.status}): ${t.slice(0, 200)}`);
      }
      const count = res.headers.get("X-Recipient-Count");
      const mailboxes = res.headers.get("X-Mailboxes-Scanned");
      const capped = res.headers.get("X-Capped") === "true";
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "external-recipients-90d.csv"; a.click();
      URL.revokeObjectURL(url);
      setInfo(`Downloaded ${count} external recipients from ${mailboxes} mailboxes${capped ? " (capped — tell me and I'll run it unbounded)" : ""}.`);
      toast.success("CSV downloaded");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
      setInfo(e?.message ?? "Failed");
    } finally { setBusy(false); }
  }

  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <Mail className="h-6 w-6 text-primary" />
        </div>
        <h1 className="font-display text-lg font-semibold">External email recipients</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Everyone outside JLS Yachts / New Horizon IT emailed in the last 90 days, deduped
          (Display Name + Email). Click to generate and download the CSV.
        </p>
        <Button onClick={run} disabled={busy} className="mt-5 gap-2">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          {busy ? "Generating… (up to a minute)" : "Download CSV"}
        </Button>
        {info && <p className="mt-3 text-xs text-muted-foreground">{info}</p>}
      </div>
    </div>
  );
}

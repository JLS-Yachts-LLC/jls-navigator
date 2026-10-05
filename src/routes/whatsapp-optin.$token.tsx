/**
 * Public WhatsApp opt-in — /whatsapp-optin/$token
 *
 * The page a client opens from the invitation email. No login: the token is the
 * authorisation and reaches one contact only. Outside the /_app shell so nothing
 * behind the login is exposed. What they agree to is recorded word for word
 * (optinStatement) with the wording version, time, IP and browser.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, CheckCircle2, MessageCircle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { optinStatement, toE164 } from "@/lib/whatsapp/shared";

export const Route = createFileRoute("/whatsapp-optin/$token")({
  component: WhatsAppOptin,
  head: () => ({ meta: [{ title: "WhatsApp preferences — JLS Yachts" }, { name: "robots", content: "noindex" }] }),
});

interface Invite {
  name: string | null;
  vessel: string | null;
  phone: string | null;
  categories: { updates: string; marketing: string };
  stop_text: string;
  dial_codes: string[];
}

function WhatsAppOptin() {
  const { token } = Route.useParams();
  const [inv, setInv] = useState<Invite | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [phone, setPhone] = useState("");
  const [updates, setUpdates] = useState(true);
  const [marketing, setMarketing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<"accept" | "decline" | null>(null);

  useEffect(() => {
    void fetch(`/api/whatsapp/optin?token=${encodeURIComponent(token)}`)
      .then(async (r) => {
        const b = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(b?.error ?? "This link isn't valid.");
        setInv(b);
        setPhone(b.phone ?? "");
      })
      .catch((e) => setError(e.message));
  }, [token]);

  async function answer(decision: "accept" | "decline") {
    setSaving(true);
    setError(null);
    try {
      const r = await fetch("/api/whatsapp/optin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, decision, phone, updates, marketing }),
      });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(b?.error ?? "Sorry, that didn't save. Please try again.");
      setDone(decision);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sorry, that didn't save.");
    } finally {
      setSaving(false);
    }
  }

  const e164 = inv ? toE164(phone, inv.dial_codes) : null;

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10 text-slate-900">
      <div className="mx-auto max-w-lg rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200 sm:p-8">
        <div className="mb-5 flex items-center gap-2">
          <MessageCircle className="h-6 w-6 text-emerald-600" />
          <span className="text-sm font-semibold tracking-wide text-slate-500">JLS YACHTS · WHATSAPP</span>
        </div>

        {done === "accept" ? (
          <div className="space-y-3 text-center">
            <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
            <h1 className="text-xl font-semibold">Thank you — you're opted in</h1>
            <p className="text-sm text-slate-600">We'll message you on WhatsApp at {e164}. {inv?.stop_text}</p>
          </div>
        ) : done === "decline" ? (
          <div className="space-y-3 text-center">
            <XCircle className="mx-auto h-12 w-12 text-slate-400" />
            <h1 className="text-xl font-semibold">No problem</h1>
            <p className="text-sm text-slate-600">We won't message you on WhatsApp. We'll keep in touch by email as usual.</p>
          </div>
        ) : !inv ? (
          error ? <p className="text-center text-sm text-slate-600">{error}</p>
            : <Loader2 className="mx-auto h-6 w-6 animate-spin text-slate-400" />
        ) : (
          <div className="space-y-5">
            <div>
              <h1 className="text-xl font-semibold">{inv.name ? `Hello ${inv.name}` : "Hello"}</h1>
              <p className="mt-1 text-sm text-slate-600">
                JLS Yachts would like to keep you updated on WhatsApp{inv.vessel ? ` about ${inv.vessel}` : ""}.
                We'll only message you if you agree below.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Your WhatsApp number</label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+971 50 123 4567" inputMode="tel" />
              <p className="text-xs text-slate-500">
                {phone && !e164 ? "Include the country code, e.g. +44 or +971." : "Please check this is the number you use for WhatsApp."}
              </p>
            </div>

            <div className="space-y-3">
              <p className="text-sm font-medium">What would you like to receive?</p>
              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 p-3">
                <Checkbox checked={updates} onCheckedChange={(v) => setUpdates(!!v)} className="mt-0.5" />
                <span className="text-sm">{inv.categories.updates}</span>
              </label>
              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 p-3">
                <Checkbox checked={marketing} onCheckedChange={(v) => setMarketing(!!v)} className="mt-0.5" />
                <span className="text-sm">{inv.categories.marketing}</span>
              </label>
            </div>

            {e164 && (updates || marketing) && (
              <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">{optinStatement({ phone: e164, updates, marketing })}</p>
            )}
            <p className="text-xs text-slate-500">{inv.stop_text}</p>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700" disabled={saving || !e164 || (!updates && !marketing)}
                onClick={() => void answer("accept")}>
                {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}Yes, message me on WhatsApp
              </Button>
              <Button variant="outline" className="flex-1" disabled={saving} onClick={() => void answer("decline")}>
                No thanks
              </Button>
            </div>
          </div>
        )}
      </div>
      <p className="mt-4 text-center text-xs text-slate-400">JLS Yachts · <a className="underline" href="/legal/privacy">Privacy</a></p>
    </div>
  );
}

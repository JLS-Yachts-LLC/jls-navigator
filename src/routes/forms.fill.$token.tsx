/**
 * Public form fill — /forms/fill/$token
 *
 * The page an incoming yacht opens from the link we send: no Polaris login, no
 * account, just the form. Deliberately outside the /_app shell (same pattern as
 * e-Sign's public /sign/$token) so nothing behind the login is exposed.
 *
 * The token IS the authorisation, so it only ever reaches one submission row, and
 * the yacht can see and edit nothing else.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, Save, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { FormRenderer, type FormData } from "@/components/forms/FormRenderer";
import type { FormSection } from "@/lib/forms/pre-arrival-definition";

export const Route = createFileRoute("/forms/fill/$token")({
  component: PublicFormFill,
  head: () => ({ meta: [{ title: "Complete your form — JLS Yachts" }] }),
});

function PublicFormFill() {
  const { token } = Route.useParams();
  const [state, setState] = useState<{
    loading: boolean; error?: string;
    title?: string; description?: string; sections?: FormSection[];
    vessel?: string | null; submitted?: boolean; id?: string;
  }>({ loading: true });
  const [data, setData] = useState<FormData>({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    // Goes through the token-scoped endpoint, not the browser Supabase client:
    // form_submissions stays closed to anon so a link can only ever reach its own row.
    const res = await fetch(`/api/forms/public?token=${encodeURIComponent(token)}`);
    const body = res.ok ? await res.json() : null;
    if (!body?.ok) {
      setState({ loading: false, error: "This link is not valid. Please ask JLS Yachts for a new one." });
      return;
    }
    setData(body.data ?? {});
    setState({
      loading: false,
      title: body.title,
      description: body.description ?? undefined,
      sections: (body.sections ?? []) as FormSection[],
      vessel: body.vessel,
      submitted: !!body.submitted,
    });
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  async function save(final: boolean) {
    setSaving(true);
    try {
      const res = await fetch("/api/forms/public", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, data, submit: final }),
      });
      const body = await res.json();
      if (!body?.ok) throw new Error(body?.error ?? "Could not save");
      if (final) { setState((s) => ({ ...s, submitted: true })); toast.success("Thank you — your form has been sent to JLS Yachts"); }
      else toast.success("Progress saved — you can come back to this link later");
    } catch (e: any) {
      toast.error(e?.message ?? "Could not save. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  if (state.loading) {
    return <Centre><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></Centre>;
  }
  if (state.error) {
    return <Centre><p className="max-w-sm text-center text-sm text-muted-foreground">{state.error}</p></Centre>;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3 px-6 py-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-primary">JLS Yachts</div>
            <h1 className="mt-0.5 font-display text-lg font-semibold">{state.title}</h1>
            {state.vessel && <p className="text-[12.5px] text-muted-foreground">{state.vessel}</p>}
          </div>
          {!state.submitted && (
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => void save(false)} disabled={saving}>
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save for later
              </Button>
              <Button size="sm" className="gap-1.5" onClick={() => void save(true)} disabled={saving}>
                <CheckCircle2 className="h-3.5 w-3.5" /> Submit
              </Button>
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-6">
        {state.submitted ? (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-8 text-center">
            <CheckCircle2 className="mx-auto h-9 w-9 text-emerald-400" />
            <p className="mt-3 font-display text-base font-semibold">Thank you — we have your details</p>
            <p className="mt-1 text-sm text-muted-foreground">
              JLS Yachts Port Operations will be in touch. You can close this page.
            </p>
          </div>
        ) : (
          <>
            {state.description && (
              <p className="mb-5 text-[13px] leading-relaxed text-muted-foreground">{state.description}</p>
            )}
            <p className="mb-5 flex items-center gap-2 rounded-lg border border-border/60 bg-muted/20 px-4 py-2.5 text-[12px] text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-primary" />
              Your answers are saved only against this form. Use “Save for later” and return to this link any time.
            </p>
            <FormRenderer sections={state.sections ?? []} data={data} onChange={setData} />
            <div className="mt-6 flex justify-end gap-2 pb-10">
              <Button variant="outline" className="gap-1.5" onClick={() => void save(false)} disabled={saving}>
                <Save className="h-4 w-4" /> Save for later
              </Button>
              <Button className="gap-1.5" onClick={() => void save(true)} disabled={saving}>
                <CheckCircle2 className="h-4 w-4" /> Submit to JLS Yachts
              </Button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function Centre({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-screen items-center justify-center bg-background px-6">{children}</div>;
}

import { useState, useEffect } from "react";
import { Route } from "@/routes/d.$token";
import { Button } from "@/components/ui/button";
import { Loader2, ShieldCheck, Download, XCircle, Clock } from "lucide-react";

type ShareState = "ok" | "expired" | "revoked" | "not_found";

type Meta = {
  state: ShareState;
  title?: string;
  reference?: string | null;
  purpose?: string | null;
  vesselName?: string | null;
  filename?: string | null;
  expiresAt?: string;
};

const fmtDate = (iso?: string) =>
  iso
    ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
    : "—";

/**
 * What a client sees when they follow a secure document link. The point of the
 * page is that the document is identified — title, reference, vessel, why they
 * have it and when the link stops working — before anything is downloaded.
 */
export function SecureDocumentPage() {
  const { token } = Route.useParams();
  const [meta, setMeta] = useState<Meta | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const res = await fetch(`/api/documents/meta?token=${encodeURIComponent(token)}`);
        const body = (await res.json()) as Meta;
        if (alive) setMeta(body);
      } catch {
        if (alive) setMeta({ state: "not_found" });
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [token]);

  const unavailable = meta && meta.state !== "ok";

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="border-b border-slate-200 bg-[#07435e] px-6 py-4 text-white">
        <div className="mx-auto flex max-w-2xl items-center gap-2">
          <ShieldCheck className="h-5 w-5" />
          <span className="font-semibold">JLS Yachts</span>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-10">
        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          </div>
        ) : unavailable ? (
          <div className="mx-auto max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
            {meta!.state === "expired" ? (
              <Clock className="mx-auto mb-3 h-8 w-8 text-amber-500" />
            ) : (
              <XCircle className="mx-auto mb-3 h-8 w-8 text-slate-400" />
            )}
            <h1 className="text-lg font-semibold">
              {meta!.state === "expired" ? "This link has expired" : "Link unavailable"}
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              {meta!.state === "expired"
                ? "Secure document links expire for your protection."
                : "This link is no longer valid."}{" "}
              Please reply to the email you received and we will send you a new one.
            </p>
          </div>
        ) : meta ? (
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Secure document
            </div>
            <h1 className="mt-1 text-2xl font-bold">{meta.title}</h1>

            <dl className="mt-5 divide-y divide-slate-100 border-y border-slate-100 text-sm">
              {meta.reference && (
                <div className="flex gap-4 py-2.5">
                  <dt className="w-32 shrink-0 font-medium text-slate-500">Reference</dt>
                  <dd className="font-mono">{meta.reference}</dd>
                </div>
              )}
              {meta.vesselName && (
                <div className="flex gap-4 py-2.5">
                  <dt className="w-32 shrink-0 font-medium text-slate-500">Vessel</dt>
                  <dd>{meta.vesselName}</dd>
                </div>
              )}
              <div className="flex gap-4 py-2.5">
                <dt className="w-32 shrink-0 font-medium text-slate-500">Link expires</dt>
                <dd>{fmtDate(meta.expiresAt)}</dd>
              </div>
            </dl>

            {meta.purpose && (
              <p className="mt-5 border-l-2 border-[#07435e] pl-3 text-sm leading-relaxed text-slate-600">
                {meta.purpose}
              </p>
            )}

            <Button asChild size="lg" className="mt-6 w-full gap-2 bg-[#07435e] hover:bg-[#0a5679] sm:w-auto">
              {/* A normal navigation, not fetch: the endpoint redirects to a
                  short-lived signed URL and the browser handles the download. */}
              <a href={`/api/documents/open?token=${encodeURIComponent(token)}`} rel="noreferrer">
                <Download className="h-4 w-4" /> View or Download Document Securely
              </a>
            </Button>

            <p className="mt-4 text-xs leading-relaxed text-slate-500">
              This link was issued for you alone and access to it is recorded. Please do not
              forward it — if a colleague needs the document, contact us and we will send
              them their own link.
            </p>
          </div>
        ) : null}
      </main>

      <footer className="pb-10 text-center text-xs text-slate-400">
        JLS Yachts LLC · Port &amp; Operations
      </footer>
    </div>
  );
}

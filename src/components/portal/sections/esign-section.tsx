/**
 * Documents to sign — what JLS has sent the signed-in person for e-signature,
 * at the top of Documents, and the signed copies. "Review & sign" opens the
 * same secure signing page the email links to. Reads /api/portal/esign.
 */
import { useEffect, useState } from "react";
import { portalFetch } from "@/lib/portal/portal-fetch";
import { Download, FileSignature, Loader2 } from "lucide-react";
import { SectionCard, fmtDate } from "./section-ui";

type ToSign = { id: string; reference: string | null; title: string; description: string | null; message: string | null; sentAt: string | null; expiresAt: string | null; signUrl: string | null };
type Signed = { id: string; reference: string | null; title: string; signedAt: string | null };

export function EsignPanel() {
  const [toSign, setToSign] = useState<ToSign[] | null>(null);
  const [signed, setSigned] = useState<Signed[]>([]);
  const [opening, setOpening] = useState<string | null>(null);

  useEffect(() => {
    void portalFetch("/api/portal/esign").then((r) => r.json()).then((j) => {
      setToSign(j.toSign ?? []); setSigned(j.signed ?? []);
    }).catch(() => setToSign([]));
  }, []);

  const openSigned = async (id: string) => {
    setOpening(id);
    try {
      const res = await portalFetch(`/api/portal/esign?signed=${id}`, { redirect: "follow" });
      if (!res.ok) throw new Error("That document could not be opened.");
      window.open(res.url, "_blank", "noreferrer");
    } catch (e) { alert(e instanceof Error ? e.message : "That document could not be opened."); }
    finally { setOpening(null); }
  };

  if (toSign === null || (toSign.length === 0 && signed.length === 0)) return null;

  return (
    <section className="space-y-2">
      {toSign.length > 0 && (
        <>
          <h1 className="text-lg font-bold">To sign</h1>
          {toSign.map((d) => (
            <SectionCard key={d.id} className="flex flex-wrap items-center gap-3 border-primary/40 p-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 text-primary"><FileSignature className="h-5 w-5" /></div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{d.title}</div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">
                  {[d.reference, d.sentAt ? `sent ${fmtDate(d.sentAt)}` : null, d.expiresAt ? `link valid to ${fmtDate(d.expiresAt)}` : null].filter(Boolean).join(" · ")}
                </div>
                {d.message && <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">{d.message}</div>}
              </div>
              {d.signUrl ? (
                <a href={d.signUrl} target="_blank" rel="noreferrer"
                   className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:brightness-110">
                  <FileSignature className="h-4 w-4" /> Review &amp; sign
                </a>
              ) : (
                <span className="text-xs text-muted-foreground">Awaiting the client's signature</span>
              )}
            </SectionCard>
          ))}
        </>
      )}
      {signed.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer list-none text-sm font-semibold text-muted-foreground hover:text-foreground">
            Signed documents ({signed.length})
          </summary>
          <div className="mt-2 space-y-1.5">
            {signed.map((d) => (
              <SectionCard key={d.id} className="flex items-center gap-3 p-3 pl-4">
                <FileSignature className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{d.title}</div>
                  <div className="text-[11px] text-muted-foreground">{d.reference ? `${d.reference} · ` : ""}signed {fmtDate(d.signedAt)}</div>
                </div>
                <button type="button" onClick={() => void openSigned(d.id)} disabled={opening === d.id}
                        className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-border px-3 text-xs font-medium transition hover:border-primary/50 disabled:opacity-50">
                  {opening === d.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />} Signed copy
                </button>
              </SectionCard>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}

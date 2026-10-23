import { useState, useEffect } from "react";
import { Route } from "@/routes/sign.$token";
import { getSigningDocument, doSubmitSignature, doDeclineSignature, doUploadSignedCopy, previewSigningPack } from "@/lib/esign.server";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { SignaturePad, VesselStampPicker } from "./signature-pad";
import { PackForms, missingPackFields, type PackForm, type PackValues } from "./pack-forms";
import { JLS_COMPANY, JLS_CONTACT_LINE } from "@/lib/brand/jls-company";
import { Loader2, FileSignature, CheckCircle2, XCircle, ShieldCheck, Download, Upload, Printer, Eye } from "lucide-react";
import { toast } from "sonner";

type Loaded = {
  title: string; description: string | null; reference: string | null;
  signerName: string; message: string | null; status: string;
  allowEsign?: boolean; signedMethod?: string | null; isQuotation?: boolean;
  fileUrl: string; signedFileUrl: string | null;
  forms?: PackForm[]; documents?: string[];
};

const UPLOAD_TYPES = ["application/pdf", "image/png", "image/jpeg"];

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

export function PublicSignPage() {
  const { token } = Route.useParams();
  const [doc, setDoc] = useState<Loaded | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sig, setSig] = useState<string | null>(null);
  const [stamp, setStamp] = useState<string | null>(null);
  const [formValues, setFormValues] = useState<PackValues>({});
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<null | "signed" | "declined">(null);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [declineOpen, setDeclineOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [upload, setUpload] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploaded, setUploaded] = useState(false);

  useEffect(() => { void load(); }, [token]);

  async function load() {
    setLoading(true); setError(null);
    try {
      const d = await getSigningDocument({ data: { token } } as any) as Loaded;
      setDoc(d);
      setFormValues(Object.fromEntries((d.forms ?? []).map((f) => [f.index, { ...f.values }])));
      if (d.status === "signed") { setDone("signed"); setSignedUrl(d.signedFileUrl); setUploaded(d.signedMethod === "upload" || d.signedMethod === "staff_upload"); }
      if (d.status === "declined") setDone("declined");
    } catch (e: any) { setError(e?.message ?? "This signing link is invalid."); }
    finally { setLoading(false); }
  }

  // Show the documents with the vessel's answers before they sign.
  async function preview() {
    setPreviewing(true);
    try {
      const res = await previewSigningPack({ data: { token, formValues } } as any) as { pdfBase64: string };
      const bin = atob(res.pdfBase64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(URL.createObjectURL(new Blob([bytes], { type: "application/pdf" })));
      document.getElementById("sign-doc")?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (e: any) { toast.error(e?.message ?? "Could not build the preview"); }
    finally { setPreviewing(false); }
  }

  async function submit() {
    const missing = missingPackFields(doc?.forms ?? [], formValues);
    if (missing.length) { toast.error("Please complete the remaining details", { description: missing.slice(0, 4).join(" · ") + (missing.length > 4 ? " …" : "") }); return; }
    if (!sig) { toast.error("Please add your signature"); return; }
    if (!agreed) { toast.error("Please confirm you agree to sign electronically"); return; }
    setSubmitting(true);
    try {
      const res = await doSubmitSignature({ data: { token, signatureDataUrl: sig, stampDataUrl: stamp ?? undefined, typedName: doc?.signerName, formValues } } as any) as { signedFileUrl: string };
      setSignedUrl(res.signedFileUrl); setDone("signed");
    } catch (e: any) { toast.error(e?.message ?? "Could not submit signature"); }
    finally { setSubmitting(false); }
  }

  async function submitUpload() {
    if (!upload) return;
    if (!UPLOAD_TYPES.includes(upload.type)) { toast.error("Please upload a PDF, or a photo/scan as PNG or JPEG"); return; }
    if (upload.size > 8 * 1024 * 1024) { toast.error("That file is too large (8 MB maximum)"); return; }
    setUploading(true);
    try {
      const fileBase64 = await fileToBase64(upload);
      const res = await doUploadSignedCopy({ data: { token, fileBase64, fileName: upload.name, contentType: upload.type } } as any) as { signedFileUrl: string };
      setSignedUrl(res.signedFileUrl); setUploaded(true); setDone("signed");
    } catch (e: any) { toast.error(e?.message ?? "Could not upload the signed copy"); }
    finally { setUploading(false); }
  }

  async function decline() {
    setSubmitting(true);
    try { await doDeclineSignature({ data: { token, reason: reason.trim() || undefined } } as any); setDone("declined"); }
    catch (e: any) { toast.error(e?.message ?? "Could not decline"); }
    finally { setSubmitting(false); setDeclineOpen(false); }
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="border-b-[3px] border-[#0070C0] bg-white px-6 py-3">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3">
          <img src="/email/jlsyachts-logo.png" alt="jlsyachts — A Family of Excellence" className="h-10 w-auto" />
          <span className="flex items-center gap-1.5 text-xs font-medium text-slate-500"><FileSignature className="h-4 w-4" /> Secure document signing</span>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8">
        {loading ? (
          <div className="flex h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
        ) : error ? (
          <div className="mx-auto max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
            <XCircle className="mx-auto mb-3 h-8 w-8 text-red-500" />
            <h1 className="font-semibold text-lg">Link unavailable</h1>
            <p className="mt-1 text-sm text-slate-500">{error}</p>
          </div>
        ) : done === "signed" ? (
          <div className="mx-auto max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
            <CheckCircle2 className="mx-auto mb-3 h-9 w-9 text-emerald-500" />
            <h1 className="font-semibold text-lg">{uploaded ? "Thank you — signed copy received!" : doc?.isQuotation ? "Thank you — quotation accepted!" : "Thank you — signed!"}</h1>
            <p className="mt-1 text-sm text-slate-500">{uploaded ? "We've received your signed copy" : "Your signature has been recorded"}{doc?.reference ? ` for ${doc.reference}` : ""}. A copy has been emailed to you.</p>
            {signedUrl && <Button asChild className="mt-4 gap-1.5"><a href={signedUrl} target="_blank" rel="noreferrer"><Download className="h-4 w-4" /> Download signed copy</a></Button>}
          </div>
        ) : done === "declined" ? (
          <div className="mx-auto max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
            <XCircle className="mx-auto mb-3 h-8 w-8 text-slate-400" />
            <h1 className="font-semibold text-lg">Signing declined</h1>
            <p className="mt-1 text-sm text-slate-500">You've declined to sign this document. You can close this window.</p>
          </div>
        ) : doc ? (
          <div className="space-y-5">
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="text-xs uppercase tracking-wide text-slate-400">{doc.reference ?? (doc.isQuotation ? "Quotation" : "Document")}</div>
              <h1 className="mt-0.5 text-xl font-bold">{doc.title}</h1>
              <p className="mt-1 text-sm text-slate-500">Hello {doc.signerName}, please review the {doc.isQuotation ? "quotation" : "document"} below and {doc.allowEsign === false ? "return a signed copy" : doc.isQuotation ? "sign to accept it" : "sign"}.</p>
              {doc.message && <p className="mt-3 whitespace-pre-line border-l-2 border-blue-600 pl-3 text-sm text-slate-600">{doc.message.replace(/\*\*/g, "")}</p>}
            </div>

            {(doc.documents?.length ?? 0) > 1 && (
              <div className="rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm text-slate-600 shadow-sm">
                <span className="font-medium text-slate-800">{doc.documents!.length} documents, one signature:</span> {doc.documents!.join(" · ")}
              </div>
            )}

            <div id="sign-doc" className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              {previewUrl && <div className="border-b border-slate-200 bg-emerald-50 px-4 py-2 text-xs text-emerald-800">Showing a preview with your answers. Change anything below and preview again.</div>}
              <iframe title="Document to sign" src={previewUrl ?? doc.fileUrl} className="h-[65vh] w-full border-0" />
            </div>

            {doc.allowEsign !== false && (doc.forms?.length ?? 0) > 0 && (
              <>
                <PackForms forms={doc.forms!} values={formValues} onChange={setFormValues} />
                <div className="flex justify-end">
                  <Button variant="outline" onClick={preview} disabled={previewing} className="gap-1.5 border-slate-300 bg-white text-slate-700 hover:bg-slate-50">
                    {previewing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />} Preview with my answers
                  </Button>
                </div>
              </>
            )}

            {doc.allowEsign !== false && (
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="mb-3 font-semibold">Your signature</h2>
              <SignaturePad onChange={setSig} />
              <div className="mt-4"><VesselStampPicker onChange={setStamp} /></div>
              <label className="mt-4 flex items-start gap-2 text-sm text-slate-600">
                <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} className="mt-0.5" />
                <span>{doc.isQuotation ? "I accept this quotation and agree to sign it electronically," : "I agree to sign this document electronically,"} and I consent to my signature, any vessel stamp I added, my name, IP address and timestamp being recorded as evidence of signing.</span>
              </label>
              <div className="mt-4 flex items-center justify-between gap-3">
                <Button variant="ghost" className="text-slate-500 hover:text-red-600" onClick={() => setDeclineOpen(true)} disabled={submitting}>Decline</Button>
                <Button onClick={submit} disabled={submitting || !sig || !agreed} className="gap-1.5">
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} {doc.isQuotation ? "Accept & sign quotation" : "Sign document"}
                </Button>
              </div>
            </div>
            )}

            {/* Paper route — for anyone who'd rather print, sign (and stamp) it. */}
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="flex items-center gap-2 font-semibold"><Printer className="h-4 w-4 text-slate-500" /> {doc.allowEsign === false ? "Sign on paper" : "Prefer to sign on paper?"}</h2>
              <ol className="mt-2 list-decimal space-y-0.5 pl-5 text-sm text-slate-600">
                <li><a href={doc.fileUrl} target="_blank" rel="noreferrer" className="font-medium text-blue-700 underline">Download the PDF</a> and print it.</li>
                <li>Sign it (and stamp it, if your vessel uses a stamp).</li>
                <li>Upload a scan or a clear photo of the signed pages below.</li>
              </ol>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <input type="file" accept="application/pdf,image/png,image/jpeg" onChange={(e) => setUpload(e.target.files?.[0] ?? null)}
                  className="block w-full max-w-sm text-sm file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-medium" />
                <Button onClick={submitUpload} disabled={!upload || uploading} variant={doc.allowEsign === false ? "default" : "outline"} className="gap-1.5">
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Upload signed copy
                </Button>
              </div>
              <p className="mt-2 text-xs text-slate-400">PDF, PNG or JPEG, up to 8 MB. You can also reply to our email with the signed copy attached.</p>
              {doc.allowEsign === false && (
                <div className="mt-3 border-t border-slate-100 pt-3">
                  <Button variant="ghost" className="text-slate-500 hover:text-red-600" onClick={() => setDeclineOpen(true)} disabled={submitting}>Decline</Button>
                </div>
              )}
            </div>

            {declineOpen && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setDeclineOpen(false)}>
                <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-5 shadow-xl" onClick={e => e.stopPropagation()}>
                  <h3 className="font-semibold">Decline to sign?</h3>
                  <p className="mt-1 text-sm text-slate-500">Optionally tell us why.</p>
                  <Textarea rows={3} value={reason} onChange={e => setReason(e.target.value)} className="mt-3 resize-none" placeholder="Reason (optional)" />
                  <div className="mt-4 flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setDeclineOpen(false)} disabled={submitting}>Cancel</Button>
                    <Button onClick={decline} disabled={submitting} className="bg-red-600 hover:bg-red-700 gap-1.5">{submitting && <Loader2 className="h-4 w-4 animate-spin" />} Decline</Button>
                  </div>
                </div>
              </div>
            )}

            <p className="text-center text-xs text-slate-400">This link is personal to you — please don't share it.</p>
          </div>
        ) : null}
      </main>

      <footer className="border-t border-slate-200 bg-white px-6 py-4 text-[11px] leading-relaxed text-slate-500">
        <div className="mx-auto max-w-4xl">
          <strong className="text-slate-700">{JLS_COMPANY.legalName}</strong><br />
          {JLS_COMPANY.address}<br />
          {JLS_CONTACT_LINE}
        </div>
      </footer>
    </div>
  );
}

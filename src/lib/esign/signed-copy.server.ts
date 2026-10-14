/**
 * Turn a paper-signed copy (PDF, or a photo/scan as PNG/JPEG) into the stored
 * signed PDF, with a certificate page recording who uploaded it and when.
 * Used by the public signing page (signer uploads) and Signature Campaigns
 * (staff attach a copy the client returned by email).
 */
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export async function buildUploadedSignedPdf(
  bytes: Uint8Array, contentType: string,
  cert: { title: string; reference?: string | null; signerName: string; signerEmail: string; by: string; ip?: string | null; at: Date },
): Promise<Uint8Array> {
  let pdf: PDFDocument;
  if (/pdf/i.test(contentType)) {
    pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
  } else {
    pdf = await PDFDocument.create();
    const img = /png/i.test(contentType) ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
    // Fit the photo/scan onto an A4 page, keeping its proportions.
    const W = 595, H = 842, m = 24;
    const scale = Math.min((W - m * 2) / img.width, (H - m * 2) / img.height);
    const w = img.width * scale, h = img.height * scale;
    pdf.addPage([W, H]).drawImage(img, { x: (W - w) / 2, y: (H - h) / 2, width: w, height: h });
  }
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const page = pdf.addPage([595, 842]);
  let y = 770;
  const line = (t: string, f = font, size = 11) => { page.drawText(t, { x: 56, y, size, font: f, color: rgb(0.1, 0.12, 0.16) }); y -= size + 8; };
  line("Signed Copy Certificate", bold, 20); y -= 6;
  line("Document", bold); line(`${cert.title}${cert.reference ? `  (${cert.reference})` : ""}`); y -= 6;
  line("Signer", bold); line(`${cert.signerName}  <${cert.signerEmail}>`); y -= 6;
  line("Method", bold); line("Signed on paper — signed copy uploaded"); line(`Uploaded by: ${cert.by}`, font, 10); y -= 6;
  line("Received at (UTC)", bold); line(cert.at.toISOString());
  if (cert.ip) { line("Uploader IP", bold); line(cert.ip); }
  page.drawText("Received by JLS Yachts LLC secure e-signature (Polaris).", { x: 56, y: 48, size: 9, font, color: rgb(0.5, 0.55, 0.6) });
  return pdf.save();
}

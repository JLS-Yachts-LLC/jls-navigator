/**
 * Work out a file's real type from its first bytes.
 *
 * SharePoint holds files whose names say nothing useful — email attachments saved
 * as "…[1]_[3].octet-stream", scans with no extension — so the name can't be
 * trusted to pick a content type. The bytes can. Covers the types the
 * permit-documents bucket accepts that have a reliable signature; anything else
 * returns null and the caller decides.
 */
export type Sniffed = { ext: string; type: string };

const startsWith = (b: Uint8Array, sig: number[], at = 0) => sig.every((v, i) => b[at + i] === v);
const ascii = (b: Uint8Array, from: number, len: number) => String.fromCharCode(...b.subarray(from, from + len));

export function sniffFileType(b: Uint8Array): Sniffed | null {
  if (b.length < 4) return null;
  if (ascii(b, 0, 4) === "%PDF") return { ext: "pdf", type: "application/pdf" };
  if (startsWith(b, [0x89, 0x50, 0x4e, 0x47])) return { ext: "png", type: "image/png" };
  if (startsWith(b, [0xff, 0xd8, 0xff])) return { ext: "jpg", type: "image/jpeg" };
  if (ascii(b, 0, 4) === "GIF8") return { ext: "gif", type: "image/gif" };
  if (ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 4) === "WEBP") return { ext: "webp", type: "image/webp" };
  if (startsWith(b, [0x49, 0x49, 0x2a, 0x00]) || startsWith(b, [0x4d, 0x4d, 0x00, 0x2a])) return { ext: "tif", type: "image/tiff" };
  if (ascii(b, 0, 2) === "BM") return { ext: "bmp", type: "image/bmp" };
  if (ascii(b, 4, 4) === "ftyp") {
    const brand = ascii(b, 8, 4);
    if (/^hei|^hev|^mif1|^msf1/.test(brand)) return { ext: "heic", type: "image/heic" };
    if (brand === "avif") return { ext: "avif", type: "image/avif" };
    if (brand === "qt  ") return { ext: "mov", type: "video/quicktime" };
    return { ext: "mp4", type: "video/mp4" };
  }
  // Office documents are zip files — the part names inside say which kind.
  if (startsWith(b, [0x50, 0x4b, 0x03, 0x04])) {
    const head = ascii(b, 0, Math.min(b.length, 64 * 1024));
    if (head.includes("word/")) return { ext: "docx", type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" };
    if (head.includes("xl/")) return { ext: "xlsx", type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" };
    return null;
  }
  if (ascii(b, 0, 5) === "{\\rtf") return { ext: "rtf", type: "application/rtf" };
  return null;
}

/** "scan.octet-stream" + pdf → "scan.pdf"; keeps the name when it already ends right. */
export function withExtension(name: string, ext: string): string {
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  return name.toLowerCase().endsWith(`.${ext}`) ? name : `${base}.${ext}`;
}

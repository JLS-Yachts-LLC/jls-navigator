/**
 * One place that decides whether a file may be uploaded, and says why not.
 *
 * The `permit-documents` bucket enforces a 25 MiB cap and a type allow-list
 * (migration 20260916140000). Without a check up front the user picks a file,
 * waits through the upload, and then gets whatever Supabase says — "The object
 * exceeded the maximum allowed size", or a mime-type error naming a type they
 * never chose. This refuses the file before the upload starts and names the
 * actual problem.
 *
 * Keep ALLOWED_UPLOAD_MIME in step with the bucket. The bucket is the real
 * boundary; this is the courtesy that stops people hitting it blind.
 *
 * Also resolves a content type. A browser reports an empty `File.type` for some
 * formats (.msg and .eml routinely, .heic on older Safari). supabase-js then
 * falls back to `text/plain;charset=UTF-8`, so the file is stored mislabelled or
 * refused outright — neither obvious from the UI. `uploadContentType()` falls
 * back to the extension, so the upload carries the right type.
 */
import { toast } from "sonner";

/** Matches storage.buckets.file_size_limit for permit-documents. */
export const MAX_UPLOAD_MB = 25;
export const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;

/** Matches storage.buckets.allowed_mime_types for permit-documents. */
export const ALLOWED_UPLOAD_MIME: readonly string[] = [
  "image/jpeg", "image/png", "image/webp", "image/gif", "image/bmp",
  "image/tiff", "image/heic", "image/heif", "image/avif", "image/svg+xml",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.oasis.opendocument.text",
  "application/rtf", "text/rtf",
  "text/plain", "text/csv", "text/tab-separated-values",
  "application/vnd.ms-outlook", "message/rfc822",
  "video/webm", "video/mp4", "video/quicktime",
];
const ALLOWED = new Set(ALLOWED_UPLOAD_MIME);

/** Extension → content type, for the files a browser reports no type for. */
const EXT_MIME: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp",
  gif: "image/gif", bmp: "image/bmp", tif: "image/tiff", tiff: "image/tiff",
  heic: "image/heic", heif: "image/heif", avif: "image/avif", svg: "image/svg+xml",
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  odt: "application/vnd.oasis.opendocument.text",
  rtf: "application/rtf",
  txt: "text/plain", csv: "text/csv", tsv: "text/tab-separated-values",
  msg: "application/vnd.ms-outlook", eml: "message/rfc822",
  webm: "video/webm", mp4: "video/mp4", mov: "video/quicktime",
};

/** A type's base form, ignoring parameters like "; charset=UTF-8". */
function baseType(t: string): string {
  return (t ?? "").split(";")[0].trim().toLowerCase();
}

function extensionOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i === -1 ? "" : name.slice(i + 1).toLowerCase();
}

/**
 * The content type to upload this file as: what the browser reported, or the
 * extension's type when it reported nothing useful. Pass it as `contentType` in
 * the upload options so the stored object is labelled correctly.
 */
export function uploadContentType(file: File): string | undefined {
  const reported = baseType(file.type);
  if (reported && reported !== "application/octet-stream") return reported;
  return EXT_MIME[extensionOf(file.name)] ?? undefined;
}

function formatMB(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export interface UploadGuardOptions {
  /** A stricter cap than the bucket's, in bytes, when a screen wants one. */
  maxBytes?: number;
  /** What this screen accepts, for the message — e.g. "a PDF or an image". */
  accepts?: string;
}

/**
 * Why this file can't be uploaded, in words a user can act on — or null when
 * it's fine.
 */
export function uploadRejectionReason(file: File, opts: UploadGuardOptions = {}): string | null {
  const maxBytes = opts.maxBytes ?? MAX_UPLOAD_BYTES;

  if (file.size === 0) {
    return `“${file.name}” is empty — check the file and try again.`;
  }
  if (file.size > maxBytes) {
    const limit = maxBytes >= 1024 * 1024 ? `${Math.round(maxBytes / 1024 / 1024)} MB` : formatMB(maxBytes);
    return `“${file.name}” is ${formatMB(file.size)} — the limit is ${limit}. Try a smaller scan, or split it into parts.`;
  }

  const type = uploadContentType(file);
  if (!type) {
    const ext = extensionOf(file.name);
    return ext
      ? `“${file.name}” is a .${ext} file, which can't be uploaded here. ${opts.accepts ?? "Use a PDF, an image, or an Office document."}`
      : `“${file.name}” has no file extension, so its type can't be identified. ${opts.accepts ?? "Use a PDF, an image, or an Office document."}`;
  }
  if (!ALLOWED.has(type)) {
    const ext = extensionOf(file.name);
    return `“${file.name}”${ext ? ` is a .${ext} file, which` : ""} can't be uploaded here. ${opts.accepts ?? "Use a PDF, an image, or an Office document."}`;
  }
  return null;
}

/**
 * Check a file and, when it's no good, tell the user why. Returns true when the
 * upload should go ahead.
 *
 *   if (!guardUploadFile(file)) return;
 */
export function guardUploadFile(file: File, opts: UploadGuardOptions = {}): boolean {
  const reason = uploadRejectionReason(file, opts);
  if (reason) {
    toast.error(reason);
    return false;
  }
  return true;
}

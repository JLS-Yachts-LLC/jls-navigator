/**
 * The one optional file on a feedback report.
 *
 * It lives in `feedback.screenshot_url` as a storage reference
 * ("permit-documents/feedback/<file>") whatever it actually is — a screenshot,
 * a screen recording, or a document someone attached (PDF, Word form, …). These
 * helpers name it by what it is, so the Feedback page, the Service Desk ticket it
 * raised and the emails that go out all call it the same thing.
 */

function extensionOf(stored: string): string {
  return (stored.split("?")[0].split(".").pop() ?? "").toLowerCase();
}

/** Screenshot / Screen recording / PDF / Document / Spreadsheet / Attachment. */
export function attachmentLabel(stored: string): string {
  const ext = extensionOf(stored);
  if (["png", "jpg", "jpeg", "gif", "webp", "bmp", "heic"].includes(ext)) return "Screenshot";
  if (["webm", "mp4", "mov", "mkv"].includes(ext)) return "Screen recording";
  if (ext === "pdf") return "PDF";
  if (["doc", "docx", "odt", "rtf"].includes(ext)) return "Document";
  if (["xls", "xlsx", "csv"].includes(ext)) return "Spreadsheet";
  return "Attachment";
}

/**
 * A readable file name for the email attachment. The stored name is
 * `<user id>-<timestamp>.<ext>`, which tells the person opening it nothing, so it
 * is named after the label and the report's date instead.
 */
export function attachmentFileName(stored: string, createdAt?: string | null): string {
  const ext = extensionOf(stored);
  const date = createdAt ? new Date(createdAt).toISOString().slice(0, 10) : null;
  const base = `Polaris feedback ${attachmentLabel(stored).toLowerCase()}${date ? ` ${date}` : ""}`;
  return ext ? `${base}.${ext}` : base;
}

const CONTENT_TYPES: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp",
  bmp: "image/bmp", heic: "image/heic",
  webm: "video/webm", mp4: "video/mp4", mov: "video/quicktime", mkv: "video/x-matroska",
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  odt: "application/vnd.oasis.opendocument.text", rtf: "application/rtf",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv",
};

/** MIME type from the extension, for when storage did not record one. */
export function attachmentContentType(stored: string): string {
  return CONTENT_TYPES[extensionOf(stored)] ?? "application/octet-stream";
}

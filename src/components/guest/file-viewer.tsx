/**
 * The guest page's built-in file viewer — a file opens over the list instead of
 * in a new browser tab (where a Word file just downloaded, or failed).
 *
 *   PDF                     → the browser's own PDF viewer
 *   Images                  → shown as they are
 *   Word / Excel / PowerPoint → Microsoft's Office viewer (view.officeapps.live.com),
 *                             handed the same short-lived link the download uses
 *   Text / CSV              → shown as plain text
 *   Anything else           → "can't preview" + Download
 *
 * "Open in Word" (Excel, PowerPoint) launches the installed Office app through its
 * ms-word:ofv|u|<url> link — Office opens a read-only copy straight from the link,
 * on Windows, Mac, iOS and Android. Changes made there stay on the guest's device;
 * a Read & write guest puts them back with "Replace with a new version".
 */
import { useEffect, useState } from "react";
import { Download, ExternalLink, File as FileIcon, Loader2, X } from "lucide-react";

export type ViewerFile = { name: string; url: string | null };

const OFFICE_APPS: { exts: string[]; scheme: string; label: string }[] = [
  { exts: ["doc", "docx", "docm", "dot", "dotx", "rtf", "odt"], scheme: "ms-word", label: "Word" },
  { exts: ["xls", "xlsx", "xlsm", "xlsb", "ods", "csv"], scheme: "ms-excel", label: "Excel" },
  { exts: ["ppt", "pptx", "pptm", "pps", "ppsx", "odp"], scheme: "ms-powerpoint", label: "PowerPoint" },
];
/** What Microsoft's online viewer can show (it doesn't do CSV or the Open Document types). */
const OFFICE_VIEWABLE = new Set(["doc", "docx", "docm", "dot", "dotx", "rtf", "xls", "xlsx", "xlsm", "xlsb", "ppt", "pptx", "pptm", "pps", "ppsx"]);
const IMAGE = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "heic", "avif"]);
const TEXT = new Set(["txt", "csv", "md", "log", "json", "xml"]);
const MAX_TEXT_BYTES = 2_000_000;

export function extOf(name: string): string {
  const base = name.split(/[?#]/)[0];
  const dot = base.lastIndexOf(".");
  return dot === -1 ? "" : base.slice(dot + 1).toLowerCase();
}

/** The Office app that opens this file type, if any. */
export function officeAppFor(name: string) {
  const ext = extOf(name);
  return OFFICE_APPS.find((a) => a.exts.includes(ext)) ?? null;
}

/** Opens a file link in the installed Office app (read-only copy). */
export function launchOfficeApp(name: string, url: string): boolean {
  const app = officeAppFor(name);
  if (!app) return false;
  window.location.href = `${app.scheme}:ofv|u|${url}`;
  return true;
}

type Kind = "pdf" | "image" | "office" | "text" | "none";
function kindOf(name: string): Kind {
  const ext = extOf(name);
  if (ext === "pdf") return "pdf";
  if (IMAGE.has(ext)) return "image";
  if (OFFICE_VIEWABLE.has(ext)) return "office";
  if (TEXT.has(ext)) return "text";
  return "none";
}

export function GuestFileViewer({ file, onClose, onDownload, onOpenInApp, appHint }: {
  file: ViewerFile | null;
  onClose: () => void;
  onDownload: () => void;
  /** Fetches a fresh link (the viewer's may have expired) and launches the Office app. */
  onOpenInApp: () => void;
  /** Shown under "Open in …" — e.g. how to put changes back. */
  appHint?: string;
}) {
  const [text, setText] = useState<string | null>(null);
  const [textError, setTextError] = useState(false);

  useEffect(() => {
    if (!file) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [file, onClose]);

  const kind = file ? kindOf(file.name) : "none";
  useEffect(() => {
    setText(null); setTextError(false);
    if (!file?.url || kind !== "text") return;
    let alive = true;
    fetch(file.url)
      .then(async (r) => {
        if (!r.ok) throw new Error(String(r.status));
        const blob = await r.blob();
        if (blob.size > MAX_TEXT_BYTES) throw new Error("too large");
        return blob.text();
      })
      .then((t) => { if (alive) setText(t); })
      .catch(() => { if (alive) setTextError(true); });
    return () => { alive = false; };
  }, [file?.url, kind]);

  if (!file) return null;
  const app = officeAppFor(file.name);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/85 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={file.name}>
      <div className="flex flex-wrap items-center gap-2 border-b border-border/60 bg-background/95 px-3 py-2.5 sm:px-4">
        <FileIcon className="h-5 w-5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground" title={file.name}>{file.name}</span>
        <div className="flex items-center gap-2">
          {app && (
            <button type="button" onClick={onOpenInApp} disabled={!file.url}
              title={appHint ?? `Opens a read-only copy in ${app.label} on this device`}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50">
              <ExternalLink className="h-4 w-4" /> Open in {app.label}
            </button>
          )}
          <button type="button" onClick={onDownload} disabled={!file.url}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card/60 px-3 text-sm text-foreground transition hover:bg-card disabled:opacity-50">
            <Download className="h-4 w-4" /> <span className="hidden sm:inline">Download</span>
          </button>
          <button type="button" onClick={onClose} title="Close (Esc)"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-card hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="relative min-h-0 flex-1">
        {!file.url ? (
          <div className="flex h-full items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : kind === "pdf" ? (
          <iframe title={file.name} src={file.url} className="h-full w-full border-0 bg-white" />
        ) : kind === "image" ? (
          <div className="flex h-full items-center justify-center overflow-auto p-4">
            <img src={file.url} alt={file.name} className="max-h-full max-w-full object-contain" />
          </div>
        ) : kind === "office" ? (
          <div className="flex h-full flex-col">
            <iframe title={file.name} className="min-h-0 w-full flex-1 border-0 bg-white"
              src={`https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(file.url)}`} />
            <p className="bg-background/95 px-4 py-1.5 text-center text-[11px] text-muted-foreground">
              Preview by Microsoft Office. If it doesn't load, use {app ? `Open in ${app.label} or ` : ""}Download.
            </p>
          </div>
        ) : kind === "text" ? (
          text != null ? (
            <pre className="h-full overflow-auto whitespace-pre-wrap break-words bg-background p-4 font-mono text-xs text-foreground">{text}</pre>
          ) : textError ? (
            <NoPreview name={file.name} onDownload={onDownload} />
          ) : (
            <div className="flex h-full items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          )
        ) : (
          <NoPreview name={file.name} onDownload={onDownload} appLabel={app?.label} onOpenInApp={app ? onOpenInApp : undefined} />
        )}
      </div>
    </div>
  );
}

function NoPreview({ name, onDownload, appLabel, onOpenInApp }: { name: string; onDownload: () => void; appLabel?: string; onOpenInApp?: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <FileIcon className="h-10 w-10 text-muted-foreground/50" />
      <p className="text-sm text-muted-foreground">“{name}” can't be previewed here.</p>
      <div className="flex gap-2">
        {onOpenInApp && appLabel && (
          <button type="button" onClick={onOpenInApp}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground">
            <ExternalLink className="h-4 w-4" /> Open in {appLabel}
          </button>
        )}
        <button type="button" onClick={onDownload}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card/60 px-3 text-sm text-foreground">
          <Download className="h-4 w-4" /> Download
        </button>
      </div>
    </div>
  );
}

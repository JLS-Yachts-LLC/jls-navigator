/**
 * Crew Academy course creator — the pieces every part of it shares: where it
 * reads and writes (CourseBackend: JLS's library or a vessel's own courses),
 * the block catalogue for the "Add block" menu, one-line block summaries, file
 * uploads, signed-URL thumbnails and a small popup menu that stays inside the
 * page's theme (no portal, so it works in the Client Portal's scoped theme too).
 */
import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  Crosshair, FileText, Film, Image as ImageIcon, LayoutGrid, Link2, ListChecks, ListOrdered, Loader2, Signature, Square, Type,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { BLOCK_LABELS, type Block, type BlockType } from "@/lib/academy/content";

export async function adminFetch(path: string, init: RequestInit = {}): Promise<any> {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(path, {
    ...init,
    headers: { ...(init.headers ?? {}), Authorization: `Bearer ${session?.access_token ?? ""}` },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(body?.error ?? `Request failed (${res.status})`), { status: res.status, body });
  return body;
}
export const post = (body: unknown) =>
  adminFetch("/api/academy-admin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

/**
 * Where the course creator reads and writes. JLS's library uses
 * /api/academy-admin; a vessel writing its own courses in the Client Portal
 * passes a backend for /api/portal/academy (same operations, its own scope).
 */
export type CourseBackend = {
  /** GET with this query string, e.g. "op=course&id=…". */
  get: (query: string) => Promise<any>;
  post: (body: unknown) => Promise<any>;
  /** JLS only: choose which vessels a course is offered to. */
  canOffer: boolean;
  /** Shown as "From …" in the preview. */
  owner: string;
  backLabel: string;
  /** Optional: store a file another way (tests). Default: a signed upload via op "upload-url". */
  upload?: (file: File, kind: MediaKind) => Promise<MediaFile>;
};
export const JLS_BACKEND: CourseBackend = {
  get: (q) => adminFetch(`/api/academy-admin?${q}`), post, canOffer: true, owner: "JLS Yachts", backLabel: "Course library",
};
export const BackendCtx = createContext<CourseBackend>(JLS_BACKEND);
export const useBackend = () => useContext(BackendCtx);

export type MediaKind = "video" | "image" | "document";
export type MediaFile = { id: string; kind: string; file_name: string; mime_type: string | null; size_bytes: number | null };

export const inputCls = "w-full rounded-lg border border-border bg-background/60 px-3 py-2 text-sm outline-none focus:border-primary/60";
export const labelCls = "mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground";
export const fmtDate = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";
export const fmtSize = (b: number | null | undefined) => (b ? (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`) : "");

export function ToolButton({ onClick, icon: Icon, children, busy, primary, disabled, title, className }: {
  onClick: () => void; icon: any; children?: React.ReactNode; busy?: boolean; primary?: boolean; disabled?: boolean; title?: string; className?: string;
}) {
  return (
    <button type="button" onClick={onClick} disabled={busy || disabled} title={title} aria-label={title}
      className={cn("inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition disabled:opacity-40",
        primary ? "border-primary bg-primary text-primary-foreground hover:brightness-110" : "border-border bg-card/60 hover:bg-card",
        !children && "w-8 justify-center px-0", className)}>
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Icon className="h-3.5 w-3.5" />}{children}
    </button>
  );
}

export function StatusPill({ status }: { status: string }) {
  const cls = status === "published" ? "bg-emerald-500/15 text-emerald-300" : status === "archived" ? "bg-slate-500/15 text-slate-300" : "bg-amber-500/15 text-amber-300";
  return <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase", cls)}>{status}</span>;
}

// ── Blocks: icons, the "Add block" catalogue, one-line summaries ────────────
export const BLOCK_ICONS: Partial<Record<BlockType, any>> = {
  reading: Type, video: Film, document: FileText, image: ImageIcon, quiz: ListChecks, acknowledge: Signature,
  match: Link2, order: ListOrdered, sort: LayoutGrid, hotspot: Crosshair,
};
export const blockIcon = (t: BlockType) => BLOCK_ICONS[t] ?? Square;

const CATALOGUE: { group: string; items: [BlockType, string][] }[] = [
  { group: "Content", items: [
    ["reading", "Text with headings, lists and links"],
    ["acknowledge", "Crew confirm they've read and understood"],
  ] },
  { group: "Media", items: [
    ["image", "A picture with an optional caption"],
    ["video", "Upload an MP4, or link YouTube / Vimeo"],
    ["document", "A PDF for crew to open and read"],
  ] },
  { group: "Check understanding", items: [
    ["quiz", "Multiple-choice or true / false questions, marked"],
  ] },
  { group: "Interactive", items: [
    ["match", "Drag each item onto its match"],
    ["order", "Put steps in the right order"],
    ["sort", "Sort items into groups"],
    ["hotspot", "Tap the right place on a picture"],
  ] },
];
/** The catalogue, plus any block type added to content.ts later (under "More"). */
export function blockCatalogue(): { group: string; items: { type: BlockType; label: string; description: string }[] }[] {
  const listed = new Set(CATALOGUE.flatMap((g) => g.items.map(([t]) => t)));
  const extra = (Object.keys(BLOCK_LABELS) as BlockType[]).filter((t) => !listed.has(t));
  const groups = CATALOGUE.map((g) => ({ group: g.group, items: g.items.map(([type, description]) => ({ type, label: BLOCK_LABELS[type], description })) }));
  if (extra.length) groups.push({ group: "More", items: extra.map((type) => ({ type, label: BLOCK_LABELS[type], description: "" })) });
  return groups;
}

const plain = (md: string) => md.split("\n").map((l) => l.replace(/^\s*(#{1,6}\s+|[-*+]\s+|\d+[.)]\s+|>\s*)/, "")
  .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/[*_`~]/g, "").trim()).find(Boolean) ?? "";
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** One line for a collapsed block: what it says, a detail, and a picture to show. */
export function blockSummary(b: Block, files: MediaFile[]): { title: string; detail?: string; mediaId?: string | null } {
  const fileName = (id: string | null | undefined) => (id ? files.find((f) => f.id === id)?.file_name ?? "File attached" : undefined);
  switch (b.type) {
    case "reading": return { title: plain(b.markdown) || "Empty", detail: b.markdown.trim() ? `${b.markdown.trim().split(/\s+/).length} words` : undefined };
    case "image": return { title: b.caption?.trim() || fileName(b.mediaId) || "No picture yet", detail: b.caption?.trim() ? fileName(b.mediaId) : undefined, mediaId: b.mediaId };
    case "video": return {
      title: b.title?.trim() || fileName(b.mediaId) || (b.url ? "Linked video" : "No video yet"),
      detail: b.mediaId ? `${fileName(b.mediaId)}${b.mustWatch ? " · must watch to the end" : ""}` : b.url ? b.url.replace(/^https?:\/\/(www\.)?/, "").slice(0, 40) : undefined,
    };
    case "document": return { title: b.title?.trim() || fileName(b.mediaId) || "No PDF yet", detail: b.title?.trim() ? fileName(b.mediaId) : undefined };
    case "quiz": return { title: b.title?.trim() || "Quiz", detail: plural(b.questions.length, "question") };
    case "acknowledge": return { title: b.statement.trim() || "No statement yet" };
    case "match": return { title: b.title?.trim() || b.prompt?.trim() || "Match pairs", detail: plural(b.pairs.length, "pair") };
    case "order": return { title: b.title?.trim() || b.prompt?.trim() || "Put in order", detail: plural(b.items.length, "step") };
    case "sort": return { title: b.title?.trim() || b.prompt?.trim() || "Sort into groups", detail: `${plural(b.items.length, "item")} · ${plural(b.buckets.length, "group")}` };
    case "hotspot": return { title: b.title?.trim() || b.prompt?.trim() || "Tap the picture", detail: plural(b.spots.length, "right place"), mediaId: b.mediaId };
    default: return { title: BLOCK_LABELS[(b as Block).type] ?? "Block" };
  }
}

// ── Files ─────────────────────────────────────────────────────────────────────
export const ACCEPT: Record<MediaKind, string> = {
  video: "video/mp4", image: "image/jpeg,image/png,image/webp,image/gif", document: "application/pdf",
};
export const kindOfFile = (f: File): MediaKind | null =>
  f.type === "video/mp4" ? "video" : f.type === "application/pdf" ? "document" : /^image\/(jpeg|png|webp|gif)$/.test(f.type) ? "image" : null;
const KIND_WORDS: Record<MediaKind, string> = { video: "an MP4 video", image: "a JPG, PNG, WebP or GIF picture", document: "a PDF" };

/** Upload one course file and return its academy_media row. Throws a plain-English error. */
export async function uploadMedia(api: CourseBackend, courseId: string, file: File, want: MediaKind, maxUpload: number): Promise<MediaFile> {
  const kind = kindOfFile(file);
  if (kind !== want) throw new Error(`“${file.name}” isn't ${KIND_WORDS[want]}.`);
  if (file.size > maxUpload) {
    throw new Error(`That file is ${(file.size / 1048576).toFixed(0)} MB — the limit is ${maxUpload / 1048576} MB.${kind === "video" ? " Export at 720p (H.264 MP4) to make it smaller." : ""}`);
  }
  if (api.upload) return api.upload(file, kind);
  const r = await api.post({ op: "upload-url", courseId, fileName: file.name, mimeType: file.type, size: file.size });
  const { error } = await supabase.storage.from(r.bucket).uploadToSignedUrl(r.path, r.token, file, { contentType: file.type });
  if (error) throw error;
  return { id: r.mediaId, kind: r.kind, file_name: file.name, mime_type: file.type, size_bytes: file.size };
}

const urlCache = new WeakMap<CourseBackend, Map<string, Promise<string | null>>>();
/** A short-lived link to a course file (cached for the session), for thumbnails and the hotspot editor. */
export function useMediaUrl(mediaId: string | null | undefined): string | null {
  const api = useBackend();
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    setUrl(null);
    if (!mediaId) return;
    let cache = urlCache.get(api);
    if (!cache) urlCache.set(api, (cache = new Map()));
    let p = cache.get(mediaId);
    if (!p) {
      p = api.get(`op=media-url&id=${encodeURIComponent(mediaId)}`).then((r) => r.url ?? null).catch(() => null);
      cache.set(mediaId, p);
    }
    let live = true;
    void p.then((u) => { if (live) setUrl(u); });
    return () => { live = false; };
  }, [api, mediaId]);
  return url;
}

export function Thumb({ mediaId, className }: { mediaId: string | null | undefined; className?: string }) {
  const url = useMediaUrl(mediaId);
  return (
    <span className={cn("block shrink-0 overflow-hidden rounded-md bg-background/60", className)}>
      {url && <img src={url} alt="" className="h-full w-full object-cover" draggable={false} />}
    </span>
  );
}

// ── A small popup menu ──────────────────────────────────────────────────────
/**
 * Positioned against the viewport so scrolling panes don't clip it, but
 * rendered in place (not portalled) so it keeps the surrounding theme.
 */
export function Menu({ button, children, width = 240, align = "end" }: {
  button: (p: { open: boolean; toggle: () => void; ref: React.Ref<HTMLButtonElement> }) => React.ReactNode;
  children: (close: () => void) => React.ReactNode;
  width?: number; align?: "start" | "end";
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number; maxHeight: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const close = () => setOpen(false);

  useLayoutEffect(() => {
    if (!open || !btn.current) return;
    const r = btn.current.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight;
    const w = Math.min(width, vw - 16);
    const left = Math.max(8, Math.min(vw - w - 8, align === "end" ? r.right - w : r.left));
    const below = vh - r.bottom - 8, above = r.top - 8;
    setPos(below >= 440 || below >= above
      ? { left, top: r.bottom + 4, maxHeight: Math.max(160, below - 4) }
      : { left, bottom: vh - r.top + 4, maxHeight: Math.max(160, above - 4) });
  }, [open, width, align]);

  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => {
      if (panel.current?.contains(e.target as Node) || btn.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); setOpen(false); btn.current?.focus(); } };
    const away = (e: Event) => { if (!panel.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", down, true);
    document.addEventListener("keydown", key, true);
    window.addEventListener("scroll", away, true);
    return () => {
      document.removeEventListener("pointerdown", down, true);
      document.removeEventListener("keydown", key, true);
      window.removeEventListener("scroll", away, true);
    };
  }, [open]);

  return (
    <>
      {button({ open, toggle: () => setOpen((o) => !o), ref: btn })}
      {open && pos && (
        <div ref={panel} role="menu"
          className="fixed z-[60] overflow-y-auto rounded-xl border border-border bg-card p-1 text-foreground shadow-2xl shadow-black/40"
          style={{ left: pos.left, top: pos.top, bottom: pos.bottom, width: Math.min(width, window.innerWidth - 16), maxHeight: pos.maxHeight }}>
          {children(close)}
        </div>
      )}
    </>
  );
}

export function MenuItem({ icon: Icon, children, description, onSelect, danger, disabled }: {
  icon?: any; children: React.ReactNode; description?: string; onSelect: () => void; danger?: boolean; disabled?: boolean;
}) {
  return (
    <button type="button" role="menuitem" disabled={disabled} onClick={onSelect}
      className={cn("flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition hover:bg-background/70 disabled:opacity-40 disabled:hover:bg-transparent",
        danger ? "text-red-300" : "text-foreground")}>
      {Icon && <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", danger ? "text-red-300" : "text-muted-foreground")} />}
      <span className="min-w-0">
        <span className="block leading-5">{children}</span>
        {description && <span className="block text-xs leading-4 text-muted-foreground">{description}</span>}
      </span>
    </button>
  );
}
export const MenuLabel = ({ children }: { children: React.ReactNode }) =>
  <div className="px-2.5 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{children}</div>;
export const MenuDivider = () => <div className="my-1 h-px bg-border/70" />;

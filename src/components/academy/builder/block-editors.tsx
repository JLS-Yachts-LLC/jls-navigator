/**
 * Crew Academy course creator — the editor for each kind of block, shown when a
 * block is opened. Every change goes through onChange(newBlock); the course
 * editor autosaves it. Files are dropped or uploaded here, or picked from the
 * course's files; hotspot places are added, dragged and resized on the picture.
 */
import { useLayoutEffect, useRef, useState } from "react";
import {
  ArrowDown, ArrowUp, Bold, CheckCircle2, Eye, EyeOff, FileText, Film, FolderOpen, Heading, Image as ImageIcon, Italic, Link as LinkIcon, Link2,
  List, ListOrdered, Loader2, Plus, Trash2, Upload, X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Markdown } from "@/components/ui/markdown";
import {
  embedUrl, newId, newPair, newQuestion,
  type Block, type HotspotBlock, type MatchBlock, type OrderBlock, type Question, type QuizBlock, type SortBlock,
} from "@/lib/academy/content";
import {
  ACCEPT, Menu, MenuLabel, Thumb, fmtSize, inputCls, kindOfFile, uploadMedia, useBackend, useMediaUrl,
  type MediaFile, type MediaKind,
} from "./shared";

export type BlockFieldsProps = {
  block: Block; editable: boolean; courseId: string; files: MediaFile[]; maxUpload: number;
  onUploaded: (f: MediaFile) => void; onChange: (b: Block) => void;
};

export function BlockFields({ block, editable, courseId, files, maxUpload, onUploaded, onChange }: BlockFieldsProps) {
  const set = (patch: Partial<Block>) => onChange({ ...block, ...patch } as Block);
  const media = { courseId, files, maxUpload, onUploaded, editable };
  return (
    <fieldset disabled={!editable} className="min-w-0 space-y-3">
      {block.type === "reading" && <ReadingEditor value={block.markdown} onChange={(markdown) => set({ markdown })} />}
      {block.type === "video" && (
        <>
          <Field label="Title (optional)"><input className={inputCls} value={block.title ?? ""} onChange={(e) => set({ title: e.target.value })} /></Field>
          <MediaField kind="video" mediaId={block.mediaId ?? null} {...media} onPick={(mediaId) => set({ mediaId, url: null })} />
          {!block.mediaId && (
            <Field label="…or a YouTube / Vimeo link">
              <input className={inputCls} placeholder="https://www.youtube.com/watch?v=…" value={block.url ?? ""} onChange={(e) => set({ url: e.target.value })} />
              {block.url && !embedUrl(block.url) && <p className="mt-1 text-xs text-amber-300">Only YouTube and Vimeo links can be played.</p>}
              {block.url && embedUrl(block.url) && <p className="mt-1 text-xs text-muted-foreground">Linked videos can't be tracked — they count as watched once opened.</p>}
            </Field>
          )}
          {block.mediaId && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={block.mustWatch} onChange={(e) => set({ mustWatch: e.target.checked })} /> Must be watched to the end
            </label>
          )}
        </>
      )}
      {block.type === "document" && (
        <>
          <Field label="Title shown to crew"><input className={inputCls} value={block.title ?? ""} onChange={(e) => set({ title: e.target.value })} /></Field>
          <MediaField kind="document" mediaId={block.mediaId} {...media} onPick={(mediaId) => set({ mediaId })} />
        </>
      )}
      {block.type === "image" && (
        <>
          <MediaField kind="image" mediaId={block.mediaId} {...media} onPick={(mediaId) => set({ mediaId })} large />
          <Field label="Caption (optional)"><input className={inputCls} value={block.caption ?? ""} onChange={(e) => set({ caption: e.target.value })} /></Field>
        </>
      )}
      {block.type === "acknowledge" && (
        <Field label="What the crew member confirms">
          <AutoTextarea className={inputCls} value={block.statement} onChange={(statement) => set({ statement })}
            placeholder="e.g. I have read and understood the garbage management plan." minRows={2} />
        </Field>
      )}
      {block.type === "quiz" && <QuizEditor block={block} onChange={onChange} />}
      {(block.type === "match" || block.type === "order" || block.type === "sort" || block.type === "hotspot") && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <Field label="Title (optional)"><input className={inputCls} value={block.title ?? ""} onChange={(e) => set({ title: e.target.value })} /></Field>
          <Field label="Instruction shown to crew">
            <AutoTextarea className={inputCls} value={block.prompt ?? ""} onChange={(prompt) => set({ prompt })} minRows={1} />
          </Field>
        </div>
      )}
      {block.type === "match" && <MatchEditor block={block} onChange={onChange} />}
      {block.type === "order" && <OrderEditor block={block} onChange={onChange} />}
      {block.type === "sort" && <SortEditor block={block} onChange={onChange} />}
      {block.type === "hotspot" && (
        <>
          <MediaField kind="image" mediaId={block.mediaId} {...media} onPick={(mediaId) => set({ mediaId })} compact />
          {block.mediaId && <HotspotEditor block={block} onChange={onChange} editable={editable} />}
        </>
      )}
    </fieldset>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block min-w-0"><span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>{children}</label>;
}

/** A textarea that grows with its text instead of scrolling inside the page. */
export function AutoTextarea({ value, onChange, minRows = 3, className, inputRef, ...rest }: {
  value: string; onChange: (v: string) => void; minRows?: number; className?: string; inputRef?: React.RefObject<HTMLTextAreaElement | null>;
} & Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "onChange">) {
  const own = useRef<HTMLTextAreaElement>(null);
  const ref = inputRef ?? own;
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [value]);
  return <textarea ref={ref} rows={minRows} className={cn("resize-none overflow-hidden", className)} value={value}
    onChange={(e) => onChange(e.target.value)} {...rest} />;
}

// ── Reading: markdown with a toolbar and a live preview ──────────────────────
type Fmt = "bold" | "italic" | "heading" | "bullets" | "numbers" | "link";
function format(value: string, start: number, end: number, kind: Fmt): { value: string; start: number; end: number } {
  // Spaces at the edges of a selection stay outside the markers ("**word **" isn't bold in markdown).
  while (start < end && /\s/.test(value[start])) start++;
  while (end > start && /\s/.test(value[end - 1])) end--;
  const sel = value.slice(start, end);
  const wrap = (mark: string, fallback: string) => {
    const text = sel || fallback;
    return { value: value.slice(0, start) + mark + text + mark + value.slice(end), start: start + mark.length, end: start + mark.length + text.length };
  };
  if (kind === "bold") return wrap("**", "bold text");
  if (kind === "italic") return wrap("*", "italic text");
  if (kind === "link") {
    const text = sel || "link text";
    const out = `[${text}](https://)`;
    return { value: value.slice(0, start) + out + value.slice(end), start: start + text.length + 3, end: start + text.length + 11 };
  }
  // Line formats: apply to every line the selection touches.
  const ls = value.lastIndexOf("\n", start - 1) + 1;
  const le = (() => { const i = value.indexOf("\n", end); return i === -1 ? value.length : i; })();
  const lines = value.slice(ls, le).split("\n");
  const strip = (l: string) => l.replace(/^(#{1,6}\s+|[-*+]\s+|\d+[.)]\s+)/, "");
  const already = lines.every((l) => (kind === "heading" ? /^#{1,6}\s/.test(l) : kind === "bullets" ? /^[-*+]\s/.test(l) : /^\d+[.)]\s/.test(l)));
  const next = lines.map((l, i) => (already ? strip(l) : (kind === "heading" ? "### " : kind === "bullets" ? "- " : `${i + 1}. `) + strip(l))).join("\n");
  return { value: value.slice(0, ls) + next + value.slice(le), start: ls, end: ls + next.length };
}

function ReadingEditor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const ta = useRef<HTMLTextAreaElement>(null);
  const [preview, setPreview] = useState(() => { try { return localStorage.getItem("academy-builder-md-preview") !== "off"; } catch { return true; } });
  const togglePreview = () => setPreview((p) => { try { localStorage.setItem("academy-builder-md-preview", p ? "off" : "on"); } catch { /* */ } return !p; });
  const apply = (kind: Fmt) => {
    const el = ta.current;
    if (!el) return;
    const r = format(value, el.selectionStart, el.selectionEnd, kind);
    onChange(r.value);
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(r.start, r.end); });
  };
  const tools: [Fmt, any, string][] = [
    ["bold", Bold, "Bold (Ctrl+B)"], ["italic", Italic, "Italic (Ctrl+I)"], ["heading", Heading, "Heading"],
    ["bullets", List, "Bulleted list"], ["numbers", ListOrdered, "Numbered list"], ["link", LinkIcon, "Link"],
  ];
  return (
    <div className="min-w-0">
      <div className="mb-1.5 flex flex-wrap items-center gap-0.5">
        {tools.map(([k, Icon, title]) => (
          <button key={k} type="button" title={title} aria-label={title} onMouseDown={(e) => e.preventDefault()} onClick={() => apply(k)}
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-background/70 hover:text-foreground">
            <Icon className="h-4 w-4" />
          </button>
        ))}
        <button type="button" onClick={togglePreview}
          className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground hover:bg-background/70 hover:text-foreground">
          {preview ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />} {preview ? "Hide preview" : "Show preview"}
        </button>
      </div>
      <div className={cn("grid min-w-0 gap-3", preview && "@2xl:grid-cols-2")}>
        <AutoTextarea inputRef={ta} value={value} onChange={onChange} minRows={6}
          className={cn(inputCls, "min-h-[140px] font-mono text-[13px] leading-relaxed")}
          onKeyDown={(e) => {
            if (!(e.ctrlKey || e.metaKey)) return;
            const k = e.key.toLowerCase();
            if (k === "b" || k === "i") { e.preventDefault(); apply(k === "b" ? "bold" : "italic"); }
          }} />
        {preview && (
          <div className="min-w-0 rounded-lg border border-border/60 bg-background/30 p-3 text-sm">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Preview</div>
            <Markdown>{value || "_Nothing yet_"}</Markdown>
          </div>
        )}
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">Select text and use the buttons, or type **bold**, *italic*, ### heading, - list.</p>
    </div>
  );
}

// ── Files: drop, upload or pick one the course already has ───────────────────
const KIND_ICON: Record<MediaKind, any> = { video: Film, image: ImageIcon, document: FileText };
const KIND_NOUN: Record<MediaKind, string> = { video: "video", image: "picture", document: "PDF" };

function MediaField({ kind, mediaId, courseId, files, maxUpload, onUploaded, onPick, editable, large, compact }: {
  kind: MediaKind; mediaId: string | null; courseId: string; files: MediaFile[]; maxUpload: number; editable: boolean;
  onUploaded: (f: MediaFile) => void; onPick: (mediaId: string | null) => void; large?: boolean; compact?: boolean;
}) {
  const api = useBackend();
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const current = files.find((f) => f.id === mediaId);
  const choices = files.filter((f) => f.kind === kind && f.id !== mediaId);
  const Icon = KIND_ICON[kind];

  const upload = async (file: File) => {
    setUploading(file.name);
    try {
      const f = await uploadMedia(api, courseId, file, kind, maxUpload);
      onUploaded(f);
      onPick(f.id);
    } catch (e: any) { toast.error(e.message ?? "Upload failed"); }
    finally { setUploading(null); }
  };
  const drop = {
    onDragOver: (e: React.DragEvent) => {
      if (!editable || !e.dataTransfer.types.includes("Files")) return;
      e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = "copy"; setOver(true);
    },
    onDragLeave: () => setOver(false),
    onDrop: (e: React.DragEvent) => {
      if (!editable || !e.dataTransfer.files.length) return;
      e.preventDefault(); e.stopPropagation(); setOver(false);
      const f = [...e.dataTransfer.files].find((x) => kindOfFile(x) === kind) ?? e.dataTransfer.files[0];
      void upload(f);
    },
  };
  const pickMenu = choices.length > 0 && (
    <Menu width={340} align="start" button={({ toggle, ref }) => (
      <button ref={ref} type="button" onClick={toggle}
        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs hover:bg-card">
        <FolderOpen className="h-3.5 w-3.5" /> Choose from this course ({choices.length})
      </button>
    )}>
      {(close) => (
        <>
          <MenuLabel>This course's {KIND_NOUN[kind]}s</MenuLabel>
          {choices.map((f) => (
            <button key={f.id} type="button" onClick={() => { onPick(f.id); close(); }}
              className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-background/70">
              {kind === "image" ? <Thumb mediaId={f.id} className="h-9 w-12" /> : <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />}
              <span className="min-w-0 flex-1 truncate">{f.file_name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{fmtSize(f.size_bytes)}</span>
            </button>
          ))}
        </>
      )}
    </Menu>
  );
  const uploadButton = (
    <button type="button" onClick={() => input.current?.click()} disabled={!!uploading}
      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs hover:bg-card disabled:opacity-50">
      {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
      {uploading ? `Uploading ${uploading}…` : mediaId ? "Replace" : `Upload ${KIND_NOUN[kind]}`}
    </button>
  );
  const fileInput = <input ref={input} type="file" accept={ACCEPT[kind]} className="hidden"
    onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void upload(f); }} />;

  if (mediaId) {
    return (
      <div {...drop} className={cn("rounded-lg border border-border/70 bg-background/30 p-2 transition", over && "border-primary bg-primary/10")}>
        <div className="flex flex-wrap items-center gap-3">
          {kind === "image" && !compact
            ? <PicturePreview mediaId={mediaId} large={large} />
            : <span className="flex h-10 w-10 items-center justify-center rounded-md bg-background/60">
                {kind === "image" ? <Thumb mediaId={mediaId} className="h-10 w-10" /> : <Icon className="h-5 w-5 text-muted-foreground" />}
              </span>}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 text-sm"><CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
              <span className="truncate">{current?.file_name ?? "File attached"}</span></div>
            {current?.size_bytes ? <div className="text-xs text-muted-foreground">{fmtSize(current.size_bytes)}</div> : null}
            {editable && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {uploadButton}{pickMenu}
                <button type="button" onClick={() => onPick(null)} className="text-xs text-muted-foreground hover:text-red-300">Remove</button>
              </div>
            )}
          </div>
        </div>
        {fileInput}
      </div>
    );
  }
  return (
    <div {...drop} className={cn("rounded-lg border-2 border-dashed border-border/80 px-4 py-5 text-center transition", over && "border-primary bg-primary/10")}>
      <Icon className="mx-auto h-6 w-6 text-muted-foreground" />
      <p className="mt-1.5 text-sm text-muted-foreground">
        {uploading ? `Uploading ${uploading}…` : `Drop a ${KIND_NOUN[kind]} here`}
        {kind === "video" && !uploading && <span className="block text-[11px]">720p MP4, up to {maxUpload / 1048576} MB</span>}
      </p>
      {editable && <div className="mt-3 flex flex-wrap items-center justify-center gap-2">{uploadButton}{pickMenu}</div>}
      {fileInput}
    </div>
  );
}

function PicturePreview({ mediaId, large }: { mediaId: string; large?: boolean }) {
  const url = useMediaUrl(mediaId);
  return (
    <span className={cn("block shrink-0 overflow-hidden rounded-md bg-background/60", large ? "h-40 w-full sm:h-36 sm:w-56" : "h-20 w-28")}>
      {url && <img src={url} alt="" className="h-full w-full object-contain" draggable={false} />}
    </span>
  );
}

// ── Exercises ────────────────────────────────────────────────────────────────
function RowTools({ i, n, onMove, onDelete, canDelete = true }: { i: number; n: number; onMove: (d: -1 | 1) => void; onDelete: () => void; canDelete?: boolean }) {
  const btn = "flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-card hover:text-foreground disabled:opacity-30";
  return (
    <div className="flex shrink-0 items-center">
      <button type="button" className={btn} disabled={i === 0} onClick={() => onMove(-1)} title="Move up" aria-label="Move up"><ArrowUp className="h-3.5 w-3.5" /></button>
      <button type="button" className={btn} disabled={i === n - 1} onClick={() => onMove(1)} title="Move down" aria-label="Move down"><ArrowDown className="h-3.5 w-3.5" /></button>
      <button type="button" className={cn(btn, "hover:text-red-300")} disabled={!canDelete} onClick={onDelete} title="Remove" aria-label="Remove"><Trash2 className="h-3.5 w-3.5" /></button>
    </div>
  );
}
function moved<T>(arr: T[], i: number, d: number): T[] {
  const j = i + d;
  if (j < 0 || j >= arr.length) return arr;
  const out = [...arr];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}
const addCls = "inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline";

function MatchEditor({ block, onChange }: { block: MatchBlock; onChange: (b: Block) => void }) {
  const setPair = (i: number, patch: Partial<MatchBlock["pairs"][number]>) =>
    onChange({ ...block, pairs: block.pairs.map((p, j) => (j === i ? { ...p, ...patch } : p)) });
  return (
    <div className="space-y-2">
      <p className="text-[11px] text-muted-foreground">Write each item and its match. Crew see the right-hand answers shuffled and drag them into place.</p>
      {block.pairs.map((p, i) => (
        <div key={p.id} className="flex flex-col gap-1.5 rounded-lg border border-border/50 p-2 sm:flex-row sm:items-center sm:border-0 sm:p-0">
          <input className={cn(inputCls, "py-1.5")} placeholder={`Item ${i + 1}`} value={p.left} onChange={(e) => setPair(i, { left: e.target.value })} />
          <Link2 className="hidden h-4 w-4 shrink-0 text-muted-foreground sm:block" />
          <div className="flex min-w-0 flex-1 items-center gap-1">
            <input className={cn(inputCls, "py-1.5")} placeholder="Its match" value={p.right} onChange={(e) => setPair(i, { right: e.target.value })} />
            <RowTools i={i} n={block.pairs.length} canDelete={block.pairs.length > 2}
              onMove={(d) => onChange({ ...block, pairs: moved(block.pairs, i, d) })}
              onDelete={() => onChange({ ...block, pairs: block.pairs.filter((_, j) => j !== i) })} />
          </div>
        </div>
      ))}
      {block.pairs.length < 20 && <button type="button" onClick={() => onChange({ ...block, pairs: [...block.pairs, newPair()] })} className={addCls}><Plus className="h-3.5 w-3.5" /> Add pair</button>}
    </div>
  );
}

function OrderEditor({ block, onChange }: { block: OrderBlock; onChange: (b: Block) => void }) {
  return (
    <div className="space-y-2">
      <p className="text-[11px] text-muted-foreground">Write the steps in the RIGHT order. Crew get them shuffled.</p>
      {block.items.map((it, i) => (
        <div key={it.id} className="flex items-center gap-2">
          <span className="w-5 shrink-0 text-right text-xs text-muted-foreground">{i + 1}.</span>
          <input className={cn(inputCls, "py-1.5")} placeholder={`Step ${i + 1}`} value={it.text}
            onChange={(e) => onChange({ ...block, items: block.items.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) })} />
          <RowTools i={i} n={block.items.length} canDelete={block.items.length > 2}
            onMove={(d) => onChange({ ...block, items: moved(block.items, i, d) })}
            onDelete={() => onChange({ ...block, items: block.items.filter((_, j) => j !== i) })} />
        </div>
      ))}
      {block.items.length < 20 && (
        <button type="button" onClick={() => onChange({ ...block, items: [...block.items, { id: newId(), text: "" }] })} className={addCls}><Plus className="h-3.5 w-3.5" /> Add step</button>
      )}
    </div>
  );
}

function SortEditor({ block, onChange }: { block: SortBlock; onChange: (b: Block) => void }) {
  return (
    <div className="space-y-3">
      <div>
        <div className="mb-1 text-xs font-medium text-muted-foreground">Groups</div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {block.buckets.map((b, i) => (
            <div key={b.id} className="flex items-center gap-1">
              <input className={cn(inputCls, "py-1.5")} placeholder={`Group ${i + 1}`} value={b.text}
                onChange={(e) => onChange({ ...block, buckets: block.buckets.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) })} />
              {block.buckets.length > 2 && (
                <button type="button" title="Remove group" aria-label="Remove group" className="flex h-8 w-8 shrink-0 items-center justify-center text-muted-foreground hover:text-red-300" onClick={() => {
                  const buckets = block.buckets.filter((_, j) => j !== i);
                  onChange({ ...block, buckets, items: block.items.map((it) => (it.bucketId === b.id ? { ...it, bucketId: buckets[0].id } : it)) });
                }}><X className="h-4 w-4" /></button>
              )}
            </div>
          ))}
        </div>
        {block.buckets.length < 6 && (
          <button type="button" onClick={() => onChange({ ...block, buckets: [...block.buckets, { id: newId(), text: "" }] })} className={cn(addCls, "mt-2")}><Plus className="h-3.5 w-3.5" /> Add group</button>
        )}
      </div>
      <div className="space-y-2">
        <div className="text-xs font-medium text-muted-foreground">Items, each with the group it belongs in</div>
        {block.items.map((it, i) => (
          <div key={it.id} className="flex flex-col gap-1.5 rounded-lg border border-border/50 p-2 sm:flex-row sm:items-center sm:border-0 sm:p-0">
            <input className={cn(inputCls, "py-1.5")} placeholder={`Item ${i + 1}`} value={it.text}
              onChange={(e) => onChange({ ...block, items: block.items.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) })} />
            <div className="flex items-center gap-1">
              <select className={cn(inputCls, "py-1.5 sm:w-56")} value={it.bucketId} title={block.buckets.find((b) => b.id === it.bucketId)?.text}
                onChange={(e) => onChange({ ...block, items: block.items.map((x, j) => (j === i ? { ...x, bucketId: e.target.value } : x)) })}>
                {block.buckets.map((b, bi) => <option key={b.id} value={b.id}>{b.text || `Group ${bi + 1}`}</option>)}
              </select>
              {block.items.length > 2 && (
                <button type="button" title="Remove item" aria-label="Remove item" className="flex h-8 w-8 shrink-0 items-center justify-center text-muted-foreground hover:text-red-300"
                  onClick={() => onChange({ ...block, items: block.items.filter((_, j) => j !== i) })}><X className="h-4 w-4" /></button>
              )}
            </div>
          </div>
        ))}
        {block.items.length < 30 && (
          <button type="button" onClick={() => onChange({ ...block, items: [...block.items, { id: newId(), text: "", bucketId: block.buckets[0]?.id ?? "" }] })}
            className={addCls}><Plus className="h-3.5 w-3.5" /> Add item</button>
        )}
      </div>
    </div>
  );
}

/**
 * Tap the picture to add a right place; drag a place to move it, drag its
 * handle to resize. Spots are circles in percentages of the picture's WIDTH.
 */
function HotspotEditor({ block, onChange, editable }: { block: HotspotBlock; onChange: (b: Block) => void; editable: boolean }) {
  const url = useMediaUrl(block.mediaId);
  const [aspect, setAspect] = useState(0.66);
  const [sel, setSel] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; mode: "move" | "size"; dx: number; dy: number } | null>(null);
  const latest = useRef(block);
  latest.current = block;

  const at = (e: { clientX: number; clientY: number }) => {
    const r = box.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.width) * 100 };
  };
  const round = (n: number) => Math.round(n * 100) / 100;
  const setSpot = (id: string, patch: Partial<HotspotBlock["spots"][number]>) =>
    onChange({ ...latest.current, spots: latest.current.spots.map((s) => (s.id === id ? { ...s, ...patch } : s)) });
  const remove = (id: string) => { onChange({ ...latest.current, spots: latest.current.spots.filter((s) => s.id !== id) }); setSel(null); };
  const style = (x: number, y: number, r: number) => ({ left: `${x - r}%`, top: `${(y - r) / aspect}%`, width: `${r * 2}%`, height: `${(r * 2) / aspect}%` });

  const startDrag = (e: React.PointerEvent, id: string, mode: "move" | "size") => {
    if (!editable) return;
    e.stopPropagation(); e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const s = latest.current.spots.find((x) => x.id === id)!;
    const p = at(e);
    drag.current = { id, mode, dx: p.x - s.x, dy: p.y - s.y };
    setSel(id);
  };
  const moveDrag = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const p = at(e);
    const s = latest.current.spots.find((x) => x.id === d.id);
    if (!s) return;
    if (d.mode === "move") {
      setSpot(d.id, { x: round(Math.min(100, Math.max(0, p.x - d.dx))), y: round(Math.min(100 * aspect, Math.max(0, p.y - d.dy))) });
    } else {
      setSpot(d.id, { r: round(Math.min(25, Math.max(2, Math.hypot(p.x - s.x, p.y - s.y)))) });
    }
  };
  const endDrag = () => { drag.current = null; };

  return (
    <div className="space-y-2">
      <p className="text-[11px] text-muted-foreground">
        Tap the picture to mark a right place (up to 10). Drag a circle to move it, drag its white handle to resize. A tap anywhere inside a circle counts as right.
      </p>
      {url ? (
        <div ref={box} tabIndex={0} aria-label="Picture — tap to mark a right place"
          className={cn("relative max-w-2xl select-none overflow-hidden rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-primary", editable && "cursor-crosshair")}
          onKeyDown={(e) => { if (sel && editable && (e.key === "Delete" || e.key === "Backspace")) { e.preventDefault(); remove(sel); } }}
          onClick={(e) => {
            if (!editable || e.target !== e.currentTarget && !(e.target as HTMLElement).dataset.pic) return;
            if (latest.current.spots.length >= 10) { toast.error("Up to 10 right places."); return; }
            const p = at(e);
            const id = newId();
            onChange({ ...latest.current, spots: [...latest.current.spots, { id, x: round(p.x), y: round(p.y), r: 6 }] });
            setSel(id);
          }}>
          <img data-pic="1" src={url} alt="" className="block w-full" draggable={false}
            onLoad={(e) => { const i = e.currentTarget; if (i.naturalWidth) setAspect(i.naturalHeight / i.naturalWidth); }} />
          {block.spots.map((s, i) => (
            <span key={s.id} style={{ ...style(s.x, s.y, s.r), touchAction: "none" }}
              onPointerDown={(e) => startDrag(e, s.id, "move")} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}
              onClick={(e) => { e.stopPropagation(); setSel(s.id); }}
              className={cn("absolute flex items-center justify-center rounded-full border-2 text-[11px] font-bold text-white",
                editable && "cursor-move",
                sel === s.id ? "border-sky-300 bg-sky-400/30 ring-2 ring-sky-300/50" : "border-emerald-400 bg-emerald-400/25")}>
              {i + 1}
              {editable && sel === s.id && (
                <span onPointerDown={(e) => startDrag(e, s.id, "size")} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}
                  style={{ touchAction: "none" }} title="Drag to resize"
                  className="absolute -right-2.5 top-1/2 h-5 w-5 -translate-y-1/2 cursor-ew-resize rounded-full border-2 border-sky-300 bg-white shadow" />
              )}
            </span>
          ))}
        </div>
      ) : <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading picture…</div>}
      {block.spots.length > 0 && (
        <div className="space-y-1">
          {block.spots.map((s, i) => (
            <div key={s.id} onClick={() => setSel(s.id)}
              className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md px-2 py-1 text-xs", sel === s.id && "bg-sky-400/10")}>
              <span className="w-14 font-medium">Place {i + 1}</span>
              <span className="text-muted-foreground">size</span>
              <input type="range" min={2} max={25} step={0.5} value={s.r} className="w-32 sm:w-40" aria-label={`Size of place ${i + 1}`}
                onChange={(e) => setSpot(s.id, { r: Number(e.target.value) })} />
              <button type="button" className="text-muted-foreground hover:text-red-300" onClick={(e) => { e.stopPropagation(); remove(s.id); }}>Remove</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function QuizEditor({ block, onChange }: { block: QuizBlock; onChange: (b: Block) => void }) {
  const setQ = (qi: number, patch: Partial<Question>) =>
    onChange({ ...block, questions: block.questions.map((q, i) => (i === qi ? { ...q, ...patch } : q)) });
  return (
    <div className="space-y-3">
      <Field label="Quiz title (optional)"><input className={inputCls} value={block.title ?? ""} onChange={(e) => onChange({ ...block, title: e.target.value })} /></Field>
      {block.questions.map((q, qi) => (
        <div key={q.id} className="rounded-lg border border-border/70 bg-background/30 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-muted-foreground">Question {qi + 1}</span>
            <select className={cn(inputCls, "w-auto py-1.5")} value={q.kind} onChange={(e) => {
              const nq = newQuestion(e.target.value as Question["kind"]);
              setQ(qi, { kind: nq.kind, options: e.target.value === "truefalse" ? nq.options : (q.kind === "truefalse" ? nq.options : q.options), correct: [] });
            }}>
              <option value="single">One right answer</option>
              <option value="multi">Several right answers</option>
              <option value="truefalse">True or false</option>
            </select>
            <div className="ml-auto">
              <RowTools i={qi} n={block.questions.length}
                onMove={(d) => onChange({ ...block, questions: moved(block.questions, qi, d) })}
                onDelete={() => onChange({ ...block, questions: block.questions.filter((_, i) => i !== qi) })} />
            </div>
          </div>
          <AutoTextarea className={cn(inputCls, "mt-2")} placeholder="Question" value={q.prompt} onChange={(prompt) => setQ(qi, { prompt })} minRows={1} />
          <div className="mt-2 space-y-1.5">
            {q.options.map((o, oi) => {
              const right = q.correct.includes(o.id);
              return (
                <div key={o.id} className="flex items-center gap-2">
                  <button type="button" title={right ? "Right answer" : "Mark as a right answer"} aria-label={right ? "Right answer" : "Mark as a right answer"}
                    onClick={() => setQ(qi, { correct: q.kind === "multi" ? (right ? q.correct.filter((c) => c !== o.id) : [...q.correct, o.id]) : [o.id] })}
                    className={cn("flex h-8 w-8 shrink-0 items-center justify-center border", q.kind === "multi" ? "rounded-md" : "rounded-full",
                      right ? "border-emerald-500 bg-emerald-500/20 text-emerald-300" : "border-border text-muted-foreground/40 hover:text-muted-foreground")}>
                    <CheckCircle2 className="h-4 w-4" />
                  </button>
                  <input className={cn(inputCls, "py-1.5")} value={o.text} disabled={q.kind === "truefalse"} placeholder={`Answer ${oi + 1}`}
                    onChange={(e) => setQ(qi, { options: q.options.map((x, i) => (i === oi ? { ...x, text: e.target.value } : x)) })} />
                  {q.kind !== "truefalse" && q.options.length > 2 && (
                    <button type="button" onClick={() => setQ(qi, { options: q.options.filter((_, i) => i !== oi), correct: q.correct.filter((c) => c !== o.id) })}
                      className="flex h-8 w-8 shrink-0 items-center justify-center text-muted-foreground hover:text-red-300" title="Remove answer" aria-label="Remove answer"><X className="h-4 w-4" /></button>
                  )}
                </div>
              );
            })}
            {q.kind !== "truefalse" && q.options.length < 10 && (
              <button type="button" onClick={() => setQ(qi, { options: [...q.options, { id: newId(), text: "" }] })} className={addCls}><Plus className="h-3.5 w-3.5" /> Add answer</button>
            )}
          </div>
          <input className={cn(inputCls, "mt-2")} placeholder="Explanation shown after they pass (optional)" value={q.explanation ?? ""}
            onChange={(e) => setQ(qi, { explanation: e.target.value })} />
        </div>
      ))}
      <button type="button" onClick={() => onChange({ ...block, questions: [...block.questions, newQuestion("single")] })}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"><Plus className="h-4 w-4" /> Add question</button>
      <p className="text-[11px] text-muted-foreground">Tick the circle next to each right answer. Crew can retry a quiz until they reach the pass mark.</p>
    </div>
  );
}

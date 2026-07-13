import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";
import { youtubeLineId } from "@/lib/youtube";

// Lightweight markdown renderer with explicit Tailwind styling (no typography
// plugin installed). Reused by Guides and, later, the forms/documentation pages.
//
// YouTube: any line that is solely a YouTube URL (or a `::youtube[…]` token) is
// rendered as an embedded, responsive 16:9 player exactly where it appears —
// so authors can drop videos between sections of a guide.
const COMPONENTS = {
  h1: ({ node, ...p }: any) => <h1 className="mt-6 mb-3 font-display text-xl font-bold first:mt-0" {...p} />,
  h2: ({ node, ...p }: any) => <h2 className="mt-6 mb-2.5 font-display text-lg font-semibold first:mt-0" {...p} />,
  h3: ({ node, ...p }: any) => <h3 className="mt-4 mb-2 font-semibold first:mt-0" {...p} />,
  p: ({ node, ...p }: any) => <p className="my-2.5" {...p} />,
  ul: ({ node, ...p }: any) => <ul className="my-2.5 ml-5 list-disc space-y-1.5" {...p} />,
  ol: ({ node, ...p }: any) => <ol className="my-2.5 ml-5 list-decimal space-y-1.5" {...p} />,
  li: ({ node, ...p }: any) => <li className="pl-1 marker:text-muted-foreground" {...p} />,
  a: ({ node, ...p }: any) => <a className="text-primary underline underline-offset-2" target="_blank" rel="noreferrer" {...p} />,
  strong: ({ node, ...p }: any) => <strong className="font-semibold text-foreground" {...p} />,
  em: ({ node, ...p }: any) => <em className="italic text-muted-foreground" {...p} />,
  hr: () => <hr className="my-5 border-border/60" />,
  blockquote: ({ node, ...p }: any) => <blockquote className="my-3 border-l-2 border-primary/40 pl-4 italic text-muted-foreground" {...p} />,
  code: ({ node, ...p }: any) => <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em]" {...p} />,
  table: ({ node, ...p }: any) => <div className="my-3 overflow-x-auto"><table className="w-full border-collapse text-sm" {...p} /></div>,
  th: ({ node, ...p }: any) => <th className="border border-border bg-muted/40 px-3 py-1.5 text-left font-semibold" {...p} />,
  td: ({ node, ...p }: any) => <td className="border border-border px-3 py-1.5" {...p} />,
};

function YouTubeEmbed({ id }: { id: string }) {
  return (
    <div className="my-4 aspect-video w-full overflow-hidden rounded-lg border border-border bg-black">
      <iframe
        src={`https://www.youtube.com/embed/${id}`}
        title="YouTube video"
        className="h-full w-full"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
        loading="lazy"
      />
    </div>
  );
}

/** Split the source into text blocks + video embeds (video markers on own lines). */
type Segment = { kind: "md"; text: string } | { kind: "yt"; id: string };
function segment(src: string): Segment[] {
  const out: Segment[] = [];
  let buf: string[] = [];
  const flush = () => { const t = buf.join("\n").trim(); if (t) out.push({ kind: "md", text: t }); buf = []; };
  for (const line of (src ?? "").split(/\r?\n/)) {
    const id = youtubeLineId(line);
    if (id) { flush(); out.push({ kind: "yt", id }); }
    else buf.push(line);
  }
  flush();
  return out;
}

export function Markdown({ children, className }: { children: string; className?: string }) {
  const segments = segment(children);
  return (
    <div className={cn("text-sm leading-relaxed text-foreground/90", className)}>
      {segments.map((s, i) =>
        s.kind === "yt" ? (
          <YouTubeEmbed key={i} id={s.id} />
        ) : (
          <ReactMarkdown key={i} remarkPlugins={[remarkGfm]} components={COMPONENTS as any}>
            {s.text}
          </ReactMarkdown>
        ),
      )}
    </div>
  );
}

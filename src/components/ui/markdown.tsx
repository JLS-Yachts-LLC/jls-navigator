import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

// Lightweight markdown renderer with explicit Tailwind styling (no typography
// plugin installed). Reused by Guides and, later, the forms/documentation pages.
export function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div className={cn("text-sm leading-relaxed text-foreground/90", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ node, ...p }) => <h1 className="mt-6 mb-3 font-display text-xl font-bold first:mt-0" {...p} />,
          h2: ({ node, ...p }) => <h2 className="mt-6 mb-2.5 font-display text-lg font-semibold first:mt-0" {...p} />,
          h3: ({ node, ...p }) => <h3 className="mt-4 mb-2 font-semibold first:mt-0" {...p} />,
          p: ({ node, ...p }) => <p className="my-2.5" {...p} />,
          ul: ({ node, ...p }) => <ul className="my-2.5 ml-5 list-disc space-y-1.5" {...p} />,
          ol: ({ node, ...p }) => <ol className="my-2.5 ml-5 list-decimal space-y-1.5" {...p} />,
          li: ({ node, ...p }) => <li className="pl-1 marker:text-muted-foreground" {...p} />,
          a: ({ node, ...p }) => <a className="text-primary underline underline-offset-2" target="_blank" rel="noreferrer" {...p} />,
          strong: ({ node, ...p }) => <strong className="font-semibold text-foreground" {...p} />,
          em: ({ node, ...p }) => <em className="italic text-muted-foreground" {...p} />,
          hr: () => <hr className="my-5 border-border/60" />,
          blockquote: ({ node, ...p }) => <blockquote className="my-3 border-l-2 border-primary/40 pl-4 italic text-muted-foreground" {...p} />,
          code: ({ node, ...p }) => <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em]" {...p} />,
          table: ({ node, ...p }) => <div className="my-3 overflow-x-auto"><table className="w-full border-collapse text-sm" {...p} /></div>,
          th: ({ node, ...p }) => <th className="border border-border bg-muted/40 px-3 py-1.5 text-left font-semibold" {...p} />,
          td: ({ node, ...p }) => <td className="border border-border px-3 py-1.5" {...p} />,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

import { createRouter, useRouter } from "@tanstack/react-router";
import { useEffect } from "react";
import { routeTree } from "./routeTree.gen";
import { supabase } from "@/integrations/supabase/client";
import { getCapturedLog } from "@/lib/action-log";

// A lazily-loaded JS chunk 404'ing (Vite's `vite:preloadError`) almost always
// means the browser is on a stale build after a new deploy — the hashed chunk
// filename it wants no longer exists. Reload once to pull the fresh index +
// chunks instead of dead-ending on the error screen. Guarded against reload loops.
const isChunkError = (msg: string | undefined) =>
  /dynamically imported module|importing a module script failed|failed to fetch dynamically|ChunkLoadError|error loading dynamically imported/i.test(msg ?? "");

function reloadOnceForStaleChunk() {
  try {
    const KEY = "polaris.staleChunkReloadAt";
    const last = Number(sessionStorage.getItem(KEY) || 0);
    if (Date.now() - last > 15000) {
      sessionStorage.setItem(KEY, String(Date.now()));
      window.location.reload();
    }
  } catch { window.location.reload(); }
}

if (typeof window !== "undefined") {
  window.addEventListener("vite:preloadError", (e) => {
    e.preventDefault();
    reloadOnceForStaleChunk();
  });
}

function DefaultErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  const chunkError = isChunkError(error?.message);

  // If a stale-chunk error reaches the boundary (didn't fire vite:preloadError),
  // reload automatically to recover onto the new build.
  useEffect(() => { if (chunkError) reloadOnceForStaleChunk(); }, [chunkError]);

  // Capture render/route crashes (React error boundary) into the Error & Warning
  // Log — window.onerror doesn't catch these, so they were previously invisible.
  useEffect(() => {
    try {
      const log = getCapturedLog();
      void (supabase as any).from("client_logs").insert({
        level: "error",
        message: `Render error: ${error?.message ?? String(error)}`,
        stack: error?.stack ? String(error.stack).slice(0, 6000) : null,
        source: "error-boundary",
        url: log.url || (typeof window !== "undefined" ? window.location.href : null),
        user_agent: log.userAgent || null,
        breadcrumbs: log.actions.slice(-12),
      });
    } catch { /* never throw from the error UI */ }
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-8 w-8 text-destructive"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
            />
          </svg>
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">{chunkError ? "A new version is available" : "Something went wrong"}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {chunkError ? "Polaris was updated while this tab was open. Reload to get the latest version." : "An unexpected error occurred. Please try again."}
        </p>
        {!chunkError && error.message && (
          <pre className="mt-4 max-h-40 overflow-auto rounded-md bg-muted p-3 text-left font-mono text-xs text-destructive">
            {error.message}
          </pre>
        )}
        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            onClick={() => {
              if (chunkError) { window.location.reload(); return; }
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {chunkError ? "Reload" : "Try again"}
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const getRouter = () => {
  const router = createRouter({
    routeTree,
    context: {},
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    defaultErrorComponent: DefaultErrorComponent,
  });

  return router;
};

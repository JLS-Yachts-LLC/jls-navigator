import { createRouter, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { routeTree } from "./routeTree.gen";
import { supabase } from "@/integrations/supabase/client";
import { getCapturedLog } from "@/lib/action-log";

// A lazily-loaded JS chunk 404'ing (Vite's `vite:preloadError`) almost always
// means the browser is on a stale build after a new deploy — the hashed chunk
// filename it wants no longer exists. Reload once to pull the fresh index +
// chunks instead of dead-ending on the error screen. Guarded against reload loops.
//
// On a stale build, the route loader's dynamic import can also resolve to
// `undefined` instead of throwing (rather than 404ing outright) when the
// client's routeTree no longer lines up with what the server now serves —
// surfacing as "Cannot read properties of undefined (reading 'component')"
// deep in TanStack Router's lazy-loading code. Same root cause, same fix.
const isChunkError = (msg: string | undefined) =>
  /dynamically imported module|importing a module script failed|failed to fetch dynamically|ChunkLoadError|error loading dynamically imported|reading ['"]component['"]/i.test(msg ?? "");

// A new version takes a minute or so to reach every Cloudflare edge, so a single
// reload can land on a server still serving the old one and fail again. Retry a
// few times, spaced out, before giving up and showing the Reload screen.
const RELOAD_KEY = "polaris.staleChunkReloads";
const RELOAD_DELAYS_MS = [0, 4000, 10000];
const RELOAD_WINDOW_MS = 3 * 60_000;

/** Reload onto the new build. Returns false once the retries are used up. */
function reloadForStaleChunk(): boolean {
  try {
    const raw = JSON.parse(sessionStorage.getItem(RELOAD_KEY) || "null") as { first: number; count: number } | null;
    const state = raw && Date.now() - raw.first < RELOAD_WINDOW_MS ? raw : { first: Date.now(), count: 0 };
    if (state.count >= RELOAD_DELAYS_MS.length) return false;
    sessionStorage.setItem(RELOAD_KEY, JSON.stringify({ first: state.first, count: state.count + 1 }));
    setTimeout(() => window.location.reload(), RELOAD_DELAYS_MS[state.count]);
    return true;
  } catch {
    window.location.reload();
    return true;
  }
}

/** Whether automatic reloads are still being tried (for the error screen). */
function staleReloadsLeft(): boolean {
  try {
    const raw = JSON.parse(sessionStorage.getItem(RELOAD_KEY) || "null") as { first: number; count: number } | null;
    return !raw || Date.now() - raw.first >= RELOAD_WINDOW_MS || raw.count < RELOAD_DELAYS_MS.length;
  } catch { return true; }
}

if (typeof window !== "undefined") {
  window.addEventListener("vite:preloadError", (e) => {
    if (reloadForStaleChunk()) e.preventDefault();
  });
}

function DefaultErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  const chunkError = isChunkError(error?.message);
  // Decided once per error: still retrying automatically, or out of retries.
  const [updating] = useState(() => chunkError && staleReloadsLeft());

  // If a stale-chunk error reaches the boundary (didn't fire vite:preloadError),
  // reload automatically to recover onto the new build.
  useEffect(() => { if (chunkError) reloadForStaleChunk(); }, [chunkError]);

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

  if (updating) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="text-center">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm font-medium text-foreground">Updating Polaris to the latest version…</p>
          <p className="mt-1 text-xs text-muted-foreground">This takes a few seconds.</p>
        </div>
      </div>
    );
  }

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

/**
 * Start-up timing probe for the client portal (temporary diagnostic).
 *
 * The portal can look ready but not respond to clicks for a while on a first
 * load. For the first 30s of the page this records the main-thread long tasks,
 * how long each early click waited before its handler ran, and when the portal
 * reached each stage (perfMark), then posts it once per browser session to
 * /api/portal/perf, which files it in client_logs (source "portal-perf").
 */
import { portalFetch } from "./portal-fetch";

const marks: Array<[string, number]> = [];
let started = false;

const now = () => Math.round(performance.now());

/** Note that the portal reached a point (stage change, data loaded, nav click…). */
export function perfMark(name: string) {
  if (typeof window === "undefined" || marks.length >= 80) return;
  marks.push([name, now()]);
}

export function startPortalPerfProbe() {
  if (typeof window === "undefined" || started) return;
  started = true;
  try { if (sessionStorage.getItem("polaris.portalPerf")) return; } catch { return; }

  const long: Array<[number, number]> = []; // [start ms, duration ms]
  const inputs: Array<[string, number, number, number]> = []; // [event, start, wait before handler, total]
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) if (long.length < 60) long.push([Math.round(e.startTime), Math.round(e.duration)]);
    }).observe({ type: "longtask", buffered: true });
  } catch { /* not supported */ }
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries() as any[]) {
        if (inputs.length < 40 && ["pointerdown", "mousedown", "click", "keydown"].includes(e.name)) {
          inputs.push([e.name, Math.round(e.startTime), Math.round(e.processingStart - e.startTime), Math.round(e.duration)]);
        }
      }
    }).observe({ type: "event", buffered: true, durationThreshold: 16 } as PerformanceObserverInit);
  } catch { /* not supported */ }

  setTimeout(() => {
    try { sessionStorage.setItem("polaris.portalPerf", "1"); } catch { /* private mode */ }
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    const scripts = performance.getEntriesByType("resource").filter((r) => r.name.endsWith(".js")) as PerformanceResourceTiming[];
    void portalFetch("/api/portal/perf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        marks, long, inputs,
        nav: nav ? { ttfb: Math.round(nav.responseStart), dcl: Math.round(nav.domContentLoadedEventEnd), load: Math.round(nav.loadEventEnd), type: nav.type } : null,
        scripts: { count: scripts.length, kb: Math.round(scripts.reduce((s, r) => s + (r.transferSize || 0), 0) / 1024), lastEnd: Math.round(Math.max(0, ...scripts.map((r) => r.responseEnd))) },
        url: window.location.href,
      }),
    }).catch(() => { /* diagnostics never break the portal */ });
  }, 30_000);
}

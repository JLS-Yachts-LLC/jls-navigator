// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// Build id is written by scripts/generate-changelog.mjs (runs before every
// dev/build) to public/version.json. Inject it as __BUILD_ID__ so the running
// bundle can compare itself against the deployed /version.json (DeployWatcher).
function buildId(): string {
  try {
    const p = resolve(dirname(fileURLToPath(import.meta.url)), "public/version.json");
    return JSON.parse(readFileSync(p, "utf8")).buildId ?? "dev";
  } catch {
    return "dev";
  }
}

// The Anthropic SDK's `internal/node` pulls in Node's stream/util/fs for its file-tool helpers, which we never use (only the
// plain messages API). Bundled for the Worker it becomes a module that throws "stream is not defined" the moment it loads, and
// the bundler can place it in a file that every Client Portal API route imports — which took the portal's data routes down.
// Use the SDK's own browser stand-in (the package.json `browser` field says to) so nothing Node-only is evaluated.
function anthropicNodeShimOff() {
  return {
    name: "anthropic-sdk-no-node-shim",
    enforce: "pre" as const,
    async resolveId(this: any, source: string, importer: string | undefined, options: any) {
      if (!/internal\/node(\.mjs)?$/.test(source) || !importer || !/@anthropic-ai[\\/]sdk/.test(importer)) return null;
      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
      if (!resolved || !/@anthropic-ai[\\/]sdk[\\/]internal[\\/]node\.mjs$/.test(resolved.id)) return null;
      return resolved.id.replace(/node\.mjs$/, "node.browser.mjs");
    },
  };
}

export default defineConfig({
  vite: {
    define: { __BUILD_ID__: JSON.stringify(buildId()) },
    plugins: [anthropicNodeShimOff()],
  },
});
